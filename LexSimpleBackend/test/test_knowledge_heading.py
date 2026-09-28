"""Run: python -m unittest discover -s test -p 'test_knowledge_heading_v6_3_13.py' -v"""

import unittest

from services.knowledge_catalog import SECTION


class KnowledgeHeadingTest(unittest.TestCase):
    def test_wrapped_citations_are_not_new_articles(self):
        source = ("ART. 4. Definition of Terms.\n"
                  "Consumer product safety rule means a standard described in\n"
                  "Article 78 or a rule under this Chapter declaring a product banned.\n"
                  "Article 18; and (2) other means to protect consumers.\n"
                  "ART. 5. Declaration of Policy.\n")
        self.assertEqual([match.group(1) for match in SECTION.finditer(source)],
                         ["4", "5"])

    def test_section_headings_still_work(self):
        source = "SECTION 1. Short Title.\nSEC. 2: Declaration.\nSECTION 3\nDefinitions."
        self.assertEqual([match.group(1) for match in SECTION.finditer(source)],
                         ["1", "2", "3"])


if __name__ == "__main__":
    unittest.main()