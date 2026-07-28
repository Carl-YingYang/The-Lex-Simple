import fitz  # PyMuPDF
import re
import sqlite3
import uuid
import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter
from db.chroma_store import add_to_vector_db
from db.sqlite_store import log_document_chunk

def clean_pdf_text(text: str) -> str:
    text = re.sub(r'---\s*PAGE\s*\d+\s*---', '', text, flags=re.IGNORECASE)
    text = re.sub(r'-\n', '', text)
    text = re.sub(r'(?<=[^\.\;\:\n])\n(?=[a-zA-Z0-9])', ' ', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()

def is_chunk_duplicate(chunk_text: str) -> bool:
    try:
        conn = sqlite3.connect("./lex_metadata.db")
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM documents WHERE chunk_text = ?", (chunk_text,))
        exists = cursor.fetchone() is not None
        conn.close()
        return exists
    except Exception as e:
        print(f"Duplicate Check Error: {e}")
        return False

# =======================================================
# 📚 ORIGINAL DICTIONARY INGESTOR (Walang binago dito)
# =======================================================
def process_pdf(file_path: str, custom_title: str):
    doc = fitz.open(file_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
        
    full_text = clean_pdf_text(full_text)

    pattern = r'(?=\b(?:Section|SECTION|Article|ARTICLE|Sec\.|SEC\.|Art\.|ART\.)\s*\d+)'
    raw_sections = re.split(pattern, full_text)
    
    saved_chunks_count = 0
    duplicates_skipped = 0 
    
    fallback_splitter = RecursiveCharacterTextSplitter(
        chunk_size=900,
        chunk_overlap=100,
        separators=["\n\n", "\n", ". ", " "]
    )
    
    for section_text in raw_sections:
        section_text = section_text.strip()
        if len(section_text) < 15:
            continue 
            
        title_match = re.match(r'^(?:Section|SECTION|Article|ARTICLE|Sec\.|SEC\.|Art\.|ART\.)\s*\d+[a-zA-Z]?', section_text)
        
        if title_match:
            base_title = title_match.group(0).upper().replace('SEC.', 'SECTION').replace('ART.', 'ARTICLE')
        else:
            law_match = re.search(r'(?i)(REPUBLIC ACT NO\.?\s*\d+|PRESIDENTIAL DECREE NO\.?\s*\d+|BATAS PAMBANSA BLG\.?\s*\d+|EXECUTIVE ORDER NO\.?\s*\d+)', section_text[:300])
            if law_match:
                base_title = law_match.group(1).upper()
            else:
                base_title = "DOCUMENT INTRODUCTION" 
        
        if len(section_text) > 1200:
            sub_chunks = re.split(r'(?=\n\s*\([a-zA-Z0-9]\)|\n\s*\d+\.\s|\n\n)', section_text)
            
            for sub in sub_chunks:
                sub = sub.strip()
                if len(sub) > 15:
                    if len(sub) > 1200:
                        micro_chunks = fallback_splitter.split_text(sub)
                        for micro in micro_chunks:
                            final_chunk = f"[{base_title}] {micro.strip()}"
                            
                            if not is_chunk_duplicate(final_chunk):
                                chunk_id = add_to_vector_db(final_chunk, {"source": custom_title})
                                log_document_chunk(custom_title, chunk_id, final_chunk)
                                saved_chunks_count += 1
                            else:
                                duplicates_skipped += 1 
                    else:
                        final_chunk = f"[{base_title}] {sub}"
                        
                        if not is_chunk_duplicate(final_chunk):
                            chunk_id = add_to_vector_db(final_chunk, {"source": custom_title})
                            log_document_chunk(custom_title, chunk_id, final_chunk)
                            saved_chunks_count += 1
                        else:
                            duplicates_skipped += 1
        else:
            final_chunk = f"[{base_title}] {section_text}"
            
            if not is_chunk_duplicate(final_chunk):
                chunk_id = add_to_vector_db(final_chunk, {"source": custom_title})
                log_document_chunk(custom_title, chunk_id, final_chunk)
                saved_chunks_count += 1
            else:
                duplicates_skipped += 1

    print(f"📊 INGESTION REPORT: {saved_chunks_count} new chunks saved. {duplicates_skipped} duplicate chunks skipped.")
    return saved_chunks_count

# =======================================================
# 💼 BAGONG DEDICATED INGESTOR PARA SA LEGAL GUIDES (ISANG BUO)
# =======================================================
def setup_guides_db():
    conn = sqlite3.connect("./lex_guides.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS guides (id TEXT PRIMARY KEY, title TEXT, chunk_text TEXT)''')
    conn.commit()
    conn.close()

def process_guide_pdf(file_path: str, custom_title: str):
    setup_guides_db()
    doc = fitz.open(file_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
        
    full_text = clean_pdf_text(full_text)
    
    # 💡 TINANGGAL NA ANG SPLITTER! ISANG BUONG TEXT NA LANG ANG ISE-SAVE!
    final_text = f"[{custom_title}]\n\n{full_text.strip()}"
    
    chroma_client = chromadb.PersistentClient(path="./chroma_guides_db")
    collection = chroma_client.get_or_create_collection(name="legal_guides")
    
    conn = sqlite3.connect("./lex_guides.db")
    c = conn.cursor()
    
    # I-check kung may nai-save na tayong guide na may parehong title
    c.execute("SELECT id FROM guides WHERE title = ?", (custom_title,))
    existing = c.fetchone()
    
    saved_status = 0
    if not existing:
        chunk_id = str(uuid.uuid4())
        # I-save bilang isang buong document (Walang chunks)
        collection.add(documents=[final_text], metadatas=[{"source": custom_title}], ids=[chunk_id])
        c.execute("INSERT INTO guides (id, title, chunk_text) VALUES (?, ?, ?)", (chunk_id, custom_title, final_text))
        saved_status = 1
    else:
        # Kung nag-exist na (nag-upload ka ulit ng parehong file), i-o-overwrite niya ang lumang data
        old_id = existing[0]
        collection.update(documents=[final_text], metadatas=[{"source": custom_title}], ids=[old_id])
        c.execute("UPDATE guides SET chunk_text = ? WHERE id = ?", (final_text, old_id))
        saved_status = 1
            
    conn.commit()
    conn.close()
    
    # Palaging 1 ang i-re-return niya dahil 1 PDF = 1 Buong View
    print(f"💼 GUIDES INGESTION: 1 FULL DOCUMENT saved for '{custom_title}'.")
    return saved_status