"""Task P1 tests: services/llm_providers.py.

Saklaw:
  - ProviderConfig: primary Groq defaults (backward compatible) + env
    overrides; fallback ay OFF kapag kulang ang env.
  - FAIL CLOSED: hindi kailanman pinapadala ang laman ng user sa fallback
    na hindi "true" ang LLM_FALLBACK_ALLOW_USER_DATA — bilang lang ang
    naka-log (provider_stats skips).
  - Failover: primary -> fallback ISANG beses lang, lang kapag
    provider-side error (timeout, connection, 5xx, 429). Ang 4xx ay
    itinataas agad nang walang failover.
  - Circuit breaker bawat provider: threshold failures -> open (skip) ->
    half_open pagkatapos ng cooldown -> closed sa tagumpay.
  - extra_body (reasoning_effort, include_reasoning) LANG kapag ang model
    ay nagsisimula sa "openai/gpt-oss".
  - Log: provider, purpose, latency, success/fail lang — walang laman ng
    tanong/dokumento sa kahit anong log line.
  - Ang mga EVAL_* env ay hindi binabasa ng server code.

Walang tunay na LLM o network call dito — fake OpenAI clients lang.

Run (mula sa LexSimpleBackend folder):
    python -m pytest test/test_llm_providers.py -q
"""

import httpx
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from openai import (
    APITimeoutError,
    BadRequestError,
    InternalServerError,
    RateLimitError,
)

from services import llm_providers
from services.llm_providers import (
    DEFAULT_GROQ_BASE_URL,
    DEFAULT_MODEL,
    PROVIDER_SIDE_ERRORS,
    chat_completion,
    model_for,
    provider_breaker_state,
    provider_stats,
    reset_providers_for_tests,
)


# ------------------------------------------------------------
# Mga helper: env isolation, fake clients, provider errors
# ------------------------------------------------------------

_PROVIDER_ENV_KEYS = (
    "GROQ_API_KEY", "GROQ_BASE_URL", "GROQ_CHAT_MODEL",
    "GROQ_EXTRACT_MODEL", "GROQ_EXPLAIN_MODEL",
    "LLM_FALLBACK_NAME", "LLM_FALLBACK_BASE_URL",
    "LLM_FALLBACK_API_KEY", "LLM_FALLBACK_CHAT_MODEL",
    "LLM_FALLBACK_EXTRACT_MODEL", "LLM_FALLBACK_EXPLAIN_MODEL",
    "LLM_FALLBACK_ALLOW_USER_DATA",
    "EVAL_BASE_URL", "EVAL_API_KEY", "EVAL_MODEL",
)


class ProviderEnvTestCase(unittest.TestCase):
    """Batayan: malinis ang env bawat test + reset ang module state."""

    def setUp(self):
        self._env_backup = dict(os.environ)
        for key in _PROVIDER_ENV_KEYS:
            os.environ.pop(key, None)
        reset_providers_for_tests()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env_backup)
        reset_providers_for_tests()

    def _enable_fallback(self, allow_user_data="true", name="fb"):
        os.environ["LLM_FALLBACK_NAME"] = name
        os.environ["LLM_FALLBACK_BASE_URL"] = "https://fallback.test/v1"
        os.environ["LLM_FALLBACK_API_KEY"] = "test-fallback-key"
        os.environ["LLM_FALLBACK_CHAT_MODEL"] = "fb-chat"
        os.environ["LLM_FALLBACK_EXTRACT_MODEL"] = "fb-extract"
        os.environ["LLM_FALLBACK_EXPLAIN_MODEL"] = "fb-explain"
        os.environ["LLM_FALLBACK_ALLOW_USER_DATA"] = allow_user_data


def _fake_client(reply_text="ok", error=None):
    """Fake OpenAI client: binibilang ang create calls at nililito ang
    huling kwargs. Kapag may error, ito ang itinataas sa bawat create."""
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


def _provider_error(cls, status=None):
    """Totoong openai SDK error instance (walang network call)."""
    if status is None:
        return APITimeoutError(request=_REQUEST)
    response = httpx.Response(status, request=_REQUEST)
    return cls(f"simulated {status}", response=response, body=None)


def _message(text):
    return {"role": "user", "content": text}


# ------------------------------------------------------------
# 1) ProviderConfig: primary + fallback builders
# ------------------------------------------------------------

class ProviderConfigTests(ProviderEnvTestCase):
    def test_primary_defaults_are_backward_compatible(self):
        provider = llm_providers.build_primary_provider()
        self.assertEqual(provider.name, "groq")
        self.assertEqual(provider.base_url, DEFAULT_GROQ_BASE_URL)
        self.assertEqual(provider.api_key_env, "GROQ_API_KEY")
        self.assertEqual(provider.chat_model, DEFAULT_MODEL)
        self.assertEqual(provider.extract_model, DEFAULT_MODEL)
        self.assertEqual(provider.explain_model, DEFAULT_MODEL)
        # Ang primary ang dating tanging provider — pinayagan ang laman.
        self.assertTrue(provider.allow_user_data)

    def test_primary_env_overrides_are_respected(self):
        os.environ["GROQ_BASE_URL"] = "https://groq-clone.test/v1"
        os.environ["GROQ_CHAT_MODEL"] = "chat-x"
        os.environ["GROQ_EXTRACT_MODEL"] = "extract-x"
        os.environ["GROQ_EXPLAIN_MODEL"] = "explain-x"
        provider = llm_providers.build_primary_provider()
        self.assertEqual(provider.base_url, "https://groq-clone.test/v1")
        self.assertEqual(provider.chat_model, "chat-x")
        self.assertEqual(provider.extract_model, "extract-x")
        self.assertEqual(provider.explain_model, "explain-x")

    def test_fallback_is_off_without_env(self):
        self.assertIsNone(llm_providers.build_fallback_provider())
        # Kahit isang env lang ang kulang — OFF pa rin (walang partial).
        self._enable_fallback()
        os.environ.pop("LLM_FALLBACK_EXTRACT_MODEL")
        self.assertIsNone(llm_providers.build_fallback_provider())
        os.environ.pop("LLM_FALLBACK_API_KEY")
        os.environ["LLM_FALLBACK_EXTRACT_MODEL"] = "fb-extract"
        self.assertIsNone(llm_providers.build_fallback_provider())

    def test_fallback_flag_controls_allow_user_data(self):
        self._enable_fallback(allow_user_data="true")
        self.assertTrue(llm_providers.build_fallback_provider().allow_user_data)
        for value in ("", "0", "false", "hindi"):
            with self.subTest(value=value):
                os.environ["LLM_FALLBACK_ALLOW_USER_DATA"] = value
                self.assertFalse(
                    llm_providers.build_fallback_provider().allow_user_data
                )

    def test_model_for_purpose_mapping(self):
        os.environ["GROQ_CHAT_MODEL"] = "chat-x"
        os.environ["GROQ_EXTRACT_MODEL"] = "extract-x"
        os.environ["GROQ_EXPLAIN_MODEL"] = "explain-x"
        self.assertEqual(model_for("analysis"), "extract-x")
        self.assertEqual(model_for("chat"), "chat-x")
        self.assertEqual(model_for("explain"), "explain-x")
        self.assertEqual(model_for("general"), "chat-x")
        with self.assertRaises(ValueError):
            model_for("embedding")

    def test_eval_envs_are_not_read_by_server_code(self):
        # Kahit naka-set ang mga EVAL_* env, ang server code ay gumagamit
        # pa rin ng GROQ_* config — walang EVAL_ na binabasa dito.
        os.environ["EVAL_BASE_URL"] = "http://eval.test/v1"
        os.environ["EVAL_API_KEY"] = "eval-key"
        os.environ["EVAL_MODEL"] = "eval-model"
        provider = llm_providers.build_primary_provider()
        self.assertEqual(provider.base_url, DEFAULT_GROQ_BASE_URL)
        self.assertEqual(provider.api_key_env, "GROQ_API_KEY")
        self.assertIsNone(llm_providers.build_fallback_provider())


# ------------------------------------------------------------
# 2) chat_completion: validation, routing, extra_body
# ------------------------------------------------------------

class ChatCompletionRoutingTests(ProviderEnvTestCase):
    def test_invalid_purpose_and_messages_are_rejected(self):
        with self.assertRaises(ValueError):
            chat_completion([_message("hi")], purpose="embedding")
        with self.assertRaises(ValueError):
            chat_completion("hindi list", purpose="chat")
        with self.assertRaises(ValueError):
            chat_completion([], purpose="chat")

    def test_model_kwarg_is_rejected(self):
        with self.assertRaises(ValueError):
            chat_completion(
                [_message("hi")], purpose="chat", model="bawal-itoh"
            )

    def test_success_routes_to_primary_and_records_stats(self):
        fake_client, captured = _fake_client(reply_text="sagot")
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ):
            completion = chat_completion(
                [_message("tanong")], purpose="chat", temperature=0.2
            )
        self.assertEqual(completion.choices[0].message.content, "sagot")
        self.assertEqual(captured["kwargs"]["temperature"], 0.2)
        self.assertEqual(captured["create_calls"], 1)
        stats = provider_stats()
        self.assertEqual(stats["calls"].get("groq|chat|ok"), 1)

    def test_purpose_selects_the_provider_model(self):
        os.environ["GROQ_CHAT_MODEL"] = "chat-x"
        os.environ["GROQ_EXTRACT_MODEL"] = "extract-x"
        os.environ["GROQ_EXPLAIN_MODEL"] = "explain-x"
        fake_client, captured = _fake_client()
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ):
            for purpose, expected in (
                ("analysis", "extract-x"),
                ("chat", "chat-x"),
                ("explain", "explain-x"),
                ("general", "chat-x"),
            ):
                with self.subTest(purpose=purpose):
                    chat_completion([_message("hi")], purpose=purpose)
                    self.assertEqual(
                        captured["kwargs"]["model"], expected
                    )

    def test_extra_body_only_for_gpt_oss_models(self):
        for model, expected in (
            ("openai/gpt-oss-120b", True),
            ("openai/gpt-oss-custom-9", True),
            ("llama-3.3-70b-versatile", False),
            ("qwen/qwen3.8-27b", False),
        ):
            with self.subTest(model=model):
                reset_providers_for_tests()
                os.environ["GROQ_CHAT_MODEL"] = model
                fake_client, captured = _fake_client()
                with patch(
                    "services.llm_providers._get_client",
                    return_value=fake_client,
                ):
                    chat_completion([_message("hi")], purpose="chat")
                if expected:
                    self.assertEqual(
                        captured["kwargs"]["extra_body"],
                        {
                            "reasoning_effort": "low",
                            "include_reasoning": False,
                        },
                    )
                else:
                    self.assertNotIn("extra_body", captured["kwargs"])

    def test_missing_api_key_raises_runtime_error(self):
        # Walang _get_client patch: totoong _read_api_key ang tatakbo.
        with self.assertRaises(RuntimeError) as raised:
            chat_completion([_message("hi")], purpose="chat")
        self.assertIn("GROQ_API_KEY", str(raised.exception))


# ------------------------------------------------------------
# 3) Failover: isang beses lang, provider-side errors lang
# ------------------------------------------------------------

class FailoverTests(ProviderEnvTestCase):
    def test_failover_once_on_rate_limit_429(self):
        self._enable_fallback()
        primary, primary_cap = _fake_client(
            error=_provider_error(RateLimitError, 429)
        )
        fallback, fallback_cap = _fake_client(reply_text="galing sa fallback")

        def router(provider):
            return primary if provider.name == "groq" else fallback

        with patch(
            "services.llm_providers._get_client", side_effect=router
        ):
            completion = chat_completion([_message("tanong")], purpose="chat")

        self.assertEqual(
            completion.choices[0].message.content, "galing sa fallback"
        )
        self.assertEqual(primary_cap["create_calls"], 1)
        self.assertEqual(fallback_cap["create_calls"], 1)
        stats = provider_stats()
        self.assertEqual(stats["calls"].get("groq|chat|fail"), 1)
        self.assertEqual(stats["calls"].get("fb|chat|ok"), 1)

    def test_failover_on_timeout_and_5xx(self):
        self._enable_fallback()
        for error in (
            _provider_error(APITimeoutError),               # timeout
            _provider_error(InternalServerError, 500),     # 5xx
            _provider_error(InternalServerError, 503),     # 5xx
        ):
            with self.subTest(error=type(error).__name__):
                reset_providers_for_tests()
                primary, primary_cap = _fake_client(error=error)
                fallback, fallback_cap = _fake_client(reply_text="fb sagot")

                def router(provider):
                    return primary if provider.name == "groq" else fallback

                with patch(
                    "services.llm_providers._get_client",
                    side_effect=router,
                ):
                    completion = chat_completion(
                        [_message("tanong")], purpose="chat"
                    )
                self.assertEqual(
                    completion.choices[0].message.content, "fb sagot"
                )
                self.assertEqual(primary_cap["create_calls"], 1)
                self.assertEqual(fallback_cap["create_calls"], 1)

    def test_fail_closed_fallback_without_flag_is_never_used(self):
        # LLM_FALLBACK_ALLOW_USER_DATA ay walang laman -> FAIL CLOSED:
        # hindi ginagamit ang fallback; bilang lang ang naka-log.
        self._enable_fallback(allow_user_data="")
        primary, primary_cap = _fake_client(
            error=_provider_error(RateLimitError, 429)
        )
        fallback, fallback_cap = _fake_client(reply_text="bawal itong sagot")

        def router(provider):
            return primary if provider.name == "groq" else fallback

        with patch(
            "services.llm_providers._get_client", side_effect=router
        ):
            with self.assertRaises(RateLimitError):
                chat_completion([_message("tanong")], purpose="chat")

        self.assertEqual(primary_cap["create_calls"], 1)
        self.assertEqual(fallback_cap["create_calls"], 0)
        stats = provider_stats()
        self.assertEqual(
            stats["skips"].get("fb|chat|policy_blocked"), 1
        )
        self.assertIsNone(stats["calls"].get("fb|chat|ok"))

    def test_no_failover_on_4xx_client_error(self):
        self._enable_fallback()
        primary, primary_cap = _fake_client(
            error=_provider_error(BadRequestError, 400)
        )
        fallback, fallback_cap = _fake_client(reply_text="bawal itong sagot")

        def router(provider):
            return primary if provider.name == "groq" else fallback

        with patch(
            "services.llm_providers._get_client", side_effect=router
        ):
            with self.assertRaises(BadRequestError):
                chat_completion([_message("tanong")], purpose="chat")

        # Walang failover sa 400 — itinaas agad, hindi na-contact ang
        # fallback, at hindi rin nabibilang sa breaker ng provider.
        self.assertEqual(primary_cap["create_calls"], 1)
        self.assertEqual(fallback_cap["create_calls"], 0)
        stats = provider_stats()
        self.assertIsNone(stats["calls"].get("groq|chat|fail"))
        self.assertIsNone(stats["calls"].get("fb|chat|ok"))

    def test_missing_fallback_config_logs_count_and_raises_primary(self):
        primary, primary_cap = _fake_client(
            error=_provider_error(RateLimitError, 429)
        )
        with patch(
            "services.llm_providers._get_client", return_value=primary
        ):
            with self.assertRaises(RateLimitError):
                chat_completion([_message("tanong")], purpose="chat")
        self.assertEqual(primary_cap["create_calls"], 1)
        stats = provider_stats()
        self.assertEqual(
            stats["skips"].get("fallback|chat|not_configured"), 1
        )

    def test_provider_side_error_classes_are_exactly_the_failover_set(self):
        # Timeout, connection, 5xx, 429 — iisa ang pamilya ng error na
        # pinapayagang mag-failover.
        self.assertIn(APITimeoutError, PROVIDER_SIDE_ERRORS)
        import openai

        self.assertIn(openai.APIConnectionError, PROVIDER_SIDE_ERRORS)
        for status, cls in ((429, RateLimitError), (500, InternalServerError)):
            error = _provider_error(cls, status)
            self.assertIsInstance(error, PROVIDER_SIDE_ERRORS)
        self.assertNotIsInstance(
            _provider_error(BadRequestError, 400), PROVIDER_SIDE_ERRORS
        )


# ------------------------------------------------------------
# 4) Circuit breaker: hiwalay bawat provider
# ------------------------------------------------------------

class CircuitBreakerTests(ProviderEnvTestCase):
    def test_opens_after_threshold_and_skips_provider(self):
        primary, primary_cap = _fake_client(
            error=_provider_error(RateLimitError, 429)
        )
        with patch(
            "services.llm_providers._get_client", return_value=primary
        ) as mock_get_client:
            for _ in range(llm_providers.BREAKER_FAILURE_THRESHOLD):
                with self.assertRaises(RateLimitError):
                    chat_completion([_message("tanong")], purpose="chat")
            self.assertEqual(
                provider_breaker_state("groq"), "open"
            )
            calls_before = mock_get_client.call_count

            # Breaker open: hindi na tumatawag ng client — skip agad.
            with self.assertRaises(RuntimeError):
                chat_completion([_message("tanong")], purpose="chat")
            self.assertEqual(mock_get_client.call_count, calls_before)

        stats = provider_stats()
        self.assertEqual(stats["skips"].get("groq|chat|breaker_open"), 1)

    def test_half_open_after_cooldown_and_closed_on_success(self):
        attempts = {"count": 0}

        def flaky_create(**kwargs):
            attempts["count"] += 1
            if attempts["count"] <= llm_providers.BREAKER_FAILURE_THRESHOLD:
                raise _provider_error(RateLimitError, 429)
            return SimpleNamespace(
                model=kwargs.get("model"),
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(content="balik na"),
                        finish_reason="stop",
                    )
                ],
            )

        flaky_client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(create=flaky_create)
            ),
        )
        with patch(
            "services.llm_providers._get_client",
            return_value=flaky_client,
        ):
            for _ in range(llm_providers.BREAKER_FAILURE_THRESHOLD):
                with self.assertRaises(RateLimitError):
                    chat_completion([_message("hi")], purpose="chat")
            self.assertEqual(provider_breaker_state("groq"), "open")

            # White-box: i-advance ang oras para lumampas ang cooldown
            # (hindi namin kayang maghintay ng 60s sa test).
            breaker = llm_providers._breaker_for("groq")
            breaker._opened_at -= (
                llm_providers.BREAKER_COOLDOWN_SECONDS + 1.0
            )

            completion = chat_completion([_message("hi")], purpose="chat")
            self.assertEqual(
                completion.choices[0].message.content, "balik na"
            )
            self.assertEqual(provider_breaker_state("groq"), "closed")
        self.assertEqual(attempts["count"], 4)

    def test_ready_state_lifecycle(self):
        # Bago ang unang tawag: unknown (ginagamit ng /ready).
        self.assertEqual(provider_breaker_state("groq"), "unknown")
        fake_client, _captured = _fake_client()
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ):
            chat_completion([_message("hi")], purpose="chat")
        self.assertEqual(provider_breaker_state("groq"), "closed")

        # Ang fallback breaker ay hiwalay — wala pa ring tawag doon.
        self.assertEqual(provider_breaker_state("fb"), "unknown")


# ------------------------------------------------------------
# 5) Privacy: walang laman sa log
# ------------------------------------------------------------

class PrivacyLogTests(ProviderEnvTestCase):
    def test_logs_never_contain_message_content(self):
        secret = "LIHIM NA TANONG NG USER 12345"
        fake_client, _captured = _fake_client(reply_text="sagot")
        with patch(
            "services.llm_providers._get_client", return_value=fake_client
        ):
            with self.assertLogs("llm_providers", level="DEBUG") as logs:
                chat_completion([_message(secret)], purpose="chat")
        joined = "\n".join(logs.output)
        self.assertNotIn(secret, joined)
        self.assertIn("provider=groq", joined)
        self.assertIn("purpose=chat", joined)

    def test_failure_logs_contain_only_error_type(self):
        secret = "LIHIM NA TANONG SA PAGKABIGO 67890"
        primary, _cap = _fake_client(
            error=_provider_error(RateLimitError, 429)
        )
        with patch(
            "services.llm_providers._get_client", return_value=primary
        ):
            with self.assertLogs("llm_providers", level="DEBUG") as logs:
                with self.assertRaises(RateLimitError):
                    chat_completion([_message(secret)], purpose="analysis")
        joined = "\n".join(logs.output)
        self.assertNotIn(secret, joined)
        self.assertIn("error=RateLimitError", joined)
        self.assertIn("purpose=analysis", joined)


if __name__ == "__main__":
    unittest.main()
