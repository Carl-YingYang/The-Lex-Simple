"""Task P1.1 tests: fallback JSON-format guard sa services/llm_providers.py.

Bug na sinasaklaw: kapag nag-failover sa fallback provider at ang fallback
model ay hindi gpt-oss, ang response_format (json_schema/json_object) na
ginagamit ng analysis path ay tinatanggal bago ang tawag. Ang ibang
provider ay nagbabalik ng 400 sa hindi suportadong response_format, at ang
400 ay hindi nagfa-failover — kaya isang hindi suportadong response_format
ang sapat para mabigo ang buong analysis kahit gumagana ang fallback.

Run (mula sa LexSimpleBackend folder):
    python -m pytest test/test_fallback_json_guard.py -q
"""

import httpx
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from openai import APITimeoutError

from services import llm_providers
from services.llm_providers import chat_completion, reset_providers_for_tests


_PROVIDER_ENV_KEYS = (
    "GROQ_API_KEY", "GROQ_BASE_URL", "GROQ_CHAT_MODEL",
    "GROQ_EXTRACT_MODEL", "GROQ_EXPLAIN_MODEL",
    "LLM_FALLBACK_NAME", "LLM_FALLBACK_BASE_URL",
    "LLM_FALLBACK_API_KEY", "LLM_FALLBACK_CHAT_MODEL",
    "LLM_FALLBACK_EXTRACT_MODEL", "LLM_FALLBACK_EXPLAIN_MODEL",
    "LLM_FALLBACK_ALLOW_USER_DATA",
)


class FallbackJsonGuardTestCase(unittest.TestCase):
    """Malinis ang env bawat test + reset ang module state."""

    def setUp(self):
        self._env_backup = dict(os.environ)
        for key in _PROVIDER_ENV_KEYS:
            os.environ.pop(key, None)
        os.environ["GROQ_API_KEY"] = "test-primary-key"
        reset_providers_for_tests()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env_backup)
        reset_providers_for_tests()

    def _enable_fallback(self, model="meta/llama-3.3-70b-instruct"):
        os.environ["LLM_FALLBACK_NAME"] = "nvidia"
        os.environ["LLM_FALLBACK_BASE_URL"] = "https://fallback.test/v1"
        os.environ["LLM_FALLBACK_API_KEY"] = "test-fallback-key"
        os.environ["LLM_FALLBACK_CHAT_MODEL"] = model
        os.environ["LLM_FALLBACK_EXTRACT_MODEL"] = model
        os.environ["LLM_FALLBACK_EXPLAIN_MODEL"] = model
        os.environ["LLM_FALLBACK_ALLOW_USER_DATA"] = "true"


def _fake_client(reply_text="ok", error=None):
    captured = {"create_calls": 0, "kwargs": None}

    def fake_create(**kwargs):
        captured["create_calls"] += 1
        captured["kwargs"] = kwargs
        if error is not None:
            raise error
        return SimpleNamespace(
            model=kwargs.get("model"),
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=reply_text),
                    finish_reason="stop",
                )
            ],
        )

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create)),
    )
    return client, captured


_REQUEST = httpx.Request(
    "POST", "https://provider.test/v1/chat/completions"
)


def _json_schema_kwargs():
    return {
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "legal_chunk_analysis",
                "strict": True,
                "schema": {"type": "object"},
            },
        }
    }


class PrimaryKeepsResponseFormatTests(FallbackJsonGuardTestCase):
    def test_primary_gpt_oss_keeps_json_schema(self):
        """Primary (default gpt-oss-120b) — WALANG pagbabago sa kwargs."""
        client, captured = _fake_client()
        with patch.object(
            llm_providers, "_get_client", return_value=client
        ):
            chat_completion(
                [{"role": "user", "content": "x"}],
                purpose="analysis",
                temperature=0.0,
                **_json_schema_kwargs(),
            )
        self.assertEqual(captured["create_calls"], 1)
        self.assertIn("response_format", captured["kwargs"])
        self.assertEqual(
            captured["kwargs"]["response_format"]["type"], "json_schema"
        )


class FallbackStripsResponseFormatTests(FallbackJsonGuardTestCase):
    """Sa totoong daloy, ang fallback ay sinaserve lamang pagkatapos
    mag-fail ang primary (provider-side error) — kaya sa mga test na ito,
    nag-timeout muna ang primary bago sinuri ang mga kwargs ng fallback."""

    def _run_failover(self, fallback_model, response_format):
        self._enable_fallback(model=fallback_model)

        primary_client, primary_captured = _fake_client(
            error=APITimeoutError(request=_REQUEST)
        )
        fallback_client, fallback_captured = _fake_client()

        clients = {"groq": primary_client, "nvidia": fallback_client}

        def fake_get_client(provider):
            return clients[provider.name]

        with patch.object(
            llm_providers, "_get_client", side_effect=fake_get_client
        ):
            chat_completion(
                [{"role": "user", "content": "x"}],
                purpose="analysis",
                temperature=0.0,
                response_format=response_format,
            )
        return primary_captured, fallback_captured

    def test_fallback_non_oss_model_strips_json_schema(self):
        """Fallback na hindi gpt-oss — tinatanggal ang response_format."""
        primary_captured, fallback_captured = self._run_failover(
            "meta/llama-3.3-70b-instruct", _json_schema_kwargs()["response_format"],
        )
        # Primary: sinubukan nang may response_format (dumaan sa guard nito).
        self.assertEqual(primary_captured["create_calls"], 1)
        self.assertIn("response_format", primary_captured["kwargs"])
        # Fallback: serves nang WALANG response_format.
        self.assertEqual(fallback_captured["create_calls"], 1)
        self.assertNotIn("response_format", fallback_captured["kwargs"])
        self.assertEqual(
            fallback_captured["kwargs"]["model"],
            "meta/llama-3.3-70b-instruct",
        )
        # Ang ibang kwargs ay nananatili.
        self.assertEqual(fallback_captured["kwargs"]["temperature"], 0.0)

    def test_fallback_non_oss_model_strips_json_object(self):
        """Pareho sa json_object na ginagamit ng summary path."""
        _, fallback_captured = self._run_failover(
            "mistralai/mistral-7b-instruct-v0.3",
            {"type": "json_object"},
        )
        self.assertEqual(fallback_captured["create_calls"], 1)
        self.assertNotIn("response_format", fallback_captured["kwargs"])

    def test_fallback_oss_model_keeps_json_schema(self):
        """Fallback na gpt-oss ang model — pinapanatili ang response_format."""
        _, fallback_captured = self._run_failover(
            "openai/gpt-oss-120b", _json_schema_kwargs()["response_format"],
        )
        self.assertEqual(fallback_captured["create_calls"], 1)
        self.assertIn("response_format", fallback_captured["kwargs"])


class FailoverCompletionTests(FallbackJsonGuardTestCase):
    def test_failover_serves_with_fallback_model(self):
        """Ang ibinalik na completion ay galing sa fallback model."""
        self._enable_fallback(model="meta/llama-3.3-70b-instruct")

        primary_client, _ = _fake_client(
            error=APITimeoutError(request=_REQUEST)
        )
        fallback_client, _ = _fake_client()
        clients = {"groq": primary_client, "nvidia": fallback_client}

        def fake_get_client(provider):
            return clients[provider.name]

        with patch.object(
            llm_providers, "_get_client", side_effect=fake_get_client
        ):
            completion = chat_completion(
                [{"role": "user", "content": "x"}],
                purpose="analysis",
                temperature=0.0,
                **_json_schema_kwargs(),
            )
        self.assertEqual(completion.model, "meta/llama-3.3-70b-instruct")

    def test_failover_error_is_timeout(self):
        """Sanity: ang simulated na palya ng primary ay provider-side."""
        error = APITimeoutError(request=_REQUEST)
        self.assertIn(error.__class__.__name__, str(
            [cls.__name__ for cls in llm_providers.PROVIDER_SIDE_ERRORS]
        ))


if __name__ == "__main__":
    unittest.main()