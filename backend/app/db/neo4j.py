from typing import Generator, Optional, Tuple
from neo4j import GraphDatabase, Driver, Session as Neo4jSession
from app.core.config import settings
from app.core.logging import logger

_neo4j_driver: Optional[Driver] = None


def get_neo4j_driver() -> Driver:
    """Returns or initializes the singleton Neo4j driver."""
    global _neo4j_driver
    if _neo4j_driver is None:
        try:
            _neo4j_driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                max_connection_lifetime=3600,
            )
            logger.info("Neo4j driver initialized.")
        except Exception as exc:
            logger.error(f"Failed to initialize Neo4j driver: {exc}")
            raise
    return _neo4j_driver


def close_neo4j_driver() -> None:
    """Closes the Neo4j driver connection cleanly on shutdown."""
    global _neo4j_driver
    if _neo4j_driver is not None:
        _neo4j_driver.close()
        _neo4j_driver = None
        logger.info("Neo4j driver closed.")


def get_neo4j_session() -> Generator[Neo4jSession, None, None]:
    """FastAPI dependency yielding a Neo4j session."""
    driver = get_neo4j_driver()
    session = driver.session()
    try:
        yield session
    finally:
        session.close()


def check_neo4j_connection() -> Tuple[bool, str]:
    """
    Safely tests connection to Neo4j.
    Returns (is_connected, message).
    """
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run("RETURN 1 AS result")
            record = result.single()
            if record and record["result"] == 1:
                return True, "connected"
        return False, "unexpected query result"
    except Exception as exc:
        logger.warning(f"Neo4j connection check failed: {exc}")
        return False, str(exc)
