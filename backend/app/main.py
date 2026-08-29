from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time

from app.core.config import settings
from app.core.logging import logger
from app.db.postgres import check_postgres_connection
from app.db.neo4j import check_neo4j_connection, close_neo4j_driver
from app.api.health import router as health_router
from app.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown routines."""
    logger.info(f"Starting {settings.APP_NAME} in [{settings.APP_ENV}] mode...")
    
    # Check initial database connectivity (non-blocking warning if down)
    pg_ok, pg_msg = check_postgres_connection()
    if pg_ok:
        logger.info("✓ PostgreSQL connection verified.")
    else:
        logger.warning(f"⚠ PostgreSQL not reachable at startup: {pg_msg}")

    neo_ok, neo_msg = check_neo4j_connection()
    if neo_ok:
        logger.info("✓ Neo4j connection verified.")
    else:
        logger.warning(f"⚠ Neo4j not reachable at startup: {neo_msg}")

    yield

    # Shutdown routine
    logger.info(f"Shutting down {settings.APP_NAME}...")
    close_neo4j_driver()
    logger.info("All database connections closed cleanly.")


app = FastAPI(
    title=settings.APP_NAME,
    description="FastAPI Backend for AI-Powered Interactive Codebase Understanding and Visualization Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure CORS
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Simple request logging middleware."""
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    logger.info(
        f"{request.method} {request.url.path} - Status: {response.status_code} ({process_time:.2f}ms)"
    )
    return response


# Include Root Health Check
app.include_router(health_router, tags=["Health"])

# Include API v1 Router
app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["Root"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
