# services/llm_providers.py
# LLM PROVIDER ROUTING VERSION: 1.0.0 (Task P1)
#
# Isang entry point lang para sa LAHAT ng LLM call ng server
# (analysis, chat, explain, general): chat_completion(messages, purpose).
#
# Mga garantiya ng module na ito:
#   1. FAIL CLOSED — ang laman ng user (tanong o dokumento) ay hindi
#      kailanman ipapadala sa provider na ang allow_user_data ay hindi
#      "true". Ang fallback na walang flag ay hindi ginagamit; bilang
#      lang ang naka-log (tingnan ang _SKIPS).
#   2. Hiwalay na circuit breaker bawat provider (Task H1 design):
#      sunod-sunod na provider-side failures -> open (cooldown) -> skip.
#   3. Failover: primary -> fallback, ISANG beses lang, at lang kapag
#      provider-side error (timeout, connection, 5xx, 429). Ang 4xx na
#      config/request error ay hindi nagfa-failover — itinataas agad.
#   4. extra_body (reasoning_effort, include_reasoning) ay nilalagay LANG
#      kapag ang model name ay nagsisimula sa "openai/gpt-oss".
#   5. Log: provider name, purpose, latency, at success/fail lang. Hindi
#      kailanman naka-log ang laman ng tanong, dokumento, o sagot.
#   6. Ang mga EVAL_* env ay para lang sa eval scripts — hindi binabasa
#      ng server code (wala kahit isang EVAL_ dito).

import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from openai import (
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    OpenAI,
    RateLimitError,
)

PROVIDER_LOGGER = logging.getLogger("llm_providers")

# Pareho ng dating get_ai_client (services/llm_config.py) na timeout at
# retries para backward compatible ang primary provider.
_CLIENT_TIMEOUT_SECONDS = 120.0
_CLIENT_MAX_RETRIES = 2

DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "openai/gpt-oss-120b"

# Task P1: extra_body LANG kapag ganito ang simula ng model name.
OSS_MODEL_PREFIX = "openai/gpt-oss"

# Purpose -> aling model field ng ProviderConfig ang gagamitin.
PURPOSE_MODEL_FIELDS = {
    "analysis": "extract_model",
    "chat": "chat_model",
    "explain": "explain_model",
    "general": "chat_model",
}
VALID_PURPOSES = tuple(PURPOSE_MODEL_FIELDS)

# Failover class lang: timeout, connection, 5xx (InternalServerError),
# at 429 (RateLimitError). Ang ibang error (hal. 400/401/403) ay
# itinataas nang direkta — hindi provider-side ang dahilan.
PROVIDER_SIDE_ERRORS = (
    APITimeoutError,
    APIConnectionError,
    InternalServerError,
    RateLimitError,
)

# Mga dahilan ng pag-skip ng provider bago pa ang attempt.
SKIP_POLICY = "policy_blocked"      # allow_user_data != true (FAIL CLOSED)
SKIP_BREAKER = "breaker_open"       # circuit breaker ay open
SKIP_UNCONFIGURED = "not_configured"  # walang fallback env na nakaset


@dataclass(frozen=True)
class ProviderConfig:
    """Kumpigurasyon ng isang LLM provider.

    Ang api_key_env ay ang PANGALAN ng environment variable na
    naglalaman ng API key (hindi ang key mismo) — binabasa ito nang
    lazy sa bawat unang paggamit, para walang key na nakatago sa memory
    ng config at para gumana ang tests na nagse-set ng env.
    """

    name: str
    base_url: str
    api_key_env: str
    chat_model: str
    extract_model: str
    explain_model: str
    allow_user_data: bool = False

    def model_for(self, purpose: str) -> str:
        """Model name para sa purpose (ValueError kapag hindi valid)."""
        if purpose not in PURPOSE_MODEL_FIELDS:
            raise ValueError(
                "Unknown LLM purpose: " + repr(purpose)
                + ". Valid: " + ", ".join(VALID_PURPOSES)
            )
        return getattr(self, PURPOSE_MODEL_FIELDS[purpose])


def _env_text(name: str, default: str = "") -> str:
    """Value ng env na may strip; default kapag None o walang laman."""
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip()


def _flag_true(value: str) -> bool:
    """Totoo lang kapag 1/true/yes/on (case-insensitive)."""
    return (value or "").strip().casefold() in {"1", "true", "yes", "on"}


def build_primary_provider() -> ProviderConfig:
    """Task P1 primary: ang kasalukuyang Groq setup, backward compatible.

    Pareho ang mga default ng services/llm_config.py, kaya walang
    mababago sa .env kapag walang bagong env na nakaset. Ang primary ay
    pinagkakatiwalaan ng laman ng user (allow_user_data=True) — ito ang
    dating tanging provider.
    """
    return ProviderConfig(
        name="groq",
        base_url=_env_text("GROQ_BASE_URL", DEFAULT_GROQ_BASE_URL),
        api_key_env="GROQ_API_KEY",
        chat_model=_env_text("GROQ_CHAT_MODEL", DEFAULT_MODEL),
        extract_model=_env_text("GROQ_EXTRACT_MODEL", DEFAULT_MODEL),
        explain_model=_env_text("GROQ_EXPLAIN_MODEL", DEFAULT_MODEL),
        allow_user_data=True,
    )


def build_fallback_provider() -> Optional[ProviderConfig]:
    """Task P1 fallback: opsyonal at naka-OFF kapag kulang ang env.

    Naka-ON lang kapag LAHAT ng LLM_FALLBACK_NAME, LLM_FALLBACK_BASE_URL,
    LLM_FALLBACK_API_KEY, at ang tatlong LLM_FALLBACK_*_MODEL ay may
    laman. Kahit kumpleto ang mga iyon, mananatiling FAIL CLOSED ang
    fallback kapag ang LLM_FALLBACK_ALLOW_USER_DATA ay hindi "true" —
    i-skip ito ng chat_completion na may bilang sa log.
    """
    name = _env_text("LLM_FALLBACK_NAME")
    base_url = _env_text("LLM_FALLBACK_BASE_URL")
    api_key_env = "LLM_FALLBACK_API_KEY"
    chat_model = _env_text("LLM_FALLBACK_CHAT_MODEL")
    extract_model = _env_text("LLM_FALLBACK_EXTRACT_MODEL")
    explain_model = _env_text("LLM_FALLBACK_EXPLAIN_MODEL")

    if not (name and base_url and chat_model and extract_model
            and explain_model and os.getenv(api_key_env, "").strip()):
        return None

    return ProviderConfig(
        name=name,
        base_url=base_url,
        api_key_env=api_key_env,
        chat_model=chat_model,
        extract_model=extract_model,
        explain_model=explain_model,
        allow_user_data=_flag_true(
            os.getenv("LLM_FALLBACK_ALLOW_USER_DATA", "")
        ),
    )


def get_active_providers() -> List[ProviderConfig]:
    """[primary] + [fallback kung naka-set]. Binubuo bawat tawag para
    gumalang agad sa pagbabago ng env at para madaling i-mock sa tests."""
    providers: List[ProviderConfig] = [build_primary_provider()]
    fallback = build_fallback_provider()
    if fallback is not None:
        providers.append(fallback)
    return providers


def model_for(purpose: str) -> str:
    """Model ng primary provider para sa isang purpose.

    Ginagamit ng llm_service sa STRICT_JSON_MODELS check at sa cost-log
    fallback. Sa totoong tawag, maaaring ibang provider/model ang
    gumawa kapag nag-failover — ang chat_completion ang LAGI ang
    nagpapasya ng aktwal na model sa runtime.
    """
    return build_primary_provider().model_for(purpose)


# ------------------------------------------------------------
# Circuit breaker (Task H1 design) — hiwalay bawat provider
# ------------------------------------------------------------

BREAKER_FAILURE_THRESHOLD = 3
BREAKER_COOLDOWN_SECONDS = 60.0


class _CircuitBreaker:
    """Simpleng breaker: closed -> open (threshold failures) -> half_open
    (pagkatapos ng cooldown) -> closed (tagumpay) / open (palya ulit).

    Tanging mga provider-side error lang ang binibilang nito; ang 4xx na
    config/request error ay hindi dumadaan dito.
    """

    def __init__(
        self,
        name: str,
        threshold: int = BREAKER_FAILURE_THRESHOLD,
        cooldown_seconds: float = BREAKER_COOLDOWN_SECONDS,
    ):
        self.name = name
        self.threshold = threshold
        self.cooldown_seconds = cooldown_seconds
        self._lock = threading.Lock()
        self._state = "closed"
        self._consecutive_failures = 0
        self._opened_at = 0.0

    def state(self) -> str:
        with self._lock:
            self._refresh()
            return self._state

    def allows_attempt(self) -> bool:
        """True kapag maaari nang subukan (closed o half_open na)."""
        with self._lock:
            self._refresh()
            return self._state in ("closed", "half_open")

    def record_success(self) -> None:
        with self._lock:
            self._state = "closed"
            self._consecutive_failures = 0

    def record_failure(self) -> None:
        with self._lock:
            self._consecutive_failures += 1
            if (
                self._state == "half_open"
                or self._consecutive_failures >= self.threshold
            ):
                self._state = "open"
                self._opened_at = time.monotonic()

    def _refresh(self) -> None:
        """Half-open transition kapag lumipas na ang cooldown.
        Tumatawag lamang habang hawak ang lock."""
        if (
            self._state == "open"
            and time.monotonic() - self._opened_at >= self.cooldown_seconds
        ):
            self._state = "half_open"


_BREAKERS: Dict[str, _CircuitBreaker] = {}
_BREAKERS_LOCK = threading.Lock()


def _breaker_for(provider_name: str) -> _CircuitBreaker:
    with _BREAKERS_LOCK:
        breaker = _BREAKERS.get(provider_name)
        if breaker is None:
            breaker = _CircuitBreaker(provider_name)
            _BREAKERS[provider_name] = breaker
        return breaker


def provider_breaker_state(provider_name: str = "groq") -> str:
    """Estado ng breaker ng isang provider: closed | open | half_open.

    Ginagamit ng /ready (main.py) para sa llm check. "unknown" kapag
    hindi pa nagagawa ang provider (wala pang tawag o breaker).
    """
    with _BREAKERS_LOCK:
        breaker = _BREAKERS.get(provider_name)
    return breaker.state() if breaker is not None else "unknown"


# ------------------------------------------------------------
# Mga bilang (counters) — walang laman, puro marka lang
# ------------------------------------------------------------

_STATS: Dict[str, Dict[str, int]] = {
    "calls": {},
    "skips": {},
}
_STATS_LOCK = threading.Lock()


def _bump(bucket: str, key: str) -> None:
    with _STATS_LOCK:
        _STATS[bucket][key] = _STATS[bucket].get(key, 0) + 1


def provider_stats() -> dict:
    """Kopya ng mga bilang: calls at skips (bilang lang — walang laman).

    Format:
      calls:  {"provider|purpose|ok"|"provider|purpose|fail": n}
      skips:  {"provider|purpose|<skip_reason>": n}
    """
    with _STATS_LOCK:
        return {bucket: dict(items) for bucket, items in _STATS.items()}


# ------------------------------------------------------------
# OpenAI clients (cached bawat provider)
# ------------------------------------------------------------

_CLIENTS: Dict[str, OpenAI] = {}
_CLIENTS_LOCK = threading.Lock()


def _read_api_key(provider: ProviderConfig) -> str:
    """Basahin ang API key mula sa env na tinutukoy ng api_key_env.

    Nagtataas ng RuntimeError kapag walang laman — pareho ng dating
    gawi ng get_ai_client() sa services/llm_config.py.
    """
    api_key = (os.getenv(provider.api_key_env) or "").strip()
    if not api_key:
        raise RuntimeError(
            f"Missing {provider.api_key_env}. "
            "Add it to the backend .env file."
        )
    return api_key


def _get_client(provider: ProviderConfig) -> OpenAI:
    """Cached OpenAI client bawat provider (hindi nago-override ng
    model o base_url sa bawat tawag)."""
    with _CLIENTS_LOCK:
        client = _CLIENTS.get(provider.name)
        if client is None:
            client = OpenAI(
                api_key=_read_api_key(provider),
                base_url=provider.base_url,
                timeout=_CLIENT_TIMEOUT_SECONDS,
                max_retries=_CLIENT_MAX_RETRIES,
            )
            _CLIENTS[provider.name] = client
        return client


def reset_providers_for_tests() -> None:
    """Linisin ang caches/breakers/counters (para lang sa tests)."""
    with _CLIENTS_LOCK:
        _CLIENTS.clear()
    with _BREAKERS_LOCK:
        _BREAKERS.clear()
    with _STATS_LOCK:
        _STATS["calls"].clear()
        _STATS["skips"].clear()


# ------------------------------------------------------------
# extra_body — gpt-oss lang
# ------------------------------------------------------------

def _extra_body_for(model: str) -> Optional[dict]:
    """Task P1: extra_body LANG kapag nagsisimula sa "openai/gpt-oss"."""
    if model.startswith(OSS_MODEL_PREFIX):
        return {"reasoning_effort": "low", "include_reasoning": False}
    return None


# ------------------------------------------------------------
# ANG ISAANG entry point
# ------------------------------------------------------------

def chat_completion(messages, purpose: str, **kwargs):
    """Tawagin ang LLM provider para sa isang purpose.

    messages: list ng {"role", "content"} — ipinapasa nang buo sa
      provider, HINDI kailanman naka-log.
    purpose: "analysis" | "chat" | "explain" | "general".
    **kwargs: ibang OpenAI parameters (temperature, max_tokens,
      response_format, ...). Bawal ang "model" — ang model ay pinipili
      ng provider config batay sa purpose.

    Failover: primary -> fallback nang ISANG beses lang, at lang kapag
    provider-side error (timeout, connection, 5xx, 429). Kung pumalya
    ang lahat ng pwedeng provider, itinataas ang huling error para
    mapanatili ang dating error handling ng mga caller.
    """
    if purpose not in PURPOSE_MODEL_FIELDS:
        raise ValueError(
            "Unknown LLM purpose: " + repr(purpose)
            + ". Valid: " + ", ".join(VALID_PURPOSES)
        )
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages must be a non-empty list.")
    if "model" in kwargs:
        raise ValueError(
            "Do not pass 'model' to chat_completion: the provider config "
            "selects the model for the purpose."
        )

    providers = get_active_providers()
    last_error: Optional[Exception] = None
    attempted_providers = 0  # primary + ISANG failover lang ang pinapayagan

    for provider in providers:
        if attempted_providers >= 2:
            # Task P1: isang failover lang — primary -> fallback tapos
            # tapos na, kahit may pa pang provider sa listahan.
            break

        # FAIL CLOSED: hindi pinapadala ang laman ng user sa provider
        # na hindi pinayagan. Bilang lang ang naka-log.
        if not provider.allow_user_data:
            _bump("skips", f"{provider.name}|{purpose}|{SKIP_POLICY}")
            PROVIDER_LOGGER.warning(
                "llm_call skipped | provider=%s | purpose=%s | reason=%s",
                provider.name, purpose, SKIP_POLICY,
            )
            continue

        breaker = _breaker_for(provider.name)
        if not breaker.allows_attempt():
            _bump("skips", f"{provider.name}|{purpose}|{SKIP_BREAKER}")
            PROVIDER_LOGGER.warning(
                "llm_call skipped | provider=%s | purpose=%s | reason=%s",
                provider.name, purpose, SKIP_BREAKER,
            )
            continue

        model = provider.model_for(purpose)
        request_kwargs = dict(kwargs)
        attempted_providers += 1
        extra_body = _extra_body_for(model)
        if extra_body is not None:
            merged = dict(kwargs.get("extra_body") or {})
            merged.update(extra_body)
            request_kwargs["extra_body"] = merged

        started = time.perf_counter()
        try:
            client = _get_client(provider)
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                **request_kwargs,
            )
        except Exception as error:
            latency_ms = (time.perf_counter() - started) * 1000.0
            provider_side = isinstance(error, PROVIDER_SIDE_ERRORS)
            if provider_side:
                breaker.record_failure()
                _bump("calls", f"{provider.name}|{purpose}|fail")
            PROVIDER_LOGGER.warning(
                "llm_call %s | provider=%s | purpose=%s | latency_ms=%.0f "
                "| error=%s",
                "fail" if provider_side else "error",
                provider.name, purpose, latency_ms, type(error).__name__,
            )
            if not provider_side:
                # 4xx/config/request error: hindi provider-side —
                # itaas agad, walang failover, walang breaker record.
                raise
            last_error = error
            continue

        latency_ms = (time.perf_counter() - started) * 1000.0
        breaker.record_success()
        _bump("calls", f"{provider.name}|{purpose}|ok")
        PROVIDER_LOGGER.info(
            "llm_call ok | provider=%s | purpose=%s | model=%s "
            "| latency_ms=%.0f",
            provider.name, purpose, model, latency_ms,
        )
        return completion

    if last_error is not None:
        if len(providers) < 2:
            # Task P1: walang naka-set na fallback env — bilang lang ang
            # naka-log, walang laman.
            _bump("skips", f"fallback|{purpose}|{SKIP_UNCONFIGURED}")
            PROVIDER_LOGGER.warning(
                "llm_call failover unavailable | purpose=%s | reason=%s",
                purpose, SKIP_UNCONFIGURED,
            )
        # Pinal na: pumalya ang primary at walang nagamit na fallback
        # (disabled, policy-blocked, o breaker-open). Itaas ang orihinal
        # na error ng primary para hindi mabago ang error handling.
        raise last_error
    raise RuntimeError(
        "No LLM provider is available right now "
        "(all skipped by policy or open circuit breaker)."
    )
