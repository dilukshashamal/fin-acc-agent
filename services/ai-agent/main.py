import os
import json
import uuid
import asyncio
from typing import Optional
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis.asyncio as aioredis
from tasks.agent_tasks import run_research_agent

app = FastAPI(title="AI Agent & Retrieval Service", version="1.0.0")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# In-memory mock database for conversations (for MVP simplicity)
CONVERSATIONS_DB = {}

class MessageRequest(BaseModel):
    question: str
    tenant_id: str

class IngestRequest(BaseModel):
    document_name: str
    content: str
    tenant_id: str

@app.get("/api/v1/agent/health")
def health_check():
    return {"status": "healthy", "service": "ai-agent"}

@app.post("/api/v1/agent/conversations")
def create_conversation(tenant_id: str):
    conv_id = str(uuid.uuid4())
    CONVERSATIONS_DB[conv_id] = {
        "id": conv_id,
        "tenant_id": tenant_id,
        "messages": []
    }
    return CONVERSATIONS_DB[conv_id]

@app.post("/api/v1/agent/conversations/{conversation_id}/messages")
def post_message(conversation_id: str, payload: MessageRequest):
    # Verify conversation exists (or create on the fly for smooth dev flow)
    if conversation_id not in CONVERSATIONS_DB:
        CONVERSATIONS_DB[conversation_id] = {
            "id": conversation_id,
            "tenant_id": payload.tenant_id,
            "messages": []
        }
    
    message_id = str(uuid.uuid4())
    
    # Store user query in our in-memory DB
    CONVERSATIONS_DB[conversation_id]["messages"].append({
        "id": message_id,
        "role": "user",
        "content": payload.question
    })

    # Trigger Celery Task asynchronously
    run_research_agent.delay(
        tenant_id=payload.tenant_id,
        conversation_id=conversation_id,
        message_id=message_id,
        question=payload.question
    )

    return {
        "status": "queued",
        "message_id": message_id,
        "conversation_id": conversation_id
    }

@app.get("/api/v1/agent/conversations/{conversation_id}/stream")
async def stream_conversation(conversation_id: str, request: Request):
    """Subscribes to Redis pub/sub for this conversation and streams events to the browser."""
    async def event_generator():
        client = aioredis.from_url(REDIS_URL)
        pubsub = client.pubsub()
        channel = f"stream:{conversation_id}"
        await pubsub.subscribe(channel)
        
        try:
            while True:
                # Check for client disconnects
                if await request.is_disconnected():
                    break
                
                # Fetch message with timeout
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is not None:
                    data_str = message["data"].decode("utf-8")
                    yield f"data: {data_str}\n\n"
                    
                    # Close the stream when we get terminal events
                    payload = json.loads(data_str)
                    if payload.get("event") in ("done", "error"):
                        break
                else:
                    # Send a keep-alive ping to keep proxy connection alive
                    yield ": ping\n\n"
                
                # Yield control to prevent CPU blocking
                await asyncio.sleep(0.02)
                
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'data': {'error': str(e)}})}\n\n"
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await client.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
