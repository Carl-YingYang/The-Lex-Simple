import chromadb
import uuid
from rag.embedder import get_embedding

# 🆕 IMPORT NG CENTRALIZED CONFIG
from core.config import settings

# Gumagamit tayo ng PersistentClient para kahit mamatay ang server, 
# nandiyan pa rin ang mga na-save nating batas at contracts.
# 🆕 GUMAMIT NG SETTINGS PATH
chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PATH)

# Ito yung parang "folder" sa loob ng database natin
collection = chroma_client.get_or_create_collection(name="lex_collection")

def add_to_vector_db(text_chunk: str, metadata: dict):
    """
    Kino-convert ang text at isine-save sa ChromaDB kasama ang source metadata nito.
    """
    vector = get_embedding(text_chunk)
    chunk_id = str(uuid.uuid4())
    
    collection.add(
        ids=[chunk_id],
        embeddings=[vector],
        documents=[text_chunk],
        metadatas=[metadata]
    )
    return chunk_id

def query_vector_db(query_text: str, n_results: int = 3):
    """
    Hinahanap sa database ang mga clauses o definitions na pinakamalapit sa ini-scan ng user.
    """
    query_vector = get_embedding(query_text)
    
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=n_results
    )
    return results