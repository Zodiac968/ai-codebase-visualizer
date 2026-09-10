import asyncio
import json
from uuid import UUID
from typing import Dict, List, AsyncGenerator
from app.core.logging import logger

# Thread-safe in-memory mapping from repository_id string to list of active subscriber asyncio.Queues
_subscribers: Dict[str, List[asyncio.Queue]] = {}
_lock = asyncio.Lock()


async def publish_progress(repository_id: UUID, event_data: dict) -> None:
    """
    Broadcasts a progress event to all active SSE subscribers for the given repository.
    """
    repo_key = str(repository_id)
    payload = json.dumps(event_data)
    
    async with _lock:
        queues = _subscribers.get(repo_key, [])
        for q in queues:
            await q.put(payload)


async def subscribe_progress(repository_id: UUID, initial_event: dict = None) -> AsyncGenerator[str, None]:
    """
    Async generator that yields Server-Sent Events (SSE) for a repository's analysis progress.
    Terminates cleanly when the job reaches COMPLETED, FAILED, or READY status.
    """
    repo_key = str(repository_id)
    queue: asyncio.Queue = asyncio.Queue()

    async with _lock:
        if repo_key not in _subscribers:
            _subscribers[repo_key] = []
        _subscribers[repo_key].append(queue)

    try:
        # Emit initial state if provided
        if initial_event:
            yield f"event: progress\ndata: {json.dumps(initial_event)}\n\n"
            if initial_event.get("status") in ["COMPLETED", "FAILED", "READY"]:
                yield "event: close\ndata: [DONE]\n\n"
                return

        while True:
            try:
                # Wait for next event with a 15-second timeout for keep-alive comments
                payload_str = await asyncio.wait_for(queue.get(), timeout=15.0)
                event_dict = json.loads(payload_str)
                yield f"event: progress\ndata: {payload_str}\n\n"

                # Check if this is a terminal state
                if event_dict.get("status") in ["COMPLETED", "FAILED", "READY"]:
                    yield "event: close\ndata: [DONE]\n\n"
                    break
            except asyncio.TimeoutError:
                # Send SSE comment to keep connection alive
                yield ": keepalive\n\n"

    except asyncio.CancelledError:
        logger.debug(f"SSE client disconnected for repository {repo_key}")
    finally:
        async with _lock:
            if repo_key in _subscribers and queue in _subscribers[repo_key]:
                _subscribers[repo_key].remove(queue)
                if not _subscribers[repo_key]:
                    del _subscribers[repo_key]
