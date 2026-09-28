"""Run: python -m unittest discover -s test -p 'test_knowledge_scope_v6_3_10.py'."""

import hashlib
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import fitz

if "dotenv" not in sys.modules:
    fake_dotenv = types.ModuleType("dotenv")
    fake_dotenv.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = fake_dotenv

from core.config import settings
import services.knowledge_catalog as catalog


class FakeVectors:
    def __init__(self):
        self.items = {}
        self.collection = types.SimpleNamespace(delete=self.delete)

    def add(self, document, metadata):
        key = f"vec-{len(self.items) + 1}"
        self.items[key] = (document, metadata)
        return key

    def delete(self, ids):
        for key in ids:
            self.items.pop(key, None)


class ScopeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = settings.DB_PATH
        self.old_root = catalog.ROOT
        settings.DB_PATH = str(Path(self.temp.name) / "knowledge.db")
        catalog.ROOT = Path(self.temp.name) / "private"
        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("""CREATE TABLE documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT,
                chunk_id TEXT, chunk_text TEXT, upload_date TEXT
            )""")
        catalog.ensure_schema()
        self.vectors = FakeVectors()
        fake = types.ModuleType("db.chroma_store")
        fake.add_to_vector_db = self.vectors.add
        fake.collection = self.vectors.collection
        self.chroma_patch = patch.dict(sys.modules, {"db.chroma_store": fake})
        self.chroma_patch.start()

    def tearDown(self):
        self.chroma_patch.stop()
        catalog.ROOT = self.old_root
        settings.DB_PATH = self.old_db
        self.temp.cleanup()

    @staticmethod
    def pdf(law, parts):
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), law + "\n" + "\n".join(parts))
        data = doc.tobytes()
        doc.close()
        return data

    def test_new_law_excludes_repealed_range_before_one_approval(self):
        data = self.pdf("REPUBLIC ACT NO. 7394", [
            "ARTICLE 130. Current consumer text is here.",
            "ARTICLE 131. Superseded provision is here.",
            "ARTICLE 132. Superseded provision is here.",
            "ARTICLE 133. Current consumer text is here.",
        ])
        draft = catalog.create_draft(data, "consumer.pdf", "Consumer Act", "RA 7394",
            "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/3302", 1, None, [],
            excluded_provisions="ARTICLE 131-132")
        self.assertEqual((draft["chunkCount"], draft["activeChunkCount"], draft["excludedChunkCount"]), (4, 2, 2))
        catalog.mark_indexing(draft["id"])
        catalog.index_draft(draft["id"])
        info = catalog.file_details(draft["id"])
        self.assertEqual(info["status"], "active")
        self.assertEqual(info["activeChunkCount"], 2)
        self.assertEqual(catalog.find_verified_reference_context("ARTICLE", "131", law_id="RA 7394"), [])
        self.assertEqual(len(catalog.find_verified_reference_context("ARTICLE", "130", law_id="RA 7394")), 1)

    def test_existing_civil_code_activates_without_reupload_and_preserves_reviewed(self):
        data = self.pdf("REPUBLIC ACT NO. 386", [
            "ARTICLE 39. Historic wording about age.",
            "ARTICLE 1305. A contract is a meeting of minds between two persons.",
            "ARTICLE 1306. Contracting parties may establish stipulations.",
        ])
        file_id = "existing-civil-code"
        path = catalog.ROOT / "existing-civil-code.pdf"
        path.write_bytes(data)
        parts = [
            {"label": "ARTICLE 39", "text": "ART. 39. Historic wording about age."},
            {"label": "ARTICLE 1305", "text": "ART. 1305. A contract is a meeting of minds between two persons."},
            {"label": "ARTICLE 1306", "text": "ART. 1306. Contracting parties may establish stipulations."},
        ]
        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("""INSERT INTO knowledge_files
                (id, law_id, title, original_filename, source_url, file_sha256,
                 stored_path, total_pages, first_page, last_page, status, created_at,
                 approved_at, chunk_count)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                    file_id, "RA 386", "Civil Code", "civil.pdf",
                    "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/53360",
                    hashlib.sha256(data).hexdigest(), str(path), 1, 1, 1,
                    "reference_only", catalog._now(), catalog._now(), len(parts),
                ))
            for item in parts:
                db.execute("""INSERT INTO documents (filename,chunk_id,chunk_text,
                             knowledge_file_id,provision_label,page_number,active)
                             VALUES (?,?,?,?,?,?,0)""", ("Civil Code", "pending-" + item["label"],
                             item["text"], file_id, item["label"], 1))
        catalog.review_civil_code_article(file_id, 1305,
            "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/1/69211",
            "The Supreme Court used Article 1305 in a recent decision.", True)
        preview = catalog.activation_preview(file_id, "ARTICLE 39")
        self.assertEqual(preview["currentlyActiveChunks"], 1)
        self.assertEqual(preview["activeChunkCount"], 2)
        catalog.mark_activation(file_id, "ARTICLE 39", True)
        catalog.activate_approved_file(file_id)
        self.assertEqual(catalog.file_details(file_id)["activeChunkCount"], 2)
        self.assertEqual(len(catalog.find_verified_reference_context("ARTICLE", "1305", law_id="RA 386")), 1)
        self.assertEqual(len(catalog.find_verified_reference_context("ARTICLE", "1306", law_id="RA 386")), 1)
        self.assertEqual(catalog.find_verified_reference_context("ARTICLE", "39", law_id="RA 386"), [])
        catalog.ensure_schema()  # The migration must not quarantine reviewed scope.
        self.assertEqual(catalog.file_details(file_id)["activeChunkCount"], 2)
        # A later single scoped approval can narrow an already active file.
        preview = catalog.activation_preview(file_id, "", "ARTICLE 1305")
        self.assertEqual(preview["activeChunkCount"], 1)
        catalog.mark_activation(file_id, "", True, "ARTICLE 1305")
        catalog.activate_approved_file(file_id)
        self.assertEqual(catalog.file_details(file_id)["activeChunkCount"], 1)
        self.assertEqual(catalog.find_verified_reference_context("ARTICLE", "1306", law_id="RA 386"), [])

    def test_scope_validation_rejects_typos_and_all_excluded(self):
        with self.assertRaises(ValueError):
            catalog.parse_excluded_provisions("ARTCLE 39")
        with self.assertRaises(ValueError):
            catalog._scope([{"label": "ARTICLE 1"}], catalog.parse_excluded_provisions("ARTICLE 1"))
        with self.assertRaises(ValueError):
            catalog._scope([{"label": "ARTICLE 1"}], catalog.parse_excluded_provisions("ARTICLE 2"))
        with self.assertRaises(ValueError):
            catalog._scope([{"label": "ARTICLE 1"}], [], catalog.parse_excluded_provisions("ARTICLE 2"))

    def test_failed_activation_does_not_publish_partial_scope(self):
        data = self.pdf("REPUBLIC ACT NO. 386", ["ARTICLE 1305. Contract definition.",
                                              "ARTICLE 1306. Contract terms."])
        fid = "failed-activation"
        path = catalog.ROOT / (fid + ".pdf")
        path.write_bytes(data)
        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("""INSERT INTO knowledge_files
                (id,law_id,title,original_filename,source_url,file_sha256,stored_path,
                 total_pages,first_page,last_page,status,created_at,chunk_count)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (fid, "RA 386", "Civil Code", "civil.pdf",
                 "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/53360",
                 hashlib.sha256(data).hexdigest(), str(path), 1, 1, 1,
                 "reference_only", catalog._now(), 2))
            for label in ("ARTICLE 1305", "ARTICLE 1306"):
                db.execute("""INSERT INTO documents
                    (filename,chunk_id,chunk_text,knowledge_file_id,provision_label,page_number,active)
                    VALUES (?,?,?,?,?,?,0)""", ("Civil Code", "pending-" + label,
                    label, fid, label, 1))
        catalog.mark_activation(fid, "", True)
        with patch.object(sys.modules["db.chroma_store"], "add_to_vector_db",
                          side_effect=RuntimeError("mock vector failure")):
            with self.assertRaises(RuntimeError):
                catalog.activate_approved_file(fid)
        self.assertEqual(catalog.file_details(fid)["activeChunkCount"], 0)
        self.assertEqual(catalog.file_details(fid)["status"], "reference_only")


if __name__ == "__main__":
    unittest.main()