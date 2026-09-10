import os
import shutil
import subprocess
import asyncio
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.logging import logger
from app.db.postgres import SessionLocal
from app.models.repository import Repository
from app.models.analysis_job import AnalysisJob
from app.services.progress import publish_progress


def calculate_dir_stats(path: str) -> tuple[int, int]:
    """
    Calculates the total size in bytes and file count of a directory.
    Returns (total_size_bytes, total_files).
    """
    total_size = 0
    file_count = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total_size += os.path.getsize(fp)
                file_count += 1
            except (OSError, FileNotFoundError):
                continue
    return total_size, file_count


def is_safe_path(base_dir: str, path: str) -> bool:
    """Verifies that the target path does not escape the configured base storage directory."""
    real_base = os.path.realpath(base_dir)
    real_path = os.path.realpath(path)
    return real_path.startswith(real_base)


def cleanup_directory(path: str) -> None:
    """Safely removes a directory tree if it exists."""
    if os.path.exists(path):
        try:
            # Handle read-only files on Windows during deletion
            def remove_readonly(func_ref, p, _):
                try:
                    os.chmod(p, 0o777)
                    func_ref(p)
                except Exception:
                    pass
            shutil.rmtree(path, onerror=remove_readonly)
            logger.info(f"Cleaned up directory: {path}")
        except Exception as exc:
            logger.warning(f"Failed to clean up directory {path}: {exc}")


def execute_clone_task(repository_id: UUID, job_id: UUID, github_url: str, default_branch: str = "main") -> None:
    """
    Background worker task executing safe Git clone, size validation, and status updates.
    Runs with an isolated database session.
    """
    db: Session = SessionLocal()
    target_repo_dir = os.path.join(settings.REPOSITORY_STORAGE_PATH, str(repository_id))
    source_dir = os.path.join(target_repo_dir, "source")

    try:
        logger.info(f"Starting clone for repository={repository_id} from {github_url}")

        # Ensure base storage directory exists
        os.makedirs(settings.REPOSITORY_STORAGE_PATH, exist_ok=True)

        if not is_safe_path(settings.REPOSITORY_STORAGE_PATH, source_dir):
            raise ValueError("Target path escapes repository storage directory")

        # Cleanup any existing directory for this repo ID
        cleanup_directory(target_repo_dir)
        os.makedirs(target_repo_dir, exist_ok=True)

        # 1. Update Job -> CLONING (20%)
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        repo = db.query(Repository).filter(Repository.id == repository_id).first()
        if job:
            job.status = "CLONING"
            job.stage = "Cloning repository from GitHub..."
            job.progress_percent = 20
            db.commit()

        # Emit SSE
        asyncio.run(publish_progress(repository_id, {
            "repository_id": str(repository_id),
            "job_id": str(job_id),
            "status": "CLONING",
            "stage": "Cloning repository from GitHub...",
            "progress_percent": 20,
            "error_message": None,
        }))

        # 2. Execute safe Git clone
        clone_cmd = [
            "git",
            "clone",
            "--depth",
            "1",
            "--single-branch",
            github_url,
            source_dir,
        ]

        logger.debug(f"Running git command: {' '.join(clone_cmd)}")
        result = subprocess.run(
            clone_cmd,
            capture_output=True,
            text=True,
            timeout=settings.GIT_CLONE_TIMEOUT_SECONDS,
            check=False,
        )

        if result.returncode != 0:
            err_output = result.stderr.strip() or result.stdout.strip() or "Git clone process failed"
            logger.warning(f"Git clone failed: {err_output}")
            raise RuntimeError(f"Failed to clone repository: {err_output}")

        # 3. Update Progress -> VALIDATING (70%)
        if job:
            job.progress_percent = 70
            job.stage = "Validating repository size and structure..."
            db.commit()

        asyncio.run(publish_progress(repository_id, {
            "repository_id": str(repository_id),
            "job_id": str(job_id),
            "status": "CLONING",
            "stage": "Validating repository size and structure...",
            "progress_percent": 70,
            "error_message": None,
        }))

        # 4. Check size and file count safeguards
        size_bytes, file_count = calculate_dir_stats(source_dir)
        size_mb = size_bytes / (1024 * 1024)

        if size_mb > settings.MAX_REPOSITORY_SIZE_MB:
            cleanup_directory(target_repo_dir)
            raise ValueError(
                f"Repository size ({size_mb:.1f} MB) exceeds maximum allowed limit of {settings.MAX_REPOSITORY_SIZE_MB} MB"
            )

        if file_count > settings.MAX_REPOSITORY_FILES:
            cleanup_directory(target_repo_dir)
            raise ValueError(
                f"Repository file count ({file_count}) exceeds maximum allowed limit of {settings.MAX_REPOSITORY_FILES} files"
            )

        # 5. Success -> Update DB records (READY / COMPLETED)
        if repo:
            repo.status = "READY"
            repo.local_path = source_dir
            repo.total_files = file_count
            repo.updated_at = func.now()

        if job:
            job.status = "COMPLETED"
            job.stage = "Repository Ingested Successfully"
            job.progress_percent = 100
            job.completed_at = func.now()

        db.commit()
        logger.info(f"Repository {repository_id} successfully cloned and validated ({file_count} files, {size_mb:.2f} MB)")

        # Emit completion SSE
        asyncio.run(publish_progress(repository_id, {
            "repository_id": str(repository_id),
            "job_id": str(job_id),
            "status": "COMPLETED",
            "stage": "Repository Ingested Successfully",
            "progress_percent": 100,
            "error_message": None,
        }))

    except Exception as exc:
        logger.error(f"Error during repository ingestion for {repository_id}: {exc}")
        cleanup_directory(target_repo_dir)

        error_msg = str(exc)
        if repo:
            repo.status = "FAILED"
            repo.updated_at = func.now()

        if job:
            job.status = "FAILED"
            job.stage = "Ingestion Failed"
            job.error_message = error_msg
            job.completed_at = func.now()

        db.commit()

        # Emit failure SSE
        try:
            asyncio.run(publish_progress(repository_id, {
                "repository_id": str(repository_id),
                "job_id": str(job_id),
                "status": "FAILED",
                "stage": "Ingestion Failed",
                "progress_percent": 0,
                "error_message": error_msg,
            }))
        except Exception as sse_err:
            logger.warning(f"Failed to publish failure SSE: {sse_err}")

    finally:
        db.close()
