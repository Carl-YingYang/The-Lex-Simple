import unittest

from services.ocr_quality import assess_ocr_quality


# Regression excerpts from the five-page synthetic OCR sample. The full batch
# contains separate loan, service, purchase, lease, and supply documents.
SAMPLE_MIXED_BATCH = """--- Page 1 ---
This Loan Agreement is made on 15 August 2026 between Maria Santos, the
Creditor, and Northfield Trading, the Debtor.
1. Principal Amount The Creditor shall lend the Debtor PHP 125.000.00.
2. Repayment The Debtor shall pay five monthly installments of PHP 25,000.00.

--- Page 2 ---
This Service Agreenment is entered into by Harber Design Studio (Provider)
and Cedar Market Cooperative (Client).
SECTION2-FEES. The project fee is PHP 48,500.00. The Client shall pay
PHP 18,500.00 and PHP 30,000 00 after acceptance.

--- Page 3 ---
A fictional buyer agrees to pay a purchase price of PHP 72.450 00 for
office equipment. Payment date\n10 October 2026\n10 November 2026\nTOTAL
Amount due\nPHP 12 450.00\nPHP 20.c00.00\nPHP 72,450.00
Reference\nPAY-001\nPAY-002\nFOUR PAYMENTS

--- Page 4 ---
This fictional lease excerpt concerns Cedar Court, Santa Maria, Bulacan.
The Lessor and Lessee are sample roles.
ARTICLE II. RENT. Monthly rent is PHP 8.750.00, due on the fifth day.
ARTICLE III. DEPOSIT. The security deposit is PHP 17,500.00.

--- Page 5 ---
This fictional addendum changes the delivery schedule in a sample supply agreement.
Batch A-17 contains 125 units. Batch B-08 contains 75 units.
C PRICE The agreed sample price remains PHP 1,249.50 per unit.
"""


class OcrQualityRegressionTests(unittest.TestCase):
    def test_five_unrelated_documents_are_blocked(self):
        result = assess_ocr_quality(SAMPLE_MIXED_BATCH)
        self.assertEqual(result["status"], "analysis_blocked")
        self.assertIn(
            "mixed_documents",
            {item["code"] for item in result["issues"]},
        )
        self.assertGreaterEqual(len(result["pageKinds"]), 3)

    def test_ambiguous_money_from_sample_is_flagged(self):
        result = assess_ocr_quality(SAMPLE_MIXED_BATCH)
        amounts = {
            item["sample"]
            for item in result["issues"]
            if item["code"] == "ambiguous_amount"
        }
        for amount in (
            "PHP 125.000.00",
            "PHP 30,000 00",
            "PHP 72.450 00",
            "PHP 12 450.00",
            "PHP 20.c00.00",
            "PHP 8.750.00",
        ):
            self.assertIn(amount, amounts)

    def test_normal_money_and_sentence_punctuation_do_not_block(self):
        text = (
            "--- Page 1 ---\nThis Loan Agreement is made today. "
            "The Creditor and Debtor agree on a principal amount of "
            "PHP 125,000.00. The monthly amount is PHP 25,000.00, "
            "and the last balance is ₱5,000.00."
        )
        result = assess_ocr_quality(text)
        self.assertEqual(result["status"], "good")
        self.assertFalse(result["issues"])

    def test_continuation_page_does_not_look_like_a_new_document(self):
        text = (
            "--- Page 1 ---\nThis Loan Agreement is made today. "
            "The Creditor and Debtor agree on a principal amount of PHP 1,000.00.\n"
            "--- Page 2 ---\nThe Debtor shall pay by January 2027. "
            "The Creditor shall issue a receipt."
        )
        result = assess_ocr_quality(text)
        self.assertNotIn(
            "mixed_documents",
            {item["code"] for item in result["issues"]},
        )

    def test_detached_table_columns_block_even_with_valid_amounts(self):
        text = (
            "--- Page 1 ---\nPayment date\n10 October 2026\n"
            "10 November 2026\nAmount due\nPHP 1,000.00\n"
            "PHP 2,000.00\nReference\nPAY-001\nPAY-002"
        )
        result = assess_ocr_quality(text)
        self.assertEqual(result["status"], "analysis_blocked")
        self.assertIn(
            "table_columns_detached",
            {item["code"] for item in result["issues"]},
        )


if __name__ == "__main__":
    unittest.main()
