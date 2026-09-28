"""Run from LexSimpleBackend: python -m unittest discover -s test -p 'test_dictionary_offline_v6_3_12.py' -v"""

import sqlite3
import unittest

from services.dictionary_repository import (
    MAX_CARD_CHARS, TITLE_PREFIX, get_dictionary_entry,
    list_dictionary_entries, search_dictionary_entries,
)


class OfflineCoverageTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE knowledge_files
            (id TEXT PRIMARY KEY, status TEXT, law_id TEXT, source_url TEXT)""")
        self.db.execute("""CREATE TABLE documents
            (id INTEGER PRIMARY KEY, filename TEXT, chunk_text TEXT,
             knowledge_file_id TEXT, provision_label TEXT, active INTEGER)""")
        self.db.executemany("INSERT INTO knowledge_files VALUES (?,?,?,?)", [
            ("loan", "active", "RA 3765", "https://example.org/loan"),
            ("civil", "active", "RA 386", "https://example.org/civil"),
            ("old", "draft", "RA 999", "https://example.org/draft"),
        ])
        self.db.executemany("INSERT INTO documents VALUES (?,?,?,?,?,?)", [
            (10, "loan.pdf", '[SECTION 3] SEC. 3. As used in this Act, the term— '
             '(1) "Board" means the Monetary Board. '
             '(2) "Finance charge" includes interest, fees, and service charges.',
             "loan", "SECTION 3", 1),
            (11, "loan.pdf", '[SECTION 3] (3) "Creditor" means any person who lends money.',
             "loan", "SECTION 3", 1),
            (20, "civil.pdf", '[ARTICLE 32] ART. 32. A public officer shall be liable. '
             + ' '.join(f'({n}) The protected right includes right {n};' for n in range(1, 31)),
             "civil", "ARTICLE 32", 1),
            (21, "civil.pdf", '[ARTICLE 1305] ART. 1305. A contract is a meeting of minds.',
             "civil", "ARTICLE 1305", 1),
            (30, "draft.pdf", '[ARTICLE 1] Should not appear.', "old", "ARTICLE 1", 1),
            (31, "civil.pdf", '[ARTICLE 2] Inactive chunk.', "civil", "ARTICLE 2", 0),
        ])

    def tearDown(self):
        self.db.close()

    def test_every_active_provision_remains_offline_and_short(self):
        entries = list_dictionary_entries(self.db)
        self.assertGreater(len(entries), 4)
        self.assertEqual(len({entry['id'] for entry in entries}), len(entries))
        self.assertTrue(all(len(entry['raw_text']) <= MAX_CARD_CHARS for entry in entries))
        self.assertIn('ARTICLE 32', [entry['legal_basis'].split(', ')[-1] for entry in entries])
        self.assertNotIn('Should not appear.', str(entries))
        self.assertNotIn('Inactive chunk.', str(entries))
        self.assertTrue(all(entry == get_dictionary_entry(self.db, entry['id']) for entry in entries))

        for label in ('SECTION 3', 'ARTICLE 32', 'ARTICLE 1305'):
            source = ' '.join(TITLE_PREFIX.sub('', row['chunk_text'], count=1)
                              for row in self.db.execute(
                "SELECT chunk_text FROM documents WHERE active=1 AND provision_label=? ORDER BY id",
                (label,)))
            visible = ' '.join(entry['raw_text'] for entry in entries
                               if entry['legal_basis'].endswith(label))
            self.assertEqual(' '.join(source.split()), ' '.join(visible.split()))

    def test_search_keeps_named_definition_and_all_articles(self):
        self.assertEqual(search_dictionary_entries(self.db, 'finance charge')[0]['term'],
                         'Finance charge')
        self.assertTrue(search_dictionary_entries(self.db, 'Art. 32'))
        self.assertTrue(search_dictionary_entries(self.db, 'Article 1305'))


if __name__ == '__main__':
    unittest.main()