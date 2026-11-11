"""Task LX1 tests: Lexie identity guard + UPL boundary sa /chat.

(a) Ang mga tanong tungkol sa sarili ("sino ka?", "anong model ka?",
    "abogado ka ba?", "legal advice ba ito?") ay dapat sagutin ng
    deterministikong LEXIE_IDENTITY_REPLY — walang LLM call, walang
    model name leak.
(b) Ang normal na tanong (hal. "Ano ang Article 356?") ay hindi dapat
    mahigop ng identity guard.
(c) Ang salitang "legal advice" sa loob ng attachment ay hindi dapat
    mag-trigger; ang tsekrecheck ay sa question lang pagkatapos ng
    "[CURRENT USER QUESTION]" marker.
(d) Sa router: ang identity question ay hindi dapat umabot kahit sa LLM
    client (pareho ng teknik ng test_chat_score_shortcut.py).

Run (mula sa LexSimpleBackend folder):
    python -m pytest test/test_lexie_identity.py -q
o kaya:
    python -m unittest test.test_lexie_identity
"""
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch


def _stub_module(name, **attributes):
    module = types.ModuleType(name)
    for key, value in attributes.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


def _import_or_stub(name, **attributes):
    """Gamitin ang totoong module kung naka-install ito; i-stub lang kapag
    wala (pareho ng teknik ng test_chat_score_shortcut.py)."""
    try:
        return __import__(name, fromlist=["__name__"])
    except ImportError:
        return _stub_module(name, **attributes)


# ------------------------------------------------------------
# I-stub ang mga mabibigat o di-kailangang dependencies para light
# ang import ng api.routers.ai.
# ------------------------------------------------------------

_import_or_stub("docx")
_import_or_stub("fitz")
_import_or_stub("pdfplumber")
_stub_module(
    "db.chroma_store",
    query_vector_db=Mock(
        side_effect=AssertionError(
            "Hindi dapat tumawag ng vector search sa test na ito."
        )
    ),
    add_to_vector_db=Mock(
        side_effect=AssertionError(
            "Hindi dapat tumawag ng vector write sa test na ito."
        )
    ),
    collection=Mock(name="chroma_collection_stub"),
)


def _identity_limit(*_args, **_kwargs):
    def decorator(func):
        return func

    return decorator


_stub_module(
    "core.rate_limit",
    INSTALL_ID_PATTERN=r"[0-9a-f-]{8,64}",
    LIMIT_AI="10/minute",
    LIMIT_CHAT="10/minute",
    LIMIT_IP_CEILING="100/minute",
    client_ip_key=lambda request: "test-ip",
    limiter=SimpleNamespace(limit=_identity_limit),
)

from api.routers.ai import ChatRequest, chat_with_ai
from services.lexie_identity import (
    LEXIE_IDENTITY_REPLY,
    is_identity_question,
    resolve_identity_reply,
)


IDENTITY_QUESTIONS = [
    "sino ka?",
    "Sino po kayo?",
    "cno ka?",
    "who are you",
    "What are you?",
    "what's your name?",
    "ano pangalan mo?",
    "anong model ka?",
    "What model are you?",
    "model mo?",
    "are you a lawyer?",
    "Abogado ka ba?",
    "lawyer ka ba po?",
    "are you human?",
    "tao ka ba?",
    "AI ka ba?",
    "gemini ka ba?",
    "are you gemini?",
    "ikaw ba si Lexie?",
    "kayo po ba ay AI?",
    "legal advice ba ito?",
    "Can you give me legal advice?",
    "pwede mo ba akong bigyan ng legal advice?",
    "need ko ng legal advice",
    "payo ng abogado?",
]

NORMAL_QUESTIONS = [
    "Ano ang Article 356?",
    "Ipaliwanag mo itong lease ko.",
    "Magkano ang multa sa delay ng upa?",
    "ha?",
    "bakit ganon?",
    "Paano ba magpaliwanag ng contract?",
    "Buodin mo ang dokumentong ito.",
]


class LexieIdentityUnitTests(unittest.TestCase):
    """Unit tests sa services/lexie_identity.py."""

    def test_a_identity_questions_get_deterministic_reply(self):
        for question in IDENTITY_QUESTIONS:
            with self.subTest(question=question):
                self.assertTrue(is_identity_question(question))
                self.assertEqual(
                    resolve_identity_reply(question), LEXIE_IDENTITY_REPLY
                )

    def test_a_reply_has_no_model_name_and_no_lawyer_claim(self):
        lowered = LEXIE_IDENTITY_REPLY.lower()
        for forbidden in (
            "llama", "gemini", "gpt", "openai", "google",
            "meta", "groq", "nvidia", "claude",
        ):
            self.assertNotIn(forbidden, lowered)
        self.assertIn("hindi ako abogado", lowered)
        self.assertIn("hindi legal advice", lowered)
        self.assertIn("lexie", lowered)

    def test_b_normal_questions_are_not_identity(self):
        for question in NORMAL_QUESTIONS:
            with self.subTest(question=question):
                self.assertFalse(is_identity_question(question))
                self.assertIsNone(resolve_identity_reply(question))

    def test_b_meaning_of_legal_advice_is_not_identity(self):
        # Tanong tungkol sa KAHULUGAN ng parirala — normal na chat flow
        # ang dapat sumagot, hindi ang canned identity reply.
        self.assertFalse(
            is_identity_question("Ano ang ibig sabihin ng legal advice?")
        )
        self.assertFalse(is_identity_question("What is legal advice?"))
        self.assertIsNone(
            resolve_identity_reply("Ano ang kahulugan ng legal advice?")
        )

    def test_c_attachment_text_does_not_trigger_identity(self):
        # Ang "legal advice" sa loob ng attachment o history ay hindi
        # dapat mahigap — question lang ang tinitingnan.
        message = (
            "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n"
            "DOCUMENT ANALYSIS\n"
            "Gabay sa pag-unawa ito, hindi legal advice.\n"
            "\n[CURRENT USER QUESTION]\n"
            "Buodin mo ito."
        )
        self.assertIsNone(resolve_identity_reply(message))

    def test_c_identity_question_with_attachment_still_caught(self):
        message = (
            "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n"
            "DOCUMENT ANALYSIS\n"
            "Score: 22/100\n"
            "\n[CURRENT USER QUESTION]\n"
            "Abogado ka ba?"
        )
        self.assertEqual(
            resolve_identity_reply(message), LEXIE_IDENTITY_REPLY
        )

    def test_empty_message_is_not_identity(self):
        self.assertFalse(is_identity_question(""))
        self.assertFalse(is_identity_question(None))
        self.assertIsNone(resolve_identity_reply(""))

    def test_no_user_content_is_logged(self):
        # Rule: walang print/log ng laman ng tanong sa module na ito.
        import io
        import contextlib
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            resolve_identity_reply("sino ka? secret123")
        self.assertEqual(buffer.getvalue(), "")


class LexieIdentityRouterTests(unittest.TestCase):
    """Router-level tests: hindi dapat umabot sa LLM ang identity question."""

    def test_d_identity_question_never_reaches_llm(self):
        boom = Mock(
            side_effect=AssertionError(
                "Hindi dapat tumawag ng LLM sa identity question."
            )
        )
        with patch("services.llm_providers._get_client", return_value=boom):
            response = chat_with_ai(
                Mock(),
                ChatRequest(message="sino ka?", history=[]),
            )
        self.assertEqual(response["status"], "success")
        self.assertEqual(response["reply"], LEXIE_IDENTITY_REPLY)

    def test_d_lawyer_question_with_attachment_never_reaches_llm(self):
        boom = Mock(
            side_effect=AssertionError(
                "Hindi dapat tumawag ng LLM sa identity question."
            )
        )
        message = (
            "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n"
            "DOCUMENT ANALYSIS\n"
            "Score: 22/100\n"
            "\n[CURRENT USER QUESTION]\n"
            "legal advice ba ito?"
        )
        with patch("services.llm_providers._get_client", return_value=boom):
            response = chat_with_ai(
                Mock(),
                ChatRequest(message=message, history=[]),
            )
        self.assertEqual(response["status"], "success")
        self.assertEqual(response["reply"], LEXIE_IDENTITY_REPLY)


if __name__ == "__main__":
    unittest.main()