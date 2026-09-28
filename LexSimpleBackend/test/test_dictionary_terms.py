"""Run from LexSimpleBackend: python -m unittest discover -s test -p 'test_dictionary_terms_v6_3_11.py' -v"""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from services.dictionary_repository import (
    get_dictionary_entry, list_dictionary_entries, search_dictionary_entries,
)


class TermSizedDictionaryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = sqlite3.connect(str(Path(self.temp.name) / "dictionary.db"))
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE knowledge_files
            (id TEXT PRIMARY KEY, status TEXT, law_id TEXT, source_url TEXT)""")
        self.db.execute("""CREATE TABLE documents
            (id INTEGER PRIMARY KEY, filename TEXT, chunk_text TEXT,
             knowledge_file_id TEXT, provision_label TEXT, active INTEGER)""")
        for file_id, law_id in (("loan", "RA 3765"), ("finance", "RA 11765"),
                                ("civil", "RA 386")):
            self.db.execute("INSERT INTO knowledge_files VALUES (?,?,?,?)",
                            (file_id, "active", law_id,
                             "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/24096"))
        self.db.executemany("""INSERT INTO documents
            (id, filename, chunk_text, knowledge_file_id, provision_label, active)
            VALUES (?,?,?,?,?,1)""", [
            (10, "loan.pdf", '[SECTION 3] SEC. 3. As used in this Act, the term— '
             '(1) "Board" means the Monetary Board of the Central Bank. '
             '(2) "Credit" means any loan or mortgage; any contract to sell property. '
             '(3) "Finance charge" includes interest, fees, and service charges. '
             '(4) "Minimum amount due or minimum payment required" refers to the sum due.',
             "loan", "SECTION 3"),
            (20, "finance.pdf", '[SECTION 3] SEC. 3. Definition of Terms. - As used in this Act: '
             '(a) Financial consumer refers to a purchaser of financial products; '
             '(b) Financial product or service refers to credit, insurance and payments; '
             '(f) Investment fraud refers to deceptive solicitation of investments,',
             "finance", "SECTION 3"),
            (21, "finance.pdf", '[SECTION 3] boiling room operations and other schemes; '
             '(g) Market conduct refers to how providers deliver products.',
             "finance", "SECTION 3"),
            (30, "civil.pdf", '[ARTICLE 1305] ART. 1305. A contract is a meeting of minds '
             'between two persons whereby one binds himself to give something.',
             "civil", "ARTICLE 1305"),
            (31, "civil.pdf", '[ARTICLE 1306] ART. 1306. Parties may agree on terms.',
             "civil", "ARTICLE 1306"),
        ])

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_numbered_definitions_are_separate_and_source_grounded(self):
        entries = list_dictionary_entries(self.db)
        names = [entry["term"] for entry in entries]
        self.assertEqual(names[:3], ["Board", "Credit", "Finance charge"])
        self.assertIn("Contract", names)
        credit = next(entry for entry in entries if entry["term"] == "Credit")
        self.assertNotIn('"Board"', credit["raw_text"])
        self.assertEqual(credit["legal_basis"], "RA 3765, SECTION 3")
        self.assertEqual(credit, get_dictionary_entry(self.db, credit["id"]))
        self.assertEqual(search_dictionary_entries(self.db, "credit")[0]["term"], "Credit")
        self.assertIn("Minimum amount due or minimum payment required", names)
        self.assertEqual([e["id"] for e in entries],
                         [e["id"] for e in list_dictionary_entries(self.db)])

    def test_continuation_chunk_is_not_dropped(self):
        entry = next(e for e in list_dictionary_entries(self.db)
                     if e["term"] == "Investment fraud")
        self.assertIn("boiling room operations", entry["raw_text"])
        self.assertNotIn("Market conduct refers", entry["raw_text"])

    def test_stale_or_unapproved_source_has_no_entry(self):
        old = next(e for e in list_dictionary_entries(self.db) if e["term"] == "Board")
        self.db.execute("UPDATE knowledge_files SET status='disabled' WHERE id='loan'")
        self.assertIsNone(get_dictionary_entry(self.db, old["id"]))
        self.assertNotIn("Board", [e["term"] for e in list_dictionary_entries(self.db)])
        self.assertIsNone(get_dictionary_entry(self.db, 10))  # Old document IDs are stale.


if __name__ == "__main__":
    unittest.main()