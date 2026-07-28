from db.chroma_store import query_vector_db
from services.prompts import get_chat_reply_prompt
from services.llm_config import get_ai_client, CHAT_MODEL

def generate_chat_reply(user_msg: str, history: list = None) -> str:
    try:
        search_results = query_vector_db(user_msg, n_results=15)
        
        context_texts = []
        if search_results and search_results['documents']:
            for doc_list in search_results['documents']:
                context_texts.extend(doc_list)
        
        # Kunin ang nakaraang dokumento mula sa history at isingit sa context
        if history:
            for msg in history:
                content = msg.get("content", "")
                if "[PREVIOUSLY ATTACHED DOCUMENT" in content:
                    context_texts.append(f"DOCUMENT FROM PREVIOUS CHAT:\n{content}")

        retrieved_context = "\n---\n".join(context_texts) if context_texts else ""

        prompt = get_chat_reply_prompt(retrieved_context, user_msg)

        messages = []
        if history:
            for msg in history:
                role = "assistant" if msg.get("role") == "ai" else "user"
                messages.append({"role": role, "content": msg.get("content", "")})
        
        messages.append({"role": "user", "content": prompt})

        # 💡 BAGO: Tatawagin na natin ang official OpenAI Client
        client = get_ai_client()
        completion = client.chat.completions.create(
            model=CHAT_MODEL, 
            messages=messages,
            temperature=0.3,
            max_tokens=800
        )

        return completion.choices[0].message.content

    except Exception as e:
        print(f"Chat Service Error: {str(e)}")
        return "Pasensya na, nagkaroon ng error sa AI server. Maaaring nag-i-initialize pa ang model o may traffic. Pakisubukan ulit."