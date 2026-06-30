import os
import json
import time
import redis
from celery import Celery
from agent.graph import research_agent
from agent.retriever import get_vector_store
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import fitz # PyMuPDF

# Initialize Celery app
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
celery_app = Celery("ai_agent", broker=REDIS_URL, backend=REDIS_URL)

# Configure Celery settings
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Connect to Redis
redis_client = redis.Redis.from_url(REDIS_URL)

@celery_app.task(name="tasks.run_research_agent")
def run_research_agent(tenant_id: str, conversation_id: str, message_id: str, question: str):
    """Executes the LangGraph research agent and publishes events to Redis pub/sub."""
    channel_name = f"stream:{conversation_id}"
    
    def publish_event(event_type: str, data: dict):
        payload = {
            "event": event_type,
            "message_id": message_id,
            "conversation_id": conversation_id,
            "data": data,
            "timestamp": time.time()
        }
        redis_client.publish(channel_name, json.dumps(payload))

    # Send initial event
    publish_event("status", {"step": "router", "message": "Analyzing question routing..."})
    time.sleep(0.5)

    # Initial State for the LangGraph
    initial_state = {
        "tenant_id": tenant_id,
        "question": question,
        "current_step": "started",
        "steps_log": [],
        "sub_questions": [],
        "retrieved_chunks": [],
        "draft_answer": "",
        "verified_answer": "",
        "citations": [],
        "error": ""
    }

    try:
        # Run graph through steps and publish node updates
        current_state = initial_state
        for output in research_agent.stream(initial_state):
            # output is a dictionary mapping node names to state dictionaries
            for node_name, state_update in output.items():
                # Merge update into our local copy
                current_state.update(state_update)
                
                # Fetch last log message
                logs = current_state.get("steps_log", [])
                message = logs[-1]["message"] if logs else f"Executing node {node_name}..."
                step = current_state.get("current_step", node_name)
                
                # Publish status update
                publish_event("status", {
                    "step": step,
                    "message": message
                })
                
                # If we retrieved chunks, send them to the client
                if node_name == "retrieve" and current_state.get("retrieved_chunks"):
                    publish_event("chunks", {
                        "chunks": [
                            {
                                "id": chunk["id"],
                                "source": chunk["source"],
                                "text": chunk["text"],
                                "relevance_score": chunk.get("relevance_score", 1.0)
                            }
                            for chunk in current_state["retrieved_chunks"]
                        ]
                    })
                
                # Short pause between nodes for clean visual progression in the UI
                time.sleep(0.8)

        # Retrieve the final state
        final_state = research_agent.invoke(initial_state)
        verified_answer = final_state.get("verified_answer", "")
        citations = final_state.get("citations", [])

        # Start streaming tokens to simulate writing
        publish_event("status", {"step": "writing", "message": "Formulating final response..."})
        time.sleep(0.5)

        # Split verified answer into small word/token chunks to stream
        words = verified_answer.split(" ")
        for i, word in enumerate(words):
            # Send word with trailing space
            token_text = word + (" " if i < len(words) - 1 else "")
            publish_event("token", {"text": token_text})
            # Adjust speed for organic reading rate (approx 150ms per word)
            time.sleep(0.12)

        # Stream all verified citations
        publish_event("citations", {"citations": citations})
        time.sleep(0.5)

        # Stream done signal with complete payload
        publish_event("done", {
            "answer": verified_answer,
            "citations": citations
        })

    except Exception as e:
        publish_event("error", {"error": str(e)})
        raise e

@celery_app.task(name="tasks.process_document")
def process_document(tenant_id: str, document_id: str, file_path: str):
    """Parses an uploaded document, chunks it, and saves embeddings to pgvector."""
    print(f"Starting ingestion for document {document_id}")
    
    # 1. Read PDF
    text = ""
    try:
        doc = fitz.open(file_path)
        for page in doc:
            text += page.get_text() + "\n"
    except Exception as e:
        print(f"Failed to read PDF: {e}")
        return False

    # 2. Chunk text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    chunks = text_splitter.split_text(text)
    
    # 3. Create LangChain Documents with metadata
    docs = [
        Document(
            page_content=chunk,
            metadata={
                "tenant_id": tenant_id,
                "document_id": document_id,
                "chunk_index": i,
                "source_name": os.path.basename(file_path),
                "chunk_id": f"{document_id}_{i}"
            }
        )
        for i, chunk in enumerate(chunks)
    ]
    
    # 4. Insert into pgvector
    try:
        store = get_vector_store()
        store.add_documents(docs)
        print(f"Successfully ingested {len(docs)} chunks for document {document_id}")
    except Exception as e:
        print(f"Failed to ingest to pgvector: {e}")
        return False
        
    return True

