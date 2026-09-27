"""Run: python -m unittest discover -s tests -p 'test_dictionary_repository_v6_2_7.py'"""
import sqlite3
import unittest

from services.dictionary_repository import (
    get_dictionary_entry,
    list_dictionary_entries,
    search_dictionary_entries,
)


class DictionaryRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.connection = sqlite3.connect(":memory:")
        self.connection.row_factory = sqlite3.Row
        self.connection.execute(
            "CREATE TABLE documents (id INTEGER PRIMARY KEY, filename TEXT, chunk_text TEXT)"
        )
        self.connection.executemany(
            "INSERT INTO documents (filename, chunk_text) VALUES (?, ?)",
            [
                ("Civil Code.pdf", "[ARTICLE 13] Text from source A."),
                ("Revised Penal Code.pdf", "[ARTICLE 13] Text from source B."),
                ("Lease.pdf", "[RENT] Due every month."),
            ],
        )

    def tearDown(self):
        self.connection.close()

    def test_exact_source_and_article_search(self):
        matches = search_dictionary_entries(self.connection, "Art. 13")
        self.assertEqual(len(matches), 2)
        self.assertNotEqual(matches[0]["id"], matches[1]["id"])
        self.assertEqual(get_dictionary_entry(self.connection, matches[1]["id"])["raw_text"], "Text from source B.")
        self.assertEqual(matches[0]["legal_basis"], "Civil Code.pdf")

    def test_no_match_and_literal_wildcards(self):
        self.assertEqual(search_dictionary_entries(self.connection, "unlisted"), [])
        self.assertEqual(search_dictionary_entries(self.connection, "_%"), [])

    def test_sync_entries_keep_unique_ids(self):
        entries = list_dictionary_entries(self.connection)
        self.assertEqual(len(entries), 3)
        self.assertEqual(len({item["id"] for item in entries}), 3)
        self.assertEqual(entries[2]["term"], "RENT")

    def test_ranking_finds_exact_title_after_many_body_hits(self):
        self.connection.executemany(
            "INSERT INTO documents (filename, chunk_text) VALUES (?, ?)",
            [("other.pdf", f"[TOPIC {n}] phrase rent in body") for n in range(300)],
        )
        self.connection.execute(
            "INSERT INTO documents (filename, chunk_text) VALUES (?, ?)",
            ("Actual Act.pdf", "[RENT] Exact late record"),
        )
        matches = search_dictionary_entries(self.connection, "rent")
        self.assertEqual(matches[0]["raw_text"], "Due every month.")
        self.assertEqual(matches[1]["raw_text"], "Exact late record")


if __name__ == "__main__":
    unittest.main()