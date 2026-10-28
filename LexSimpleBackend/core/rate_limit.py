"""Shared rate limiting for the public AI and feedback endpoints.

Two layers of limits, on purpose:

1. Per-install limits (LIMIT_AI, LIMIT_CHAT, LIMIT_FEEDBACK) key on the
   X-Install-Id header, so every legitimate app install gets its own
   budget. The mobile app generates and stores this ID once per device
   and sends it with every request.

2. A per-IP ceiling (LIMIT_IP_CEILING) is the backstop layer. It exists
   because both layers fail alone:

   - Many Philippine mobile users share one public IP. Carrier-grade NAT
     (Globe, Smart, Dito) places hundreds of subscribers behind a single
     address, so a strict per-IP limit alone would lock out innocent
     users who happen to sit in the same CGNAT pool.
   - The install ID is client-controlled: an attacker can invent a fresh
     X-Install-Id for every request and never trip a per-ID limit. Only
     the per-IP ceiling still applies to that kind of traffic.

So the per-ID limits keep normal multi-user traffic flowing behind
shared IPs, while the per-IP ceiling caps how much any single address -
honest CGNAT household or ID-rotating attacker - can push in total.

A request without a valid X-Install-Id (missing, or not matching
INSTALL_ID_PATTERN) falls back to the IP key, so plain API clients get
the per-IP treatment instead of the more generous install budget.

storage_uri="memory://" keeps counters in process memory. Like the
orchestrator's in-memory analysis cache, counters reset on restart and
are not shared across uvicorn workers; each worker enforces its own.
"""

import os
import re

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

INSTALL_ID_PATTERN = r"^[A-Za-z0-9_-]{16,64}$"

LIMIT_AI = os.getenv("RATE_LIMIT_AI", "10/minute;100/hour")
LIMIT_CHAT = os.getenv("RATE_LIMIT_CHAT", "20/minute;300/hour")
LIMIT_FEEDBACK = os.getenv("RATE_LIMIT_FEEDBACK", "3/minute;10/hour")
LIMIT_IP_CEILING = os.getenv("RATE_LIMIT_IP_CEILING", "60/minute")


def client_ip_key(request: Request) -> str:
    return f"ip:{get_remote_address(request)}"


def install_or_ip_key(request: Request) -> str:
    value = request.headers.get("X-Install-Id", "")
    if value and re.fullmatch(INSTALL_ID_PATTERN, value):
        return f"id:{value}"
    return client_ip_key(request)


limiter = Limiter(
    key_func=install_or_ip_key,
    storage_uri="memory://",
    headers_enabled=False,
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Masyadong maraming request. Subukan ulit mamaya."},
    )