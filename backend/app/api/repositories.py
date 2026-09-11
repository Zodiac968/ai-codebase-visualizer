import os
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.postgres import get_db
from app.models.user import User
from app.models.repository import Repository
from app.models.analysis_job import AnalysisJob
from app.models.file import FileRecord
from app.schemas.repository import (
    RepositoryImportRequest,
    RepositoryImportResponse,
    RepositoryResponse,
)
from app.schemas.analysis_job import AnalysisJobResponse
from app.schemas.scanner import (
    FileMetadata,
    RepositoryScanResponse,
    FileListResponse,
)
from app.core.security import get_current_user, decode_access_token
from app.core.config import settings
from app.core.logging import logger
from app.services.github import validate_and_parse_github_url
from app.services.clone import execute_clone_task, cleanup_directory
from app.services.progress import subscribe_progress
from app.services.scanner import scan_and_save_repository, classify_file

router = APIRouter(prefix="/repositories", tags=["Repositories"])


@router.post(
    "/import",
    response_model=RepositoryImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Import and clone a public GitHub repository",
)
def import_repository(
    payload: RepositoryImportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validates a public GitHub URL, creates repository and analysis job records,
    and initiates asynchronous repository cloning.
    """
    is_valid, normalized_url, owner, repo_name = validate_and_parse_github_url(payload.github_url)
    if not is_valid or not normalized_url or not repo_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid public GitHub repository URL. Must be in the format: https://github.com/owner/repository",
        )

    # 1. Create Repository record
    new_repo = Repository(
        user_id=current_user.id,
        name=repo_name,
        github_url=normalized_url,
        default_branch=payload.default_branch or "main",
        status="CLONING",
    )
    db.add(new_repo)
    db.flush()

    # 2. Create AnalysisJob record
    new_job = AnalysisJob(
        repository_id=new_repo.id,
        status="CLONING",
        stage="Cloning repository from GitHub...",
        progress_percent=10,
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_repo)
    db.refresh(new_job)

    logger.info(f"Initiated import for repo='{new_repo.name}' (id={new_repo.id}) by user={current_user.email}")

    # 3. Queue asynchronous background cloning task
    background_tasks.add_task(
        execute_clone_task,
        new_repo.id,
        new_job.id,
        normalized_url,
        payload.default_branch or "main",
    )

    return RepositoryImportResponse(
        repository_id=new_repo.id,
        name=new_repo.name,
        status="CLONING",
        job_id=new_job.id,
        message="Repository import and cloning initiated.",
    )


@router.get(
    "",
    response_model=List[RepositoryResponse],
    status_code=status.HTTP_200_OK,
    summary="List all repositories belonging to the authenticated user",
)
def list_repositories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all repositories owned by the current authenticated user.
    """
    repos = (
        db.query(Repository)
        .filter(Repository.user_id == current_user.id)
        .order_by(desc(Repository.created_at))
        .all()
    )
    return [RepositoryResponse.model_validate(r) for r in repos]


@router.get(
    "/{repository_id}",
    response_model=RepositoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get repository details by ID",
)
def get_repository(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns repository metadata if owned by the current user.
    """
    repo = (
        db.query(Repository)
        .filter(Repository.id == repository_id, Repository.user_id == current_user.id)
        .first()
    )
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )
    return RepositoryResponse.model_validate(repo)


@router.get(
    "/{repository_id}/status",
    response_model=AnalysisJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current analysis/import job status",
)
def get_repository_status(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Polls the latest analysis job status for a given repository.
    """
    repo = (
        db.query(Repository)
        .filter(Repository.id == repository_id, Repository.user_id == current_user.id)
        .first()
    )
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.repository_id == repository_id)
        .order_by(desc(AnalysisJob.started_at))
        .first()
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis job not found",
        )

    return AnalysisJobResponse.model_validate(job)


@router.get(
    "/{repository_id}/progress",
    summary="Stream live analysis progress via Server-Sent Events (SSE)",
)
async def stream_repository_progress(
    repository_id: UUID,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Streams real-time Server-Sent Events (SSE) for repository import and analysis progress.
    Supports ?token= query parameter or Authorization Bearer header.
    """
    # Authenticate user from query token if EventSource connects without headers
    user: Optional[User] = None
    if token:
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            try:
                user_id = UUID(payload["sub"])
                user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
            except Exception:
                pass

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid authentication token required",
        )

    # Check repository ownership
    repo = db.query(Repository).filter(Repository.id == repository_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    # Fetch latest job state for initial event
    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.repository_id == repository_id)
        .order_by(desc(AnalysisJob.started_at))
        .first()
    )

    initial_event = None
    if job:
        initial_event = {
            "repository_id": str(repository_id),
            "job_id": str(job.id),
            "status": job.status,
            "stage": job.stage,
            "progress_percent": job.progress_percent,
            "error_message": job.error_message,
        }

    return StreamingResponse(
        subscribe_progress(repository_id, initial_event=initial_event),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/{repository_id}/scan",
    response_model=RepositoryScanResponse,
    status_code=status.HTTP_200_OK,
    summary="Scan repository workspace for source files and language metrics",
)
def scan_repository(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Walks the cloned repository workspace, discovers supported source and config files,
    calculates LOC and size metrics, and stores file metadata in PostgreSQL.
    """
    repo = (
        db.query(Repository)
        .filter(Repository.id == repository_id, Repository.user_id == current_user.id)
        .first()
    )
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    if repo.status != "READY":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Repository cannot be scanned while in '{repo.status}' state. It must be in 'READY' status.",
        )

    try:
        scan_result = scan_and_save_repository(repository_id, db)
        return scan_result
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error(f"Error during repository scan for {repository_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Repository scan failed: {str(exc)}",
        )


@router.get(
    "/{repository_id}/files",
    response_model=FileListResponse,
    status_code=status.HTTP_200_OK,
    summary="List all scanned files for a repository",
)
def list_repository_files(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all scanned files and their metadata for a repository.
    """
    repo = (
        db.query(Repository)
        .filter(Repository.id == repository_id, Repository.user_id == current_user.id)
        .first()
    )
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    file_records = (
        db.query(FileRecord)
        .filter(FileRecord.repository_id == repository_id)
        .order_by(FileRecord.file_path)
        .all()
    )

    # Convert to FileMetadata list
    file_items = []
    for f in file_records:
        filename = os.path.basename(f.file_path)
        _, ext = os.path.splitext(filename)
        is_bin = f.language == "binary"
        lang, is_src, is_cfg = classify_file(filename, ext, is_bin)

        file_items.append(
            FileMetadata(
                relative_path=f.file_path,
                filename=filename,
                extension=ext,
                language=f.language,
                size_bytes=f.size_bytes,
                line_count=f.line_count,
                is_source=is_src,
                is_binary=is_bin,
                is_config=is_cfg,
                sha256_hash=f.sha256_hash,
            )
        )

    return FileListResponse(
        repository_id=repository_id,
        total_files=len(file_items),
        files=file_items,
    )


@router.delete(
    "/{repository_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete repository and its local workspace",
)
def delete_repository(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deletes repository record, associated analysis jobs, and cleans up workspace on disk.
    """
    repo = (
        db.query(Repository)
        .filter(Repository.id == repository_id, Repository.user_id == current_user.id)
        .first()
    )
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    # Clean up local storage directory
    target_repo_dir = os.path.join(settings.REPOSITORY_STORAGE_PATH, str(repository_id))
    cleanup_directory(target_repo_dir)

    db.delete(repo)
    db.commit()
    logger.info(f"Deleted repository {repository_id} ({repo.name}) by user {current_user.email}")
    return None
