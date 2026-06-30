import os
from langchain_postgres import PGVector
from langchain_postgres.vectorstores import PGVector
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document

def get_embeddings():
    return OpenAIEmbeddings(
        base_url=os.getenv("AZURE_OPENAI_ENDPOINT", "https://mock"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY", "mock"),
        model=os.getenv("AZURE_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    )

def get_vector_store():
    # The database URL for the vector DB
    connection_string = os.getenv("DATABASE_URL", "postgresql://postgres:password@db:5432/vector_db")
    
    collection_name = "workspace_documents"
    
    # Initialize the PGVector store
    # PGVector will automatically create the table and extension if they don't exist
    vector_store = PGVector(
        embeddings=get_embeddings(),
        collection_name=collection_name,
        connection=connection_string,
        use_jsonb=True,
    )
    return vector_store

def retrieve_chunks(query: str, tenant_id: str, k: int = 5):
    """
    Search the vector store for the most relevant chunks, filtered by tenant_id.
    """
    store = get_vector_store()
    
    # Use metadata filtering to restrict to the tenant's documents
    filter_dict = {"tenant_id": tenant_id}
    
    # Perform similarity search
    try:
        docs = store.similarity_search(query, k=k, filter=filter_dict)
        return docs
    except Exception as e:
        print(f"Vector search failed: {e}")
        # Return empty if the table doesn't exist yet or connection fails
        return []
