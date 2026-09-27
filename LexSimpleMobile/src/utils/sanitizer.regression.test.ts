// SANITIZER REGRESSION VERSION: 6.2.5
// Paste this file beside sanitizer.ts in src/utils/.
import {
    REDACTION,
    containsPotentialSensitiveData,
    sanitizeDocumentText,
    sanitizeLocalText,
} from './sanitizer';

const assertIncludes = (
    actual: string,
    expected: string,
    label: string
): void => {
    if (!actual.includes(expected)) {
        throw new Error(
            `[FAIL] ${label}\nExpected to include: ${expected}\nActual: ${actual}`
        );
    }
};

const assertNotIncludes = (
    actual: string,
    unexpected: string,
    label: string
): void => {
    if (actual.includes(unexpected)) {
        throw new Error(
            `[FAIL] ${label}\nUnexpected: ${unexpected}\nActual: ${actual}`
        );
    }
};

const ordinaryAccountLanguage =
    "Allan handles the accounting and keeping of books. The accused's failure to account for received amounts does not automatically amount to fraud.";
const ordinaryAccountResult = sanitizeLocalText(
    ordinaryAccountLanguage
);

assertIncludes(
    ordinaryAccountResult,
    'accounting and keeping of books',
    'The word accounting must remain legal text.'
);
assertIncludes(
    ordinaryAccountResult,
    'account for received amounts',
    'The phrase account for must remain legal text.'
);
assertNotIncludes(
    ordinaryAccountResult,
    REDACTION.ACCOUNT,
    'Ordinary account language must not be redacted.'
);

const accountNumberResult = sanitizeLocalText(
    'Account No: 1234-5678-9012 and bank account: 001234567890.'
);
assertNotIncludes(
    accountNumberResult,
    '1234-5678-9012',
    'An explicitly labeled account number must be removed.'
);
assertNotIncludes(
    accountNumberResult,
    '001234567890',
    'A delimited bank account value must be removed.'
);
assertIncludes(
    accountNumberResult,
    REDACTION.ACCOUNT,
    'Account values must use the account redaction marker.'
);

const legalPartyResult = sanitizeLocalText(
    'KIMBERLY JOYCE DALIMOT CADAVOS, Filipino, of legal age, married, and a resident of 1290 Barcelona Extension Tondo, City of Manila, after having been sworn in accordance with law.'
);
assertIncludes(
    legalPartyResult,
    `${REDACTION.NAME}, Filipino, of legal age, married`,
    'Only the party name must be redacted; legal descriptors must remain.'
);
assertNotIncludes(
    legalPartyResult,
    `${REDACTION.NAME}, ${REDACTION.NAME}`,
    'The phrase of legal age must never be treated as another name.'
);
assertIncludes(
    legalPartyResult,
    `a resident of ${REDACTION.ADDRESS}`,
    'A resident-of address must be redacted while preserving its label.'
);
assertNotIncludes(
    legalPartyResult,
    '1290 Barcelona Extension Tondo',
    'The exact street address must not survive sanitization.'
);
assertNotIncludes(
    legalPartyResult,
    'City of Manila',
    'The city/province portion of a personal address must be removed.'
);

const exactOcrVariantResult = sanitizeLocalText(
    `JANINE MAE SALIPOT OLINDO,
Complainant,
versus
KIMBERLY JOYCE CADAVOS y
DALIMOT a.k.a KIMBERLY
JOYCE DALIMOT,
Respondent.
I, KIMBERLY JOYCE DALIMOT CADAVOS, of legal, Filipino citizen,
married, and a resident of 1290 Barcelona Extension Tondo, City
of Manila, after having been sworn to in accordance with law.
Allan Almeda ("Allan") handles the accounting and keeping of books.
Janine Mae Olindo ("Janine") demanded payment.
Rodelon Oliverio ("Rodelon") received the payment.
The accused's failure to account for the property received amounts to criminal fraud.`
);

assertNotIncludes(
    exactOcrVariantResult,
    'JANINE MAE SALIPOT OLINDO',
    'A complainant name in the case caption must be removed.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'KIMBERLY JOYCE DALIMOT CADAVOS',
    'The affidavit declarant must be removed despite OCR descriptor variants.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'KIMBERLY JOYCE CADAVOS',
    'A multiline respondent caption must not retain its first name fragment.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'DALIMOT a.k.a',
    'A multiline a.k.a. caption must be replaced as one identity block.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'Allan Almeda',
    'A person introduced with an alias must be removed.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'Janine Mae Olindo',
    'A named lender introduced with an alias must be removed.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'Rodelon Oliverio',
    'Another person introduced with an alias must be removed.'
);
assertIncludes(
    exactOcrVariantResult,
    'accounting and keeping of books',
    'Accounting must remain intact in the exact OCR regression sample.'
);
assertIncludes(
    exactOcrVariantResult,
    'account for the property received',
    'Account for must remain intact in the exact OCR regression sample.'
);
assertNotIncludes(
    exactOcrVariantResult,
    'of Manila',
    'A wrapped city line must be included in the personal-address redaction.'
);

const jurisdictionResult = sanitizeLocalText(
    'The complaint was filed before the Office of the City Prosecutor of Caloocan City.'
);
assertIncludes(
    jurisdictionResult,
    'Caloocan City',
    'A city used as a court jurisdiction must remain readable.'
);

const loanAgreementOcr = `--- Page 1 ---
SAMPLE 1 - LOAN AGREEMENT
Clean print / ordinary paragraphs
This Loan Agreement is made on 15 Auqust 2026 between Maria Santos, the
Creditor, and Northfield Trading, the Debtor. Both parties agree that the terms
below record a fictional transaction prepared solely for a text recognition test.
1. Principal Amount. The Creditor shall lend the Debtor PHP 125,000.00 upon
signing this Agreement. The Debtor acknowledges receipt by issuing a written
receipt with the date and amount actually received.
2. Repayment. The Debtor shall pay five monthly installments of PHP 25,000.00
each. Payment is due on the 15th day of every month beginning 15 September
2026 and ending 15 January 2027.
3. Late Payment. If an installment is unpaid for more than seven calendar days
after its due date, the parties shall first confirm the amount and provide a written
notice. This sample does not state that a payment is automatically waived.
4. Records. Each party shall keep copies of payment receipts and written notices.
Changes to the payment schedule must be dated and signed by both parties.
The names, dates, and amounts on this page are invented for testing. This
document is not a real contract.`;

const loanAgreementResult = sanitizeLocalText(loanAgreementOcr);
const loanAgreementDocumentResult = sanitizeDocumentText(loanAgreementOcr);
assertIncludes(
    loanAgreementResult,
    'document is not a real contract.',
    'Ordinary "is not" must remain in the exact loan OCR sample.'
);
assertIncludes(
    loanAgreementResult,
    'signed by both parties.',
    'Signing terms must remain readable when no signature is present.'
);
assertIncludes(
    loanAgreementResult,
    'PHP 125,000.00',
    'The loan amount must remain available for analysis.'
);
assertNotIncludes(
    loanAgreementResult,
    'Maria Santos',
    'The person identified as Creditor must still be redacted.'
);
assertNotIncludes(
    loanAgreementResult,
    'Northfield Trading',
    'The entity identified as Debtor must still be redacted.'
);
assertNotIncludes(
    loanAgreementResult,
    REDACTION.ID,
    'An ordinary loan sample must not contain a false case-ID marker.'
);
assertNotIncludes(
    loanAgreementResult,
    REDACTION.SIGNATURE,
    'A signing clause without signature data must not be redacted.'
);
assertIncludes(
    loanAgreementDocumentResult,
    'document is not a real contract.',
    'The document-level sanitizer must preserve the loan disclaimer.'
);
assertIncludes(
    loanAgreementDocumentResult,
    'signed by both parties.',
    'The document-level sanitizer must preserve the signing condition.'
);
if (containsPotentialSensitiveData(loanAgreementDocumentResult)) {
    throw new Error(
        '[FAIL] The sanitized loan sample must not trigger the privacy blocker.'
    );
}

const privateCaseReferenceResult = sanitizeLocalText(
    'NPS NO. XV-02-INV-26E-\n00823 and I.S. No. 26-12345 are private case references.'
);
assertNotIncludes(
    privateCaseReferenceResult,
    'XV-02-INV-26E-',
    'A wrapped NPS case identifier must still be removed.'
);
assertNotIncludes(
    privateCaseReferenceResult,
    '26-12345',
    'An explicit I.S. case identifier must still be removed.'
);
assertIncludes(
    privateCaseReferenceResult,
    REDACTION.ID,
    'Actual private case references must still be masked.'
);

const signatureFieldResult = sanitizeLocalText(
    'Signature: Maria Santos\nSigned by Juan Dela Cruz.'
);
assertNotIncludes(
    signatureFieldResult,
    'Maria Santos',
    'An explicit signature field must still be masked.'
);
assertNotIncludes(
    signatureFieldResult,
    'Juan Dela Cruz',
    'A named signatory must still be masked.'
);
assertIncludes(
    signatureFieldResult,
    REDACTION.SIGNATURE,
    'Signature details must still be protected.'
);

const serviceAgreementOcr = `--- Page 1 ---
SAMPLE 2 - SERVICE AGREEMENT
Dense clau ses/ smaller type
This Service Agreement is entered into on 2 Septe mber 2026 by Harbor
orbesign Studio (Provider)
and Cedar Market Cooperative (Client). The Provider shal prepare an inventory dashboard for the
Client using fictional data supplied for this test.
SECTION 1-scOPE. The Providerwill de Luera web dashboard. an exportable monthly report. and
a brief user guide. Requests outside this cope require a separate written estimate. The Client will
review each deliverable within ten business days after receipt.
SECTION 2-FEES. The project fee is PHP 48,500.00. The Client shall pay PHP 18.500.00 upon
approval of the design and PHP B0,000.00 after acceptance of the final dashboard. No additional
charge may be imposed without prior written approval.
SECTION3-CORRECTIONS. The Provider will correct reproduciblle defects reported within thirty
calendar days after acceptance.A new feature. re vised data sourCe, or change in business rules is
not automatically classified as a defect.!
SECTION4TERMINATION. Either party may terminate after giving fourteen calendar days of
Written notice. Amounts due forcompleted and accepted work remain payable. The parties shall
return confidential sample files within seven days after te rmination.
SECTION 5-CONFIDENTIALITY Test records must not contain custo mer names, addresses, contact
details, or actual sales transactions. Only fictional identifiers Such as ITEM-104 and ORDER-207
may appear in the demonstration data.
SECTION 6- REVIEW. The parties shall discuss a disputed invoice in writing before changing the
payment schedule. The sample wording is provided for OCR testing only and is not legal advice.`;
const serviceAgreementResult = sanitizeDocumentText(serviceAgreementOcr);
assertIncludes(
    serviceAgreementResult,
    '[REDACTED_ENTITY] (Client)',
    'The named organization is an entity, while the Client role survives.'
);
assertIncludes(
    serviceAgreementResult,
    'The Client shall pay PHP 18.500.00',
    'The Client role and uncertain OCR amount must remain visible for analysis.'
);
assertIncludes(
    serviceAgreementResult,
    'The Provider will correct reproduciblle defects',
    'The Provider role must not be redacted as a person.'
);
assertNotIncludes(
    serviceAgreementResult,
    'Cedar Market Cooperative',
    'The named organization is masked in the party declaration.'
);
assertNotIncludes(
    serviceAgreementResult,
    'Harbor\norbesign Studio',
    'A wrapped OCR business name must be masked while retaining Provider.'
);
if (containsPotentialSensitiveData(serviceAgreementResult)) {
    throw new Error('[FAIL] The sanitized service agreement triggered the privacy blocker.');
}

if (containsPotentialSensitiveData(legalPartyResult)) {
    throw new Error(
        '[FAIL] The sanitized legal-party sample still triggers the privacy fail-safe.'
    );
}

console.log('[PASS] sanitizer regression checks completed.');