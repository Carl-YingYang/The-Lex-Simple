"""Anonymous usage store (Task A1) para sa Lex-Simple backend.

PRIVACY CONTRACT:
- Ang X-Install-Id ng app ay HINDI kailanman ini-store nang plain.
  Bago ito ma-save, dadaan muna sa sha256(INSTALL_ID_SALT + install_id).
- Walang laman ng dokumento, walang OCR text, walang IP address, at
  walang anumang content na naka-log dito — counts at timestamps lang.
- Kapag nagpadala ang app ng header na `X-Analytics: 0`, hindi ito
  tumatabi ng kahit isang row (tingnan din ang middleware sa main.py).
- Ang DB path ay galing sa env (USAGE_DB_PATH) para madaling ilipat sa
  persistent storage.

TABLES:
- installs(install_hash PK, first_seen, last_seen, requests_total)
- daily_usage(install_hash, day, count) — PK (install_hash, day)
"""

import hashlib
import os
import sqlite3
from datetime import datetime, timedelta, timezone

# Ang Pilipinas ay walang DST; fixed UTC+8 para konsistente ang "day"
# boundary kahit nasa ibang timezone ang server.
PHT = timezone(timedelta(hours=8))

USAGE_DB_PATH = os.getenv("USAGE_DB_PATH", "./lex_usage.db")
INSTALL_ID_SALT = os.getenv("INSTALL_ID_SALT", "")

try:
    DAILY_DOC_LIMIT = int(os.getenv("DAILY_DOC_LIMIT", "10"))
except ValueError:
    print("[usage_store] WARNING: invalid DAILY_DOC_LIMIT; using 10.")
    DAILY_DOC_LIMIT = 10

if not INSTALL_ID_SALT.strip():
    print(
        "[usage_store] WARNING: INSTALL_ID_SALT is empty. "
        "Set a random salt in .env so install hashes cannot be guessed."
    )


def hash_install_id(install_id: str) -> str:
    """I-sha256 (salted) ang install id — hindi kailanman plain."""
    return hashlib.sha256(
        (INSTALL_ID_SALT + install_id).encode("utf-8")
    ).hexdigest()


def _ph_now() -> datetime:
    return datetime.now(PHT)


def _ph_today() -> str:
    return _ph_now().strftime("%Y-%m-%d")


def _ph_days_back(days_back: int) -> str:
    return (_ph_now().date() - timedelta(days=days_back)).strftime("%Y-%m-%d")


def usage_reset_at() -> str:
    """ISO timestamp ng susunod na PH midnight (quota reset)."""
    next_day = _ph_now().date() + timedelta(days=1)
    return f"{next_day.isoformat()}T00:00:00+08:00"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(USAGE_DB_PATH, timeout=5)
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_usage_db() -> None:
    conn = _connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS installs (
                install_hash   TEXT PRIMARY KEY,
                first_seen     TEXT NOT NULL,
                last_seen      TEXT NOT NULL,
                requests_total INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_usage (
                install_hash TEXT NOT NULL,
                day          TEXT NOT NULL,
                count        INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (install_hash, day)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_usage_day ON daily_usage(day)"
        )
        conn.commit()
    finally:
        conn.close()


def touch_install(install_id: str) -> None:
    """Upsert ng first_seen/last_seen ng isang install.

    Dapat lang tawagin kapag analytics ON (walang X-Analytics: 0) —
    ginagawa na iyan ng middleware sa main.py.
    """
    install_hash = hash_install_id(install_id)
    now = _ph_now().isoformat()
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO installs "
            "(install_hash, first_seen, last_seen, requests_total) "
            "VALUES (?, ?, ?, 0)",
            (install_hash, now, now),
        )
        conn.execute(
            "UPDATE installs SET last_seen = ? WHERE install_hash = ?",
            (now, install_hash),
        )
        conn.commit()
    finally:
        conn.close()


def consume_daily_quota(install_id: str) -> dict:
    """Check-and-increment ng daily quota (atomic sa SQLite write lock).

    Returns: {allowed: bool, used: int, limit: int, resetAt: str}
    Dapat lang tawagin kapag analytics ON at may valid na install id.
    Ang requests_total ay tataas lang kapag may na-consume na quota.
    """
    install_hash = hash_install_id(install_id)
    day = _ph_today()
    now = _ph_now().isoformat()
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO installs "
            "(install_hash, first_seen, last_seen, requests_total) "
            "VALUES (?, ?, ?, 0)",
            (install_hash, now, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO daily_usage (install_hash, day, count) "
            "VALUES (?, ?, 0)",
            (install_hash, day),
        )

        if DAILY_DOC_LIMIT <= 0:
            # 0 o negative = walang quota enforcement; hindi binibilang.
            conn.commit()
            return {
                "allowed": True,
                "used": 0,
                "limit": DAILY_DOC_LIMIT,
                "resetAt": usage_reset_at(),
            }

        cursor = conn.execute(
            "UPDATE daily_usage SET count = count + 1 "
            "WHERE install_hash = ? AND day = ? AND count < ?",
            (install_hash, day, DAILY_DOC_LIMIT),
        )

        if cursor.rowcount == 1:
            conn.execute(
                "UPDATE installs SET requests_total = requests_total + 1, "
                "last_seen = ? WHERE install_hash = ?",
                (now, install_hash),
            )
            conn.commit()
            row = conn.execute(
                "SELECT count FROM daily_usage WHERE install_hash = ? AND day = ?",
                (install_hash, day),
            ).fetchone()
            return {
                "allowed": True,
                "used": int(row[0]) if row else 0,
                "limit": DAILY_DOC_LIMIT,
                "resetAt": usage_reset_at(),
            }

        conn.commit()
        row = conn.execute(
            "SELECT count FROM daily_usage WHERE install_hash = ? AND day = ?",
            (install_hash, day),
        ).fetchone()
        return {
            "allowed": False,
            "used": int(row[0]) if row else 0,
            "limit": DAILY_DOC_LIMIT,
            "resetAt": usage_reset_at(),
        }
    finally:
        conn.close()


def get_usage(install_id: str) -> dict:
    """Read-only na used count para sa GET /usage. Walang increment."""
    install_hash = hash_install_id(install_id)
    day = _ph_today()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT count FROM daily_usage WHERE install_hash = ? AND day = ?",
            (install_hash, day),
        ).fetchone()
        return {"used": int(row[0]) if row else 0, "resetAt": usage_reset_at()}
    finally:
        conn.close()


def usage_snapshot() -> dict:
    """Aggregate na bilang para sa GET /admin/stats. Counts lang.

    DAU/WAU/MAU = distinct installs na gumamit ng doc endpoints
    (daily_usage) sa nakalipas na 1 / 7 / 30 araw (PH calendar days).
    """
    today = _ph_today()
    conn = _connect()
    try:
        total_installs = conn.execute(
            "SELECT COUNT(*) FROM installs"
        ).fetchone()[0]
        dau = conn.execute(
            "SELECT COUNT(DISTINCT install_hash) FROM daily_usage "
            "WHERE day >= ?",
            (_ph_days_back(0),),
        ).fetchone()[0]
        wau = conn.execute(
            "SELECT COUNT(DISTINCT install_hash) FROM daily_usage "
            "WHERE day >= ?",
            (_ph_days_back(6),),
        ).fetchone()[0]
        mau = conn.execute(
            "SELECT COUNT(DISTINCT install_hash) FROM daily_usage "
            "WHERE day >= ?",
            (_ph_days_back(29),),
        ).fetchone()[0]
        requests_today = conn.execute(
            "SELECT COALESCE(SUM(count), 0) FROM daily_usage WHERE day = ?",
            (today,),
        ).fetchone()[0]
        return {
            "totalInstalls": int(total_installs),
            "dau": int(dau),
            "wau": int(wau),
            "mau": int(mau),
            "requestsToday": int(requests_today),
        }
    finally:
        conn.close()


# I-run agad ito pagka-import (pareho ng db/sqlite_store.py) para laging
# handa ang database file.
init_usage_db()