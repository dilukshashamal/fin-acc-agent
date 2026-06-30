# AI Agentic Accounting & Tax Platform

An agentic B2B SaaS system for finance, accounting, and tax professionals. Modeled after Taxxa.ai, this platform integrates a real-time regulatory search index, conversational research capabilities, document extraction and parsing, and a citation verification engine.

## Microservices Architecture

- **api-gateway** (Nginx): Routes traffic to public services and web endpoints.
- **workspace-ops** (Django + DRF): Handles tenancy, membership, database transactions, clients, engagements, and tasks.
- **ai-agent** (FastAPI + LangGraph + Celery): Handles vector searches, document embedding/indexing, LangGraph research workflows, and SSE token streaming.
- **frontend** (React + Vite + TypeScript): Rich workspace UI featuring streaming steps, chat reasoning, and a citation review drawer.

## Running Locally

To boot the entire cluster including PostgreSQL with `pgvector` and Redis:

```bash
docker-compose up --build
```
