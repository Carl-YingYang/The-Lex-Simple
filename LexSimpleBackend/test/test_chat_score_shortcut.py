"""Task CH2 tests: deterministic na score sagot sa /chat + bagong Lexie
document_only prompt.

(a) "bakit nga ba ganto yung score na binigay sakin?" na may attachment na
    Score: 22/100 -> deterministic na template (hindi SCORE STATUS REASON),
    nakalista ang mga pamagat ng finding.
(b) "bakit walang score?" na may attachment na "Score: Hindi ibinigay" ->
    SCORE STATUS REASON.
(c) "ha?" matapos ang sagot (a) -> hindi na-ulit ang buong template; ang
    LLM call ay may simplification instruction sa system prompt.
(d) walang "algorithm" o kahit anong dagdag na paliwanag ng paraan sa
    deterministic na sagot — eksaktong template ang sukli. (Ang "dami at
    bigat" sa template mismo ang opisyal na paliwanag: pareho ito ng
    static na score explanation sa services/prompts.py at tugma sa
    severity-based scoring ng Task SC1.)

Walang tunay na LLM call sa mga test na ito — mock ang OpenAI client sa
services.llm_providers._get_client (Task P1: doon na kumukuha ang
chat_completion ng client bawat provider). I-stub din ang mga mabibigat na
dependencies bago ang import (pareho ng teknik ng test_pipeline_outcomes.py).

Run (mula sa LexSimpleBackend folder):
    python -m pytest test/test_chat_score_shortcut.py -q
o kaya:
    python -m unittest test.test_chat_score_shortcut
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
    wala. Mahalaga ito para hindi ma-override ang tunay na fitz/docx/
    pdfplumber na ginagamit din ng ibang test (hal. test_knowledge_catalog
    ay tumatawag ng totoong fitz.open())."""
    try:
        return __import__(name, fromlist=["__name__"])
    except ImportError:
        return _stub_module(name, **attributes)


# ------------------------------------------------------------
# I-stub ang mga mabibigat o di-kailangang dependencies para light
# ang import ng api.routers.ai. Ang mga totoong totoo: services.score_chat,
# services.chat_service, at ang router logic sa api.routers.ai.
# ------------------------------------------------------------

_import_or_stub("docx")
_import_or_stub("fitz")
_import_or_stub("pdfplumber")
# Palaging stub ang db.chroma_store: walang chroma call sa mga test na ito,
# at ang test_knowledge_catalog ay may sariling fake na db.chroma_store sa
# setUp nito kaya hindi ito madadamay.
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
# Palaging stub ang core.rate_limit para ang mga limit decorator ay
# identity sa test (deterministikong tawag sa router function).
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
from services import score_chat


# ------------------------------------------------------------
# FIXTURES — ang format ay tugma sa ResultScreen.tsx ng mobile:
# "DOCUMENT ANALYSIS" + "Score: ..." + "SCORE STATUS REASON: ..." +
# "Risk: ..." + "FINDINGS" (entry: "<numero>. <pamagat>" + "Paliwanag:")
# + "MAHAHALAGANG DETALYE" + "BAHAGI NG SANITIZED DOCUMENT TEXT".
# ------------------------------------------------------------

SCORED_ATTACHMENT = (
    "DOCUMENT ANALYSIS\n"
    "Score: 22/100\n"
    "SCORE STATUS REASON: May score mula sa mga na-verify na finding.\n"
    "Status: Nasuri ang nabasang text.\n"
    "Risk: High Risk\n"
    "\n"
    "BUOD NG DOKUMENTO\n"
    "Ipinapakita ng dokumento ang mga tuntunin ng upa at multa.\n"
    "\n"
    "FINDINGS\n"
    "1. Mataas na multa sa delay ng upa\n"
    "Paliwanag: Ang multa ay umabot sa 8% kada araw ng delay.\n"
    "Payo: Kwentahin ang kabuuang multa bago pumirma.\n"
    "Nakitang text: \"Kung hindi nabayaran ang upa sa takdang araw,\n"
    "1. Sisingilin ang multa kada araw ng delay,\n"
    "2. At maaaring isama sa susunod na billing.\"\n"
    "\n"
    "2. Automatikong pag-alis nang walang abiso\n"
    "Paliwanag: Maaaring paalisin ang umupa nang walang nakasulat na abiso.\n"
    "Payo: Hingin ang proseso ng pag-alis.\n"
    "Nakitang text: \"Maaaring ipaalis ang umupa anumang oras.\"\n"
    "\n"
    "3. Walang limit na pagtaas ng upa\n"
    "Paliwanag: Maaaring taasan ang upa anumang oras nang walang limit.\n"
    "Payo: Usapan ang takdang porsyento ng pagtaas.\n"
    "Nakitang text: \"Ang upa ay maaaring tumaas ayon sa kondisyon ng merkado.\"\n"
    "\n"
    "MAHAHALAGANG DETALYE (1 SA RESULTA)\n"
    "1. Buwanang upa: 8,000\n"
    "Paliwanag: Nabanggit ang buwanang halaga ng upa.\n"
    "Nakitang text: \"Ang buwanang upa ay 8,000.\"\n"
    "\n"
    "BAHAGI NG SANITIZED DOCUMENT TEXT\n"
    "Ang umupa ay magbabayad ng upa sa takdang araw."
)

SCORED_MESSAGE = (
    "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n\n"
    + SCORED_ATTACHMENT
    + "\n\n[CURRENT USER QUESTION]\n"
    "bakit nga ba ganto yung score na binigay sakin?"
)

SCORE_STATUS_REASON_VALUE = (
    "May na-verify na findings sa OCR, pero may bahagi ng analysis na hindi "
    "na-verify; hindi kumpleto ang basehan para sa kabuuang score."
)

NO_SCORE_ATTACHMENT = (
    "DOCUMENT ANALYSIS\n"
    "Score: Hindi ibinigay; hindi ibig sabihin na ligtas ang dokumento.\n"
    f"SCORE STATUS REASON: {SCORE_STATUS_REASON_VALUE}\n"
    "Status: Bahagyang natapos ang analysis.\n"
    "Risk: Risky\n"
    "\n"
    "BUOD NG DOKUMENTO\n"
    "Walang naitalang buod.\n"
    "\n"
    "FINDINGS\n"
    "1. Mataas na multa sa delay ng upa\n"
    "Paliwanag: Ang multa ay umabot sa 8% kada araw ng delay.\n"
    "Payo: Kwentahin ang kabuuang multa bago pumirma.\n"
    "Nakitang text: \"Sisingilin ang multa kada araw ng delay.\"\n"
    "\n"
    "BAHAGI NG SANITIZED DOCUMENT TEXT\n"
    "Ang umupa ay magbabayad ng upa sa takdang araw."
)

NO_SCORE_MESSAGE = (
    "[ATTACHED DOCUMENT CONTEXT: scan.pdf]\n\n"
    + NO_SCORE_ATTACHMENT
    + "\n\n[CURRENT USER QUESTION]\n"
    "bakit walang score?"
)

EXPECTED_SCORED_REPLY = (
    "Ang score mo ay 22/100 (High Risk). Nagsisimula ang score sa 100 at "
    "binabawasan ayon sa dami at bigat ng mga clause na nakitang posibleng "
    "mapanganib. May 3 findings sa dokumentong ito:\n"
    "1. Mataas na multa sa delay ng upa\n"
    "2. Automatikong pag-alis nang walang abiso\n"
    "3. Walang limit na pagtaas ng upa\n"
    "Para makita ang bawas ng bawat clause, buksan ang Resulta at i-tap "
    "ang 'Paano nakuha ang score?'. Tantiya lang ito at hindi legal na "
    "hatol o patunay na ligtas o hindi ligtas ang dokumento."
)


def _make_fake_llm_client(reply_text):
    """Fake OpenAI client: walang network, walang tunay na LLM call."""
    captured = {}

    def fake_create(**kwargs):
        captured["messages"] = kwargs["messages"]
        captured["temperature"] = kwargs.get("temperature")
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=reply_text),
                    finish_reason="stop",
                )
            ],
        )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=fake_create),
        ),
    )
    return fake_client, captured


class DeterministicScoreReplyTests(unittest.TestCase):
    """Mga test sa router-level na daloy ng /chat (walang tunay na LLM)."""

    def test_a_score_question_with_score_gets_deterministic_template(self):
        fake_client, _captured = _make_fake_llm_client("dapat hindi ito ang sagot")
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ) as mock_client:
            response = chat_with_ai(
                Mock(),
                ChatRequest(message=SCORED_MESSAGE, history=[]),
            )

        self.assertEqual(response["status"], "success")
        reply = response["reply"]
        # Ang sagot ay ang deterministic na template mula sa attachment...
        self.assertEqual(reply, EXPECTED_SCORED_REPLY)
        self.assertTrue(reply.startswith("Ang score mo ay 22/100 (High Risk)."))
        self.assertIn("May 3 findings sa dokumentong ito:", reply)
        # ...at bawat pamagat ng finding ay nasa sariling linya.
        self.assertIn("1. Mataas na multa sa delay ng upa\n", reply)
        self.assertIn("2. Automatikong pag-alis nang walang abiso\n", reply)
        self.assertIn("3. Walang limit na pagtaas ng upa\n", reply)
        # Hindi ang SCORE STATUS REASON ang sagot kapag may score.
        self.assertNotIn(SCORE_STATUS_REASON_VALUE, reply)
        # Walang LLM call.
        mock_client.assert_not_called()

    def test_b_missing_score_question_gets_score_status_reason(self):
        fake_client, _captured = _make_fake_llm_client("dapat hindi ito ang sagot")
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ) as mock_client:
            response = chat_with_ai(
                Mock(),
                ChatRequest(message=NO_SCORE_MESSAGE, history=[]),
            )

        self.assertEqual(response["status"], "success")
        reply = response["reply"]
        self.assertEqual(reply, SCORE_STATUS_REASON_VALUE)
        self.assertFalse(reply.startswith("Ang score mo ay"))
        mock_client.assert_not_called()

    def test_c_short_confusion_uses_llm_simplification_not_template(self):
        template_reply = score_chat.build_score_summary_reply(SCORED_ATTACHMENT)
        simplified_reply = (
            "Simpleng salita: mababa ang score mo kasi maraming mapanganib "
            "na clause ang nakita sa dokumento. Tingnan ang Resulta para sa "
            "detalye ng bawat isa."
        )
        fake_client, captured = _make_fake_llm_client(simplified_reply)
        history = [
            {
                "role": "user",
                "content": (
                    "[PREVIOUSLY ATTACHED DOCUMENT: lease.pdf]\n"
                    + SCORED_ATTACHMENT
                    + "\n\nUSER MESSAGE:\n"
                    "bakit nga ba ganto yung score na binigay sakin?"
                ),
            },
            {"role": "assistant", "content": template_reply},
        ]

        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ):
            response = chat_with_ai(
                Mock(),
                ChatRequest(message="ha?", history=history),
            )

        reply = response["reply"]
        # Hindi na-ulit ang buong template — ang simpleng paliwanag ang sagot.
        self.assertEqual(reply, simplified_reply)
        self.assertNotIn("Ang score mo ay 22/100", reply)

        # Ang simplification instruction ay nasa system prompt na ipinadala
        # sa LLM, kasama ang bagong Lexie persona.
        system_prompt = captured["messages"][0]["content"]
        self.assertIn("SHORT CONFUSION FOLLOW-UPS", system_prompt)
        self.assertIn("2-3 short sentences", system_prompt)
        self.assertIn("You are Lexie", system_prompt)
        self.assertNotIn("Lex Insight", system_prompt)
        self.assertNotIn("SCORE QUESTIONS", system_prompt)

        # Ang naunang sagot (template) ay nasa history para maipaliwanag
        # ito nang mas simple, at 0.2 ang temperature ng chat na ito.
        self.assertIn(template_reply[:40], captured["messages"][-2]["content"])
        self.assertEqual(captured["messages"][-1]["content"], "ha?")
        self.assertEqual(captured["temperature"], 0.2)

    def test_d_no_algorithm_and_exact_template_in_deterministic_reply(self):
        # Test (d): walang "algorithm" o kahit anong imbentong paraan ng
        # pagkuha ng score sa deterministic na sagot. Pinakamahusay na
        # sugudad: eksaktong tugma ang sagot sa template. Ang "dami at
        # bigat" ay bahagi na ng template (opisyal na paliwanag, tugma sa
        # severity scoring), hindi dagdag na paliwanag.
        reply = score_chat.build_score_summary_reply(SCORED_ATTACHMENT)
        self.assertEqual(reply, EXPECTED_SCORED_REPLY)
        lowered = reply.lower()
        self.assertNotIn("algorithm", lowered)
        self.assertIn("dami at bigat", lowered)


class ScoreShortEdgeCaseTests(unittest.TestCase):
    """Mga unit test sa mga helper ng services/score_chat.py."""

    def test_finding_guard_ignores_numbered_lines_inside_nakitang_text(self):
        titles = score_chat.extract_finding_titles(SCORED_ATTACHMENT)
        self.assertEqual(
            titles,
            [
                "Mataas na multa sa delay ng upa",
                "Automatikong pag-alis nang walang abiso",
                "Walang limit na pagtaas ng upa",
            ],
        )

    def test_mahahalagang_detalye_titles_are_not_counted_as_findings(self):
        # Ang FINDINGS section lang ang binabasa; ang mga numbered na entry
        # sa MAHAHALAGANG DETALYE ay hindi findings.
        self.assertEqual(len(score_chat.extract_finding_titles(SCORED_ATTACHMENT)), 3)

    def test_template_without_list_when_findings_unparseable(self):
        attachment = (
            "DOCUMENT ANALYSIS\n"
            "Score: 64/100\n"
            "SCORE STATUS REASON: May score mula sa mga na-verify na finding.\n"
            "Status: Nasuri ang nabasang text.\n"
            "Risk: Risky\n"
            "\n"
            "BUOD NG DOKUMENTO\n"
            "Walang FINDINGS section ang attachment na ito."
        )
        reply = score_chat.build_score_summary_reply(attachment)
        self.assertTrue(reply.startswith("Ang score mo ay 64/100 (Risky)."))
        self.assertNotIn("sa dokumentong ito:", reply)
        self.assertIn("Para makita ang bawas ng bawat clause", reply)
        self.assertIn("hindi legal na hatol", reply)

    def test_template_without_risk_label_when_risk_line_missing(self):
        attachment = "DOCUMENT ANALYSIS\nScore: 80/100\nStatus: Nasuri ang nabasang text."
        reply = score_chat.build_score_summary_reply(attachment)
        self.assertTrue(reply.startswith("Ang score mo ay 80/100."))

    def test_missing_score_question_without_attachment_uses_fallback(self):
        fake_client, _captured = _make_fake_llm_client("dapat hindi ito ang sagot")
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ) as mock_client:
            response = chat_with_ai(
                Mock(),
                ChatRequest(message="bakit walang score?", history=[]),
            )

        reply = response["reply"]
        self.assertTrue(reply.startswith("Hindi ko makita ang dahilan"))
        self.assertIn("Bakit walang score?", reply)
        mock_client.assert_not_called()

    def test_penalty_question_is_not_hijacked_by_score_handler(self):
        # "ano ibig sabihin ng penalty na 8%?" ay tungkol sa penalty, hindi
        # sa score — dapat document_only LLM ang sumagot, hindi ang
        # deterministic na score template.
        fake_client, captured = _make_fake_llm_client(
            "1. Ang multa na 8% kada araw ay nakalista sa FINDINGS."
        )
        message = (
            "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n\n"
            + SCORED_ATTACHMENT
            + "\n\n[CURRENT USER QUESTION]\n"
            "ano ibig sabihin ng penalty na 8%?"
        )
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ):
            response = chat_with_ai(
                Mock(),
                ChatRequest(message=message, history=[]),
            )

        self.assertNotEqual(response["reply"], EXPECTED_SCORED_REPLY)
        self.assertTrue(captured["messages"])

    def test_phrase_with_score_number_triggers_deterministic_reply(self):
        # "paano nakuha ang 22?" — walang direktang "score" na salita pero
        # ang bilang ay tugma sa score ng attachment.
        message = (
            "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n\n"
            + SCORED_ATTACHMENT
            + "\n\n[CURRENT USER QUESTION]\n"
            "paano nakuha ang 22?"
        )
        reply = score_chat.resolve_score_reply(message, [])
        self.assertIsNotNone(reply)
        self.assertTrue(reply.startswith("Ang score mo ay 22/100 (High Risk)."))

    def test_non_score_question_falls_through_to_normal_flow(self):
        message = (
            "[ATTACHED DOCUMENT CONTEXT: lease.pdf]\n\n"
            + SCORED_ATTACHMENT
            + "\n\n[CURRENT USER QUESTION]\n"
            "I-summarize ito sa simpleng Taglish."
        )
        self.assertIsNone(score_chat.resolve_score_reply(message, []))


if __name__ == "__main__":
    unittest.main()