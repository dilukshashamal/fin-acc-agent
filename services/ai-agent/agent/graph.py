import os
import json
import time
from typing import TypedDict, List, Dict, Any, Literal
from langgraph.graph import StateGraph, END

# Define the state shape for our LangGraph agent
class AgentState(TypedDict):
    tenant_id: str
    question: str
    current_step: str
    steps_log: List[Dict[str, str]]
    sub_questions: List[str]
    retrieved_chunks: List[Dict[str, Any]]
    draft_answer: str
    verified_answer: str
    citations: List[Dict[str, Any]]
    error: str

# Helper to log steps
def log_step(state: AgentState, step_name: str, message: str) -> AgentState:
    state["current_step"] = step_name
    state["steps_log"].append({
        "timestamp": str(time.time()),
        "step": step_name,
        "message": message
    })
    return state

# Node 1: Router / Intent Classifier
def route_node(state: AgentState) -> Literal["plan", "retrieve"]:
    state = log_step(state, "router", "Analyzing question intent and routing...")
    
    # In a real system, we call a cheap model. Here we mock it.
    question = state["question"].lower()
    if "compare" in question or "and" in question or "how does" in question:
        # Route to planning for complex multi-hop queries
        return "plan"
    return "retrieve"

# Node 2: Planner (for complex queries)
def plan_node(state: AgentState) -> AgentState:
    state = log_step(state, "planner", "Decomposing query into sub-questions...")
    time.sleep(1.0) # Simulate thinking
    
    question = state["question"]
    # Decompose into sub-questions
    state["sub_questions"] = [
        f"Search regulation and standards matching: {question}",
        f"Search client files matching: {question}"
    ]
    state = log_step(state, "planner", f"Planned sub-questions: {state['sub_questions']}")
    return state

# Node 3: Hybrid Retriever
def retrieve_node(state: AgentState) -> AgentState:
    state = log_step(state, "retriever", "Searching regulatory index & tenant private documents...")
    time.sleep(1.5) # Simulate search latency
    
    tenant_id = state["tenant_id"]
    question = state["question"].lower()
    
    # Seed mock document chunks that simulate public & private records
    mock_db = [
        {
            "id": "chunk_ifrs16_1",
            "source": "IFRS 16 - Leases (Paragraph 31)",
            "type": "regulatory",
            "text": "At the commencement date, a lessee shall measure the right-of-use asset at cost. The cost of the right-of-use asset shall comprise the amount of the initial measurement of the lease liability, any lease payments made at or before the commencement date, and any initial direct costs incurred.",
            "relevance_score": 0.95
        },
        {
            "id": "chunk_ifrs16_2",
            "source": "IFRS 16 - Leases (Paragraph 35)",
            "type": "regulatory",
            "text": "If the lease transfers ownership of the underlying asset to the lessee by the end of the lease term, or if the cost of the right-of-use asset reflects that the lessee will exercise a purchase option, the lessee shall depreciate the right-of-use asset from the commencement date to the end of the useful life.",
            "relevance_score": 0.88
        },
        {
            "id": "chunk_vat_eu",
            "source": "EU VAT Directive (Article 58)",
            "type": "regulatory",
            "text": "The place of supply of telecommunications, broadcasting and electronically supplied services to a non-taxable person shall be the place where that person is established, has his permanent address or usually resides.",
            "relevance_score": 0.92
        },
        {
            "id": "chunk_client_audit",
            "source": "Client Audit File - Alpha Manufacturing Corp",
            "type": "tenant_private",
            "text": "Alpha Corp entered into a 5-year lease of factory equipment starting January 1, 2025. Annual lease payments are $100,000. Initial direct transaction costs incurred were $5,000, capitalized under right-of-use asset.",
            "relevance_score": 0.90
        }
    ]
    
    # Filter based on question keywords
    found_chunks = []
    if "lease" in question or "ifrs 16" in question or "ifrs16" in question:
        found_chunks.append(mock_db[0])
        found_chunks.append(mock_db[1])
        if "alpha" in question or "client" in question:
            found_chunks.append(mock_db[3])
    elif "vat" in question or "supply" in question or "eu" in question:
        found_chunks.append(mock_db[2])
    else:
        # Generic fallback
        found_chunks.append(mock_db[0])
        found_chunks.append(mock_db[3])

    state["retrieved_chunks"] = found_chunks
    state = log_step(state, "retriever", f"Retrieved {len(found_chunks)} relevant source document chunks.")
    return state

# Node 4: Synthesizer
def synthesize_node(state: AgentState) -> AgentState:
    state = log_step(state, "synthesizer", "Synthesizing answer grounded in source documents...")
    time.sleep(1.5) # Simulate generation
    
    question = state["question"].lower()
    chunks = state["retrieved_chunks"]
    
    # Formulate answer text referencing chunk IDs
    if "lease" in question or "ifrs 16" in question or "ifrs16" in question:
        answer = (
            "Under **IFRS 16 (Leases)**, a lessee is required to recognize a right-of-use (ROU) asset at cost "
            "at the commencement date [citation:chunk_ifrs16_1]. This cost includes the initial measurement of the lease "
            "liability plus initial direct costs [citation:chunk_ifrs16_1].\n\n"
            "If the lease transfers ownership of the asset by the end of the term, or a purchase option is likely, "
            "the asset is depreciated over its useful life [citation:chunk_ifrs16_2].\n\n"
        )
        if "alpha" in question:
            answer += (
                "Based on the **Alpha Manufacturing Corp** file, their equipment lease starting Jan 1, 2025, capitalizes "
                "the $5,000 transaction costs into the right-of-use asset, which complies with Paragraph 31 requirements [citation:chunk_client_audit]."
            )
    elif "vat" in question or "supply" in question or "eu" in question:
        answer = (
            "According to **Article 58 of the EU VAT Directive**, the place of supply for electronic, telecommunications, "
            "and broadcasting services to non-taxable consumers is the country where the consumer is established or resides [citation:chunk_vat_eu]. "
            "Therefore, VAT must be charged at the rate applicable in the consumer's member state rather than the supplier's state."
        )
    else:
        answer = (
            "Based on the retrieved standards [citation:chunk_ifrs16_1] and client documentation [citation:chunk_client_audit], "
            f"we have analyzed the query: '{state['question']}'. The transactions must be measured at initial cost "
            "comprising lease liability measurements and transaction costs."
        )

    state["draft_answer"] = answer
    state = log_step(state, "synthesizer", "Draft answer formulated with source citations.")
    return state

# Node 5: Citation Validator
def verify_citations_node(state: AgentState) -> AgentState:
    state = log_step(state, "validator", "Auditing citations and validating claims against source text...")
    time.sleep(1.0) # Simulate checking
    
    draft = state["draft_answer"]
    chunks = state["retrieved_chunks"]
    valid_ids = {c["id"] for c in chunks}
    
    # Parse citations like [citation:chunk_id]
    citations = []
    import re
    matches = re.findall(r'\[citation:([a-zA-Z0-9_-]+)\]', draft)
    
    for idx, match_id in enumerate(matches):
        if match_id in valid_ids:
            chunk = next(c for c in chunks if c["id"] == match_id)
            citations.append({
                "citation_index": idx + 1,
                "chunk_id": match_id,
                "source": chunk["source"],
                "text": chunk["text"],
                "confidence": 0.98
            })
        else:
            # Drop citation or flag error if it references a non-existent/hallucinated chunk
            state["error"] = f"Citation validator caught a hallucinated reference: {match_id}"
            state = log_step(state, "validator", f"Warning: Dropped hallucinated citation {match_id}")

    state["citations"] = citations
    state["verified_answer"] = draft
    state = log_step(state, "validator", f"Citation audit complete. Verified {len(citations)} source citations.")
    return state

# Compile the Graph
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("route_node", lambda s: s) # Dummy entry router node
workflow.add_node("plan", plan_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("synthesize", synthesize_node)
workflow.add_node("verify", verify_citations_node)

# Add Edges
workflow.set_entry_point("route_node")

# Conditional Router
workflow.add_conditional_edges(
    "route_node",
    route_node,
    {
        "plan": "plan",
        "retrieve": "retrieve"
    }
)

workflow.add_edge("plan", "retrieve")
workflow.add_edge("retrieve", "synthesize")
workflow.add_edge("synthesize", "verify")
workflow.add_edge("verify", END)

research_agent = workflow.compile()
