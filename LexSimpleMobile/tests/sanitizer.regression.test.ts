import {
    REDACTION,
    containsPotentialSensitiveData,
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

if (containsPotentialSensitiveData(legalPartyResult)) {
    throw new Error(
        '[FAIL] The sanitized legal-party sample still triggers the privacy fail-safe.'
    );
}

console.log('[PASS] sanitizer regression checks completed.');
