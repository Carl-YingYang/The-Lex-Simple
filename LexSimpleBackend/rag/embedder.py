from sentence_transformers import SentenceTransformer

# Ito yung model na tatakbo sa loob mismo ng laptop mo (walang internet needed).
# Magda-download ito ng around 400MB sa unang run, tapos mabilis na siya.
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

def get_embedding(text: str) -> list[float]:
    """
    Kino-convert ang text papunta sa vector (numbers) para ma-save sa ChromaDB.
    """
    # I-e-encode niya ang text at ibabalik bilang list ng numbers
    return model.encode(text).tolist()