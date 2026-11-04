"""Anonymous usage store (Task A1/B1) para sa Lex-Simple backend.

PRIVACY CONTRACT:
- Ang X-Install-Id ng app ay HINDI kailanman ini-store nang plain.
  Bago ito ma-save, dadaan muna sa sha256(INSTALL_ID_SALT + install_id).
- Walang laman ng dokumento, walang OCR text, at walang anumang content
  na naka-log dito — counts at timestamps lang.
- Task B1: HIWALAY ang quota sa analytics. Laging may daily quota kahit
  X-Analytics: 0 (opt-out) o walang install id (IP-fallback key).
  Ang laktawan lang ng opt-out ay ang installs table (first_seen/last_seen)
  — tanging ang middleware sa main.py (touch_install) ang sumusulat doon.
- Task C1: SA BAWAT request ay binibilang ang install key AT ang ip key
  (dual counting), plus ang global cap. May release_daily_quota() na
  nag-rerefund ng slot kapag nag-fail ang processing (hal. LLM error).
- Walang IP address na naka-store: ang IP-fallback key ay sha256 din.
- Ang DB path ay galing sa env (USAGE_DB_PATH) para madaling ilipat sa
  persistent storage.

TABLES:
- installs(install_hash PK, first_seen, last_seen, requests_total)
  — analytics-ON installs lang, mula sa middleware touch_install.
- daily_usage(quota_key, day, count) — PK (quota_key, day)
  — quota counting lang; quota_key ay install hash, IP hash, o ang
    espesyal na global key. Operational data lang (may 2-day purge).
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

try:
    DAILY_IP_DOC_LIMIT = int(os.getenv("DAILY_IP_DOC_LIMIT", "50"))
except ValueError:
    print("[usage_store] WARNING: invalid DAILY_IP_DOC_LIMIT; using 50.")
    DAILY_IP_DOC_LIMIT = 50

try:
    GLOBAL_DAILY_DOC_LIMIT = int(os.getenv("GLOBAL_DAILY_DOC_LIMIT", "200"))
except ValueError:
    print("[usage_store] WARNING: invalid GLOBAL_DAILY_DOC_LIMIT; using 200.")
    GLOBAL_DAILY_DOC_LIMIT = 200

# Espesyal na daily_usage key para sa global daily cap (Task B1.4).
# Walang PII dito kaya hindi na kailangang i-hash.
GLOBAL_QUOTA_KEY = "__global_daily_docs__"

# Task B1.2: ilang araw ng daily_usage rows ang itatabi (operational lang).
DAILY_USAGE_RETENTION_DAYS = 2

if not INSTALL_ID_SALT.strip():
    print(
        "[usage_store] WARNING: INSTALL_ID_SALT is empty. "
        "Set a random salt in .env so quota keys cannot be guessed."
    )


def hash_install_id(install_id: str) -> str:
    """I-sha256 (salted) ang install id — hindi kailanman plain."""
    return hashlib.sha256(
        (INSTALL_ID_SALT + install_id).encode("utf-8")
    ).hexdigest()


def install_quota_key(install_id: str) -> str:
    """Quota key ng valid install — sha256(salt + install_id)."""
    return hash_install_id(install_id)


def ip_quota_key(client_ip: str) -> str:
    """Quota key ng client IP — sha256(salt + "ip:" + ip).

    Task C1: binibilang ito SA BAWAT request (may o walang valid install
    id), kaya kahit mag-imbento ang attacker ng bagong install id kada
    request, may sarili pa ring ceiling ang IP. Hindi iniimbak ang IP
    mismo; hash lang ang pumapasok sa daily_usage.
    """
    return hashlib.sha256(
        (INSTALL_ID_SALT + f"ip:{client_ip}").encode("utf-8")
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

        existing_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(daily_usage)").fetchall()
        }
        if existing_columns and "quota_key" not in existing_columns:
            # Lumang Task A1 schema (column name: install_hash) → bagong
            # Task B1 name (quota_key). Pinapanatili ang mga count ngayong
            # araw; ang mga lumang orphan keys ay aalisin ng purge.
            conn.execute(
                "ALTER TABLE daily_usage RENAME COLUMN install_hash TO quota_key"
            )

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
                quota_key TEXT NOT NULL,
                day       TEXT NOT NULL,
                count     INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (quota_key, day)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_usage_day ON daily_usage(day)"
        )
        conn.commit()
    finally:
        conn.close()
    purge_expired_daily_usage()


def purge_expired_daily_usage() -> None:
    """Task B1.2: daily_usage ay operational data lang — burahin ang mga
    row na mas matanda sa DAILY_USAGE_RETENTION_DAYS (2 araw)."""
    cutoff = _ph_days_back(DAILY_USAGE_RETENTION_DAYS)
    conn = _connect()
    try:
        conn.execute("DELETE FROM daily_usage WHERE day < ?", (cutoff,))
        conn.commit()
    finally:
        conn.close()


def touch_install(install_id: str) -> None:
    """Upsert ng first_seen/last_seen ng isang install (analytics lang).

    Dapat lang tawagin kapag analytics ON (walang X-Analytics: 0) —
    ginagawa na iyan ng middleware sa main.py. Ang quota ay hindi na
    dumadaan dito (Task B1).
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


def consume_daily_quota(quota_key: str, limit: int) -> dict:
    """Check-and-increment ng daily quota (atomic sa SQLite write lock).

    Task B1: quota-only na ito — HINDI na humahawak ng installs table
    (walang INSERT/UPDATE sa installs kahit kailan). Ang analytics writes
    ay nasa middleware touch_install lang, kaya:
    - opt-out (X-Analytics: 0): may quota pa rin, walang installs row;
    - ip key: may quota (sariling limit) SA BAWAT request, walang
      installs row (Task C1 dual counting).

    Returns: {allowed: bool, used: int, limit: int, resetAt: str}
    """
    day = _ph_today()
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO daily_usage (quota_key, day, count) "
            "VALUES (?, ?, 0)",
            (quota_key, day),
        )

        if limit <= 0:
            # 0 o negative = walang quota enforcement; hindi binibilang.
            conn.commit()
            return {
                "allowed": True,
                "used": 0,
                "limit": limit,
                "resetAt": usage_reset_at(),
            }

        cursor = conn.execute(
            "UPDATE daily_usage SET count = count + 1 "
            "WHERE quota_key = ? AND day = ? AND count < ?",
            (quota_key, day, limit),
        )

        row = conn.execute(
            "SELECT count FROM daily_usage WHERE quota_key = ? AND day = ?",
            (quota_key, day),
        ).fetchone()
        used = int(row[0]) if row else 0
        conn.commit()
        return {
            "allowed": cursor.rowcount == 1,
            "used": used,
            "limit": limit,
            "resetAt": usage_reset_at(),
        }
    finally:
        conn.close()


def release_daily_quota(quota_key: str) -> None:
    """Task C1.3: i-refund ang isang na-consume na quota slot.

    I-decrement ang count ng quota_key para sa kasalukuyang araw (PH time),
    na hindi bababa sa 0. Tawagin ito kapag nag-fail ang processing
    (hal. LLM exception o 5xx) para hindi masayang ang quota slot ng user
    sa isang request na hindi naman natuloy.
    """
    day = _ph_today()
    conn = _connect()
    try:
        conn.execute(
            "UPDATE daily_usage SET count = MAX(count - 1, 0) "
            "WHERE quota_key = ? AND day = ?",
            (quota_key, day),
        )
        conn.commit()
    finally:
        conn.close()


def get_usage(quota_key: str, limit: int) -> dict:
    """Read-only na used count (GET /usage). Walang increment."""
    day = _ph_today()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT count FROM daily_usage WHERE quota_key = ? AND day = ?",
            (quota_key, day),
        ).fetchone()
        return {
            "used": int(row[0]) if row else 0,
            "limit": limit,
            "resetAt": usage_reset_at(),
        }
    finally:
        conn.close()


def usage_snapshot() -> dict:
    """Aggregate na bilang para sa GET /admin/stats. Counts lang.

    Task B1.2: DAU/WAU/MAU ay mula sa installs.last_seen (analytics-ON
    installs na gumamit ng kahit anong endpoint) sa nakalipas na
    1 / 7 / 30 araw (PH time). Ang requestsToday ay mula pa rin sa
    daily_usage. Pareho pa rin ang response keys.
    """
    conn = _connect()
    try:
        total_installs = conn.execute(
            "SELECT COUNT(*) FROM installs"
        ).fetchone()[0]

        def active_since(days_back: int) -> int:
            cutoff = (_ph_now() - timedelta(days=days_back)).isoformat()
            return conn.execute(
                "SELECT COUNT(*) FROM installs WHERE last_seen >= ?",
                (cutoff,),
            ).fetchone()[0]

        dau = active_since(1)
        wau = active_since(7)
        mau = active_since(30)

        requests_today = conn.execute(
            "SELECT COALESCE(SUM(count), 0) FROM daily_usage WHERE day = ?",
            (_ph_today(),),
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