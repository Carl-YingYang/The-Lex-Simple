"""Lexie wording guard — Task LX2 (huli ang silent rollback ng persona).

Noong na-push muli ang lumang prompt files sa repo, bumalik ang lumang
"Legal Text Guide" persona nang hindi nadadamay ang test suite — walang
test noon na sumusuri sa mismong wording, kaya tahimik na lumusot ang
regression. Para hindi na ito maulit, ine-scan ng test na ito ang mga
user-facing source files para sa:

  1. Mga BAWAL na parirala (lumang persona na may UPL risk), at
  2. Mga KAILANGANG marker ng LX1-final wording (hindi abogado o legal
     guide; laging Lexie; walang model name sa identity).

Ang mga backend file ay LAGING sinusuri. Ang mobile welcome check ay
naka-OFF muna (backend-only focus ng team ngayon) para hindi umiiral ang
failure habang hindi pa nagre-rebuild ng mobile app. Kapag babalik na sa
LexSimpleMobile rebuild:

  1. I-apply muna ang welcome message fix sa AskAiScreen.tsx, tapos
  2. i-run ang suite na may env var:  LEX2_CHECK_MOBILE=1
     (o gawing True ang CHECK_MOBILE sa baba para permanenteng ON).

Run (backend-only, default): python -m pytest test/ -q
Full check (kasama ang mobile): LEX2_CHECK_MOBILE=1 python -m pytest test/ -q
"""

import os
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
MOBILE_SCREEN = (REPO_ROOT / "LexSimpleMobile" / "src" / "screens" / "home"
                 / "sub-pages" / "AskAiScreen.tsx")

# BACKEND-ONLY MODE (flag): kapag False (default ngayon), laging skip ang
# mga check sa AskAiScreen.tsx. Kapag True, sasabak ang mobile checks
# kapag nahanap ang LexSimpleMobile sa tabi ng backend. Override kada-run:
# LEX2_CHECK_MOBILE=1 python -m pytest test/ -q
CHECK_MOBILE = os.environ.get("LEX2_CHECK_MOBILE", "0") == "1"

# UPL risk ang mga pariralang ito bilang persona title: inilalarawan nila
# ang Lexie na parang legal service provider. Bawal sa LAHAT ng
# user-facing source. Walang false positive: ang mga disavowal linya ay
# gumagamit ng "legal guide" (hal. "not a lawyer and not a legal guide"),
# hindi ang buong pariralang "legal text guide".
BANNED_PHRASES = ("legal text guide",)

REQUIRED_MARKERS = {
    "services/prompts.py": (
        "plain-language legal literacy companion",
        "IDENTITY AND UPL BOUNDARY (HARD RULE)",
    ),
    "services/chat_service.py": (
        "tagapaliwanag ng dokumento",
        "not a lawyer and not a legal guide",
    ),
    "services/chat_general.py": (
        "Ikaw si Lexie, isang AI na tagapaliwanag ng legal text sa",
        "ikaw si Lexie lang",
    ),
    "services/lexie_identity.py": (
        "Ako si Lexie, isang AI na tagapaliwanag ng dokumento",
        "Hindi ako abogado",
    ),
}

MOBILE_REQUIRED = (
    "isang AI na tagapaliwanag ng dokumento sa Lex-Simple",
    "Hindi ako abogado at hindi ito legal advice",
)


class LexieWordingGuardTest(unittest.TestCase):
    def _read(self, path: Path) -> str:
        self.assertTrue(path.exists(), f"Walang file: {path}")
        return path.read_text(encoding="utf-8", errors="replace").casefold()

    def test_no_banned_persona_phrases_in_user_facing_sources(self):
        sources = [BACKEND_DIR / rel for rel in REQUIRED_MARKERS]
        if MOBILE_SCREEN.exists() and CHECK_MOBILE:
            sources.append(MOBILE_SCREEN)
        for path in sources:
            with self.subTest(file=str(path)):
                text = self._read(path)
                for phrase in BANNED_PHRASES:
                    self.assertNotIn(
                        phrase, text,
                        f'Bawal ang "{phrase}" sa {path.name} — lumang '
                        "persona ito na may UPL risk. Gamitin ang LX1 "
                        "wording: \"plain-language legal literacy "
                        'companion" o "isang AI na tagapaliwanag".',
                    )

    def test_lx1_markers_are_present_in_backend_files(self):
        for rel, markers in REQUIRED_MARKERS.items():
            text = self._read(BACKEND_DIR / rel)
            for marker in markers:
                with self.subTest(file=rel, marker=marker[:48]):
                    self.assertIn(
                        marker.casefold(), text,
                        f"Nawala ang LX1 marker sa {rel}: {marker!r}. "
                        "Ibalik ang LX1-final wording ng file na ito.",
                    )

    @unittest.skipUnless(
        MOBILE_SCREEN.exists() and CHECK_MOBILE,
        "Mobile check naka-off (backend-only mode) — i-run na may "
        "LEX2_CHECK_MOBILE=1 para isama ang AskAiScreen.tsx",
    )
    def test_mobile_welcome_message_is_upl_safe(self):
        text = self._read(MOBILE_SCREEN)
        for marker in MOBILE_REQUIRED:
            self.assertIn(
                marker.casefold(), text,
                "Nawala ang LX1 welcome wording sa AskAiScreen.tsx: "
                f"{marker!r}",
            )
        for phrase in BANNED_PHRASES:
            self.assertNotIn(phrase, text)


if __name__ == "__main__":
    unittest.main()