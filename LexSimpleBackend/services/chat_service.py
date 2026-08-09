import re
import sqlite3
from typing import List, Dict, Optional, Any

from db.chroma_store import query_vector_db
from services.prompts import get_chat_reply_prompt
from services.llm_config import get_ai_client, CHAT_MODEL
from core.config import settings


# ============================================================
# CONFIG
# ============================================================

MAX_HISTORY_MESSAGES = 15
VECTOR_RESULTS = 8
MAX_RETRIEVED_CONTEXTS = 12


# ============================================================
# HISTORY
# ============================================================

def normalize_history(
    history: Optional[List[Dict[str, Any]]]
) -> List[Dict[str, str]]:
    """
    Normalize and limit conversation history.

    Keeps only valid user/assistant messages and limits the
    conversation context to the latest 15 messages.

    Supports:
        role="user"
        role="assistant"
        role="ai"
    """

    if not history:
        return []

    normalized: List[Dict[str, str]] = []

    for msg in history:

        if not isinstance(msg, dict):
            continue

        content = msg.get("content")

        if not isinstance(content, str):
            continue

        content = content.strip()

        if not content:
            continue

        role = msg.get("role", "user")

        # Frontend may use "ai"
        if role == "ai":
            role = "assistant"

        if role not in ("user", "assistant"):
            continue

        normalized.append({
            "role": role,
            "content": content
        })

    return normalized[-MAX_HISTORY_MESSAGES:]


# ============================================================
# ARTICLE / SECTION DETECTION
# ============================================================

def extract_legal_reference(text: str) -> Optional[Dict[str, str]]:
    """
    Detect explicit Article / Section references.

    Examples:
        Article 356
        article 3
        Art. 1159
        Section 5
        Sec. 12
    """

    if not text:
        return None

    pattern = re.compile(
        r"\b(article|art\.?|section|sec\.?)\s+"
        r"([0-9]+[a-z]?)\b",
        re.IGNORECASE
    )

    match = pattern.search(text)

    if not match:
        return None

    prefix = match.group(1).lower()
    number = match.group(2)

    if prefix.startswith("sec"):
        kind = "SECTION"
    else:
        kind = "ARTICLE"

    return {
        "kind": kind,
        "number": number,
        "label": f"{kind} {number}"
    }


# ============================================================
# EXACT REFERENCE VALIDATION
# ============================================================

def _contains_exact_reference(
    text: str,
    reference: Dict[str, str]
) -> bool:
    """
    Prevent Article 356 from accidentally matching
    Article 35, Article 3560, etc.
    """

    if not text:
        return False

    kind = reference["kind"]
    number = reference["number"]

    normal_pattern = re.compile(
        rf"\b{re.escape(kind)}\s+{re.escape(number)}\b",
        re.IGNORECASE
    )

    bracket_pattern = re.compile(
        rf"\[\s*{re.escape(kind)}\s+{re.escape(number)}\s*\]",
        re.IGNORECASE
    )

    # Also support common abbreviated references.
    if kind == "ARTICLE":
        abbreviated_pattern = re.compile(
            rf"\bArt\.?\s+{re.escape(number)}\b",
            re.IGNORECASE
        )
    else:
        abbreviated_pattern = re.compile(
            rf"\bSec\.?\s+{re.escape(number)}\b",
            re.IGNORECASE
        )

    return bool(
        normal_pattern.search(text)
        or bracket_pattern.search(text)
        or abbreviated_pattern.search(text)
    )


# ============================================================
# EXACT LEGAL DATABASE LOOKUP
# ============================================================

def search_exact_legal_reference(
    reference: Optional[Dict[str, str]]
) -> List[str]:
    """
    Search the SQLite legal database for an explicitly
    requested Article or Section.

    Exact reference lookup is prioritized over semantic search.
    """

    if not reference:
        return []

    number = reference["number"]
    kind = reference["kind"]

    db_path = getattr(
        settings,
        "DB_PATH",
        "./lex_metadata.db"
    )

    print(
        f"[CHAT EXACT] DB PATH: {db_path}"
    )

    print(
        f"[CHAT EXACT] Searching for: "
        f"{kind} {number}"
    )

    results: List[str] = []

    conn = None

    try:

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        cursor = conn.cursor()

        query = """
            SELECT
                chunk_text,
                filename,
                chunk_id
            FROM documents
            WHERE
                chunk_text LIKE ?
                OR chunk_text LIKE ?
                OR chunk_text LIKE ?
            LIMIT 10
        """

        cursor.execute(
            query,
            (
                f"%[{kind} {number}]%",
                f"%{kind} {number}%",
                f"%{kind.lower()} {number}%",
            )
        )

        rows = cursor.fetchall()

        print(
            f"[CHAT EXACT] Candidate rows: {len(rows)}"
        )

        for row in rows:

            chunk_text = row["chunk_text"]

            if not chunk_text:
                continue

            if not _contains_exact_reference(
                chunk_text,
                reference
            ):
                continue

            source = (
                row["filename"]
                or "Philippine Legal Database"
            )

            chunk_id = row["chunk_id"]

            formatted_context = (
                f"SOURCE: {source}\n"
                f"REFERENCE: {reference['label']}\n"
                f"CHUNK ID: {chunk_id}\n"
                f"{chunk_text}"
            )

            if formatted_context not in results:
                results.append(formatted_context)

        print(
            f"[CHAT EXACT] Results found: {len(results)}"
        )

    except sqlite3.OperationalError as e:

        print(
            f"[CHAT EXACT SQLITE ERROR] {e}"
        )

    except Exception as e:

        print(
            f"[CHAT EXACT LOOKUP ERROR] "
            f"{type(e).__name__}: {e}"
        )

    finally:

        if conn is not None:
            conn.close()

    return results


# ============================================================
# CONTEXTUAL QUERY BUILDER
# ============================================================

def build_contextual_query(
    user_msg: str,
    history: List[Dict[str, str]]
) -> str:
    """
    Build a better RAG query for follow-up questions.

    Current user message is always the primary intent.

    Previous conversation is only used to resolve vague
    follow-up questions.
    """

    current = user_msg.strip()

    if not current:
        return ""

    # --------------------------------------------------------
    # Explicit Article / Section reference
    # --------------------------------------------------------

    explicit_ref = extract_legal_reference(current)

    if explicit_ref:

        # IMPORTANT:
        #
        # If the current message explicitly says
        # "Article 365", don't contaminate the query
        # with old conversation topics.

        return current

    # --------------------------------------------------------
    # Detect follow-up questions
    # --------------------------------------------------------

    words = current.split()

    lower_current = current.lower()

    follow_up_indicators = [
        "bakit",
        "paano",
        "ano ibig sabihin",
        "ibig sabihin",
        "may exception",
        "exception",
        "applicable",
        "applicable ba",
        "ganon",
        "ganoon",
        "ganyan",
        "yun",
        "iyon",
        "yan",
        "ito",
        "nun",
        "yon",
        "dito",
        "doon",
        "what if",
        "so",
        "eh",
        "then",
        "example",
        "halimbawa",
    ]

    looks_like_follow_up = (
        len(words) <= 7
        or any(
            indicator in lower_current
            for indicator in follow_up_indicators
        )
    )

    if not looks_like_follow_up:
        return current

    if not history:
        return current

    # --------------------------------------------------------
    # Use recent user messages to resolve vague references.
    # --------------------------------------------------------

    recent_user_messages = [
        msg["content"]
        for msg in history
        if msg.get("role") == "user"
        and msg.get("content")
    ]

    recent_user_messages = recent_user_messages[-4:]

    if not recent_user_messages:
        return current

    context = "\n".join(
        recent_user_messages
    )

    return (
        "LEGAL CONVERSATION CONTEXT:\n"
        f"{context}\n\n"
        "CURRENT USER QUESTION:\n"
        f"{current}"
    )


# ============================================================
# VECTOR SEARCH
# ============================================================

def _extract_vector_documents(
    search_results: Any
) -> List[str]:
    """
    Normalize possible Chroma/vector-search result formats.
    """

    if not search_results:
        return []

    documents = []

    # --------------------------------------------------------
    # Dictionary-style result
    # --------------------------------------------------------

    if isinstance(search_results, dict):

        raw_documents = search_results.get(
            "documents",
            []
        )

        if not raw_documents:
            return []

        if isinstance(raw_documents, list):

            for item in raw_documents:

                if isinstance(item, list):

                    for document in item:

                        if isinstance(document, str):
                            document = document.strip()

                            if document:
                                documents.append(document)

                elif isinstance(item, str):

                    item = item.strip()

                    if item:
                        documents.append(item)

        return documents

    # --------------------------------------------------------
    # List-style fallback
    # --------------------------------------------------------

    if isinstance(search_results, list):

        for item in search_results:

            if isinstance(item, str):

                item = item.strip()

                if item:
                    documents.append(item)

            elif isinstance(item, list):

                for document in item:

                    if isinstance(document, str):

                        document = document.strip()

                        if document:
                            documents.append(document)

    return documents


def search_contextual_rag(
    query: str,
    exact_context: Optional[List[str]] = None
) -> List[str]:
    """
    Run vector search and combine it with exact legal context.
    """

    results: List[str] = list(
        exact_context or []
    )

    if not query:
        return results

    try:

        search_results = query_vector_db(
            query,
            n_results=VECTOR_RESULTS
        )

        vector_documents = _extract_vector_documents(
            search_results
        )

        print(
            f"[CHAT VECTOR] Documents returned: "
            f"{len(vector_documents)}"
        )

        for document in vector_documents:

            if document not in results:
                results.append(document)

    except Exception as e:

        print(
            f"[CHAT VECTOR SEARCH ERROR] "
            f"{type(e).__name__}: {e}"
        )

    return results


# ============================================================
# PREVIOUS DOCUMENT CONTEXT
# ============================================================

def extract_previous_document_context(
    history: List[Dict[str, str]]
) -> List[str]:
    """
    Retrieve previously attached document context from
    conversation history when available.
    """

    contexts: List[str] = []

    for msg in history:

        content = msg.get(
            "content",
            ""
        )

        if not content:
            continue

        if (
            "[PREVIOUSLY ATTACHED DOCUMENT"
            in content
        ):

            contexts.append(
                "DOCUMENT FROM PREVIOUS CHAT:\n"
                + content
            )

        elif (
            "[ATTACHED DOCUMENT CONTEXT:"
            in content
        ):

            contexts.append(
                "DOCUMENT FROM CHAT:\n"
                + content
            )

    return contexts


# ============================================================
# BUILD FINAL RETRIEVED CONTEXT
# ============================================================

def build_retrieved_context(
    retrieved_contexts: List[str]
) -> str:
    """
    Build the final text passed to the system prompt.
    """

    if not retrieved_contexts:
        return ""

    limited_contexts = retrieved_contexts[
        :MAX_RETRIEVED_CONTEXTS
    ]

    return "\n\n---\n\n".join(
        limited_contexts
    )


# ============================================================
# MAIN CHAT FUNCTION
# ============================================================

def generate_chat_reply(
    user_msg: str,
    history: Optional[List[Dict[str, str]]] = None,
    retrieved_context: Optional[str] = None  # 🚀 ADDED TO MATCH ai.py
) -> str:

    try:

        # ====================================================
        # 1. Normalize conversation history
        # ====================================================

        normalized_history = normalize_history(
            history
        )

        print(
            f"[CHAT] History messages: "
            f"{len(normalized_history)}"
        )

        # ====================================================
        # 2. RETRIEVE CONTEXT (Use provided or run internal)
        # ====================================================
        # If ai.py already provided retrieved_context, use it directly.
        # Otherwise, perform the internal retrieval pipeline.
        
        final_context = ""
        
        if retrieved_context and retrieved_context.strip():
            # Context was already generated by ai.py (ChromaDB + SQLite)
            final_context = retrieved_context.strip()
            print("[CHAT] Using pre-retrieved context from router.")
        else:
            # Run internal retrieval
            print("[CHAT] No pre-retrieved context. Running internal retrieval...")
            
            # 2a. Detect explicit Article / Section
            explicit_reference = extract_legal_reference(user_msg)
            if explicit_reference:
                print(f"[CHAT] Explicit legal reference detected: {explicit_reference['label']}")
            else:
                print("[CHAT] No explicit Article/Section reference detected.")

            # 2b. EXACT DATABASE LOOKUP
            exact_context: List[str] = []
            if explicit_reference:
                exact_context = search_exact_legal_reference(explicit_reference)
                print(f"[CHAT] Exact lookup results: {len(exact_context)}")

            # 2c. BUILD RETRIEVAL QUERY
            contextual_query = build_contextual_query(user_msg, normalized_history)
            print("[CHAT] Retrieval query:\n", contextual_query[:1000])

            # 2d. VECTOR RAG
            retrieved_contexts = search_contextual_rag(contextual_query, exact_context)

            # 2e. PREVIOUS ATTACHED DOCUMENTS
            previous_documents = extract_previous_document_context(normalized_history)
            for document in previous_documents:
                if document not in retrieved_contexts:
                    retrieved_contexts.append(document)

            # 2f. BUILD FINAL CONTEXT
            final_context = build_retrieved_context(retrieved_contexts)
            
            print(f"[CHAT] FINAL CONTEXT ITEMS: {len(retrieved_contexts)}")
            print(f"[CHAT] FINAL CONTEXT LENGTH: {len(final_context)} characters")

        # ====================================================
        # 3. BUILD SYSTEM PROMPT
        # ====================================================

        # IMPORTANT: get_chat_reply_prompt() now accepts ONLY retrieved_context
        system_prompt = get_chat_reply_prompt(
            final_context
        )

        # ====================================================
        # 4. BUILD PROPER CONVERSATIONAL MESSAGES
        # ====================================================

        messages: List[Dict[str, str]] = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]

        # Add previous conversation
        for msg in normalized_history:
            messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })

        # Current user message MUST be last.
        messages.append({
            "role": "user",
            "content": user_msg
        })

        print(
            f"[CHAT] Final LLM message count: "
            f"{len(messages)}"
        )

        # ====================================================
        # 5. CALL LLM
        # ====================================================

        client = get_ai_client()

        completion = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=800
        )

        # ====================================================
        # 6. EXTRACT RESPONSE
        # ====================================================

        response = (
            completion
            .choices[0]
            .message
            .content
        )

        if not response:
            return (
                "Pasensya na, walang nabuong sagot "
                "mula sa AI. Pakisubukan ulit."
            )

        return response.strip()

    # ========================================================
    # ERROR HANDLING
    # ========================================================

    except Exception as e:

        print(
            f"[CHAT SERVICE ERROR] "
            f"{type(e).__name__}: {e}"
        )

        return (
            "Pasensya na, nagkaroon ng error sa "
            "AI server. Pakisubukan ulit."
        )