from fastapi import APIRouter
from app.core.config import settings
from app.db.postgres import check_postgres_connection
from app.db.neo4j import check_neo4j_connection

router = APIRouter()


@router.get("/health", summary="Health Check and Database Connectivity")
async def health_check():
    """
    Returns system health status and connectivity status for PostgreSQL and Neo4j.
    Does not require authentication.
    """
    pg_ok, pg_msg = check_postgres_connection()
    neo_ok, neo_msg = check_neo4j_connection()

    all_ok = pg_ok and neo_ok

    return {
        "status": "ok" if all_ok else "degraded",
        "app": settings.APP_NAME,
        "version": "0.1.0",
        "environment": settings.APP_ENV,
        "databases": {
            "postgres": "connected" if pg_ok else f"disconnected ({pg_msg})",
            "neo4j": "connected" if neo_ok else f"disconnected ({neo_msg})"
        }
    }
