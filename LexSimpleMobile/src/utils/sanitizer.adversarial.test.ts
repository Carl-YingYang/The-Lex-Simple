// SANITIZER ADVERSARIAL TEST v1.2 (document-level + CHAT tests: Tagalog 'Si/Kay/Sina' na pangalan, at mga tanong na HINDI dapat magbago)
// Ilagay beside sanitizer.ts sa src/utils/. Patakbuhin: npx tsx src/utils/sanitizer.adversarial.test.ts
// Layunin: hanapin ang PII na NAKAKALUSOT (LEAK) at ang legal text na NAWAWALA (OVER).
// Magfa-fail (throw) hangga't may LEAK o OVER. Idagdag ang bagong kaso kapag may nakitang bagong lusot.
import { buildSanitizedDocumentForAI, sanitizeDocumentForAI, sanitizeLocalText } from './sanitizer';

type C = { id: string; text: string; secrets: string[]; keep?: string[] };
const cases: C[] = [
 // ---------- NAMES ----------
 {id:'name-allcaps-intro', text:'This CONTRACT OF LEASE is made by JUAN MIGUEL DELA CRUZ, of legal age, Filipino, single, and MARIA CLARA SANTOS, of legal age, married.', secrets:['JUAN MIGUEL DELA CRUZ','MARIA CLARA SANTOS','DELA CRUZ','SANTOS']},
 {id:'name-titlecase', text:'KNOW ALL MEN BY THESE PRESENTS: I, Ramon Villanueva Reyes, Filipino citizen, hereby sell to Ana Lourdes Garcia the property.', secrets:['Ramon Villanueva Reyes','Ana Lourdes Garcia','Villanueva','Lourdes']},
 {id:'name-honorific', text:'Mr. Pedro Santos and Ms. Teresita Bautista appeared before me. Atty. Jose P. Rizal notarized.', secrets:['Pedro Santos','Teresita Bautista','Jose P. Rizal']},
 {id:'name-sig-block', text:'IN WITNESS WHEREOF, the parties signed.\n\n_________________\nJUAN M. DELA CRUZ\nLessee\n\n_________________\nCARLOS D. TAN\nLessor', secrets:['JUAN M. DELA CRUZ','CARLOS D. TAN','DELA CRUZ','CARLOS']},
 {id:'name-witness', text:'SIGNED IN THE PRESENCE OF: Roberto Aquino Lim and Lorna Mae Pascual', secrets:['Roberto Aquino Lim','Lorna Mae Pascual']},
 {id:'name-represented', text:'ABC Realty Corporation, represented by its President, Ana Lourdes Garcia, hereinafter the LESSOR', secrets:['Ana Lourdes Garcia']},
 {id:'name-lowercase-ocr', text:'between juan dela cruz and maria santos (the parties)', secrets:['juan dela cruz','maria santos']},
 {id:'name-suffix', text:'Pedro A. Reyes Jr. and Ma. Theresa B. Lim-Santos agree as follows', secrets:['Pedro A. Reyes','Theresa','Lim-Santos']},
 {id:'name-surname-first', text:'Borrower: DELA CRUZ, JUAN MIGUEL P.  Co-maker: SANTOS, MARIA CLARA', secrets:['DELA CRUZ, JUAN','JUAN MIGUEL','SANTOS, MARIA']},
 {id:'name-employee', text:'EMPLOYMENT CONTRACT. Employee: Kristine Joy Mendoza. Position: Cashier. Employer: Mega Foods Inc.', secrets:['Kristine Joy Mendoza','Mendoza']},
 {id:'name-tagalog-ako', text:'Ako si Rodel Bautista Manalo, nasa wastong gulang, ay nangangako na babayaran ang utang.', secrets:['Rodel Bautista Manalo','Manalo']},
 {id:'name-ocr-spaced', text:'J U A N   D E L A   C R U Z  nirerenta ang unit', secrets:['J U A N','D E L A']},
 {id:'name-in-sentence', text:'The LESSEE, Michael John Ocampo, shall pay PHP 15,000.00 monthly.', secrets:['Michael John Ocampo','Ocampo'], keep:['PHP 15,000.00']},
 // ---------- ADDRESSES ----------
 {id:'addr-full', text:'residing at No. 45 Mabini Street, Barangay Poblacion, Makati City, Metro Manila 1210', secrets:['45 Mabini','Poblacion','Makati','1210']},
 {id:'addr-unit', text:'with postal address at Unit 12B, Tower 2, Rockwell Center, Makati City', secrets:['12B','Rockwell','Tower 2']},
 {id:'addr-blk-lot', text:'Blk 5 Lot 12 Phase 2, Villa Verde Subd., Brgy. San Roque, Antipolo City, Rizal', secrets:['Blk 5','Villa Verde','San Roque','Antipolo']},
 {id:'addr-label', text:'Address: 123 Rizal Ave., Sta. Cruz, Manila', secrets:['123 Rizal','Sta. Cruz']},
 {id:'addr-lowercase', text:'naninirahan sa 77 sampaguita st brgy bagong silang caloocan city', secrets:['77 sampaguita','bagong silang','caloocan']},
 {id:'addr-property', text:'the property located at Lot 8, Block 3, Sunrise Homes, Brgy. Tabing Ilog, Marikina', secrets:['Sunrise Homes','Tabing Ilog','Marikina']},
 {id:'addr-province-only', text:'a resident of Barangay Mabuhay, Municipality of Sariaya, Province of Quezon', secrets:['Mabuhay','Sariaya']},
 // ---------- PHONES ----------
 {id:'ph-intl', text:'Contact +63 917 123 4567 for inquiries', secrets:['917 123 4567','917']},
 {id:'ph-dash', text:'Mobile: 0917-123-4567', secrets:['123-4567','0917']},
 {id:'ph-plain', text:'call 09171234567 anytime', secrets:['09171234567']},
 {id:'ph-odd-spacing', text:'phone 0917 123 45 67', secrets:['123 45 67']},
 {id:'ph-ocr-O', text:'Cell no. O917 123 4567', secrets:['123 4567']},
 {id:'ph-no-zero', text:'viber 917-123-4567', secrets:['917-123-4567']},
 {id:'ph-landline', text:'Tel. (02) 8123-4567 loc. 12', secrets:['8123-4567']},
 {id:'ph-landline-prov', text:'Tel No. (032) 412-3456', secrets:['412-3456']},
 {id:'ph-split-lines', text:'Contact no.: 0917\n123 4567', secrets:['123 4567']},
 {id:'ph-words', text:'mobile number zero nine one seven one two three four five six seven', secrets:['one two three']},
 // ---------- EMAILS / SOCIAL ----------
 {id:'em-plain', text:'Email: juan.delacruz@gmail.com', secrets:['juan.delacruz','gmail.com']},
 {id:'em-spaced', text:'email juan.delacruz @ gmail .com', secrets:['juan.delacruz','gmail']},
 {id:'em-ocr-comma', text:'send to maria_santos88@yahoo,com', secrets:['maria_santos88']},
 {id:'em-at-word', text:'juandelacruz (at) gmail (dot) com', secrets:['juandelacruz']},
 {id:'soc-fb', text:'facebook.com/juan.delacruz.123 and @juandelacruz on IG', secrets:['juan.delacruz.123','@juandelacruz']},
 {id:'soc-messenger', text:'Messenger: Juan Dela Cruz; Viber: 09171234567', secrets:['Juan Dela Cruz','09171234567']},
 // ---------- GOVERNMENT IDS ----------
 {id:'id-tin', text:'TIN: 123-456-789-000', secrets:['123-456-789']},
 {id:'id-tin-plain', text:'TIN 123456789', secrets:['123456789']},
 {id:'id-sss', text:'SSS No. 34-1234567-8', secrets:['34-1234567-8']},
 {id:'id-philhealth', text:'PhilHealth ID 12-345678901-2', secrets:['345678901']},
 {id:'id-pagibig', text:'Pag-IBIG MID No. 1234-5678-9012', secrets:['1234-5678-9012']},
 {id:'id-umid', text:'UMID CRN-0028-1234567-8', secrets:['0028-1234567']},
 {id:'id-passport', text:'Passport No. P1234567A issued at DFA Manila', secrets:['P1234567A']},
 {id:'id-drivers', text:"Driver's License No. N01-23-456789", secrets:['N01-23-456789']},
 {id:'id-prc', text:'PRC License No. 0123456 valid until 2027', secrets:['0123456']},
 {id:'id-philsys', text:'PhilSys ID 1234-5678-9012-3456', secrets:['1234-5678-9012-3456']},
 {id:'id-voter', text:"Voter's ID no. 1234-5678A-B1234", secrets:['1234-5678A']},
 {id:'id-postal', text:'Postal ID PRN 123456789012', secrets:['123456789012']},
 {id:'id-cedula', text:'Community Tax Certificate (Cedula) No. 12345678 issued at Manila', secrets:['12345678']},
 {id:'id-passport-lower', text:'passport p 1234567 a', secrets:['1234567']},
 // ---------- ACCOUNTS / CARDS ----------
 {id:'acct-label', text:'Account No. 1234-5678-90', secrets:['1234-5678-90']},
 {id:'acct-bank', text:'BDO savings account 0012 3456 7890', secrets:['0012 3456 7890']},
 {id:'acct-card', text:'Credit card 4111 1111 1111 1111 exp 12/27', secrets:['4111 1111 1111 1111']},
 {id:'acct-landbank', text:'Landbank acct # 1234567890 under the name of the borrower', secrets:['1234567890']},
 {id:'acct-gcash', text:'GCash number 09171234567; Maya 09181234567', secrets:['09171234567','09181234567']},
 {id:'acct-check', text:'Check No. 0001234567 drawn on Metrobank', secrets:['0001234567']},
 // ---------- DOB / PERSONAL ----------
 {id:'dob-label', text:'Date of Birth: 05/03/1990', secrets:['05/03/1990','1990']},
 {id:'dob-words', text:'born on March 5, 1990 in Cebu City', secrets:['March 5, 1990','Cebu City']},
 {id:'dob-pob', text:'Place of Birth: Davao City; Civil Status: Single; Age: 34', secrets:['Davao City']},
 {id:'dob-tagalog', text:'ipinanganak noong Marso 5, 1990', secrets:['Marso 5, 1990']},
 // ---------- OTHER IDENTIFIERS ----------
 {id:'oth-plate', text:'the vehicle with Plate No. ABC 1234, Engine No. 4G15-ZZ12345, Chassis No. MMBJNKB40ED012345', secrets:['ABC 1234','ZZ12345','MMBJNKB40ED012345']},
 {id:'oth-tct', text:'covered by TCT No. T-123456 of the Registry of Deeds of Quezon City, Tax Declaration No. 12-3456', secrets:['T-123456']},
 {id:'oth-notary', text:'Doc. No. 123; Page No. 45; Book No. 6; Series of 2024. Notary Public Commission No. 2024-123', secrets:[]},
 {id:'oth-employer-id', text:'Employee ID No. 2023-00456 Department: HR', secrets:['2023-00456']},
 {id:'oth-ip', text:'logged in from IP 192.168.1.15', secrets:['192.168.1.15']},
 {id:'oth-ocr-pipe', text:'Tel | 0917 | 123 | 4567', secrets:['123 | 4567']},
 {id:'oth-zero-width', text:'Mobile: 0917\u200b123\u200b4567', secrets:['0917','4567']},
 {id:'oth-fullwidth', text:'Email: ｊｕａｎ＠gmail.com', secrets:['gmail']},
 // ---------- OVER-REDACTION CHECK (legal text must survive) ----------
 {id:'keep-legal', text:'Pursuant to Article 1306 of the Civil Code and Republic Act No. 9653, the LESSEE shall pay PHP 25,000.00 on or before January 15, 2025 in Quezon City, Philippines. Section 4 provides a penalty of 5% per month.', secrets:[], keep:['Article 1306','Republic Act No. 9653','PHP 25,000.00','January 15, 2025','Section 4','5% per month']},
 {id:'keep-terms', text:'The LESSEE shall not sublease. Termination requires thirty (30) days written notice. Security deposit of two (2) months is non-refundable.', secrets:[], keep:['sublease','thirty (30) days','Security deposit']},
];

const rows2:string[] = [];
let leaks = 0, over = 0, blockedCount=0;
const rows:string[] = [];
for (const c of cases) {
  const r = sanitizeDocumentForAI(c.text);
  const out = r.safeText;
  const leaked = c.secrets.filter(s => out.toLowerCase().includes(s.toLowerCase()));
  const lost = (c.keep||[]).filter(k => !out.includes(k));
  if (r.blocked) blockedCount++;
  if (leaked.length) { leaks++; rows.push(`LEAK  [${c.id}] ${JSON.stringify(leaked)}\n       -> ${out.replace(/\n/g,' ⏎ ').slice(0,200)}  ${r.blocked?'(blocked=true)':''}`); }
  if (lost.length) { over++; rows.push(`OVER  [${c.id}] lost ${JSON.stringify(lost)}\n       -> ${out.slice(0,200)}`); }
}

// ============================================================
// DOCUMENT-LEVEL TESTS (buong flow: buildSanitizedDocumentForAI)
// Ang court-order sample ay galing sa aktwal na output ng app (may lumusot na pangalan).
// ============================================================
type D = { id: string; pages: string[]; secrets: string[]; keep?: string[] };
const docs: D[] = [
  {
    id: 'court-order-malolos',
    pages: ["Republic of the Philippines\nThird Judicial Region\nMUNICIPAL TRIAL COURT IN CITIES\nCity of Malolos, Bulacan\nBRANCH 1\n[REDACTED_EMAIL]\n[REDACTED_PHONE]\n[REDACTED_NAME],\nPlaintiff,\nversus -\n[REDACTED_NAME],\nAccused.\nCRIMINAL [REDACTED_ID]: Other Deceits\nORDER\nIn today's proceedings set for the continuation of the\npresentation of prosecution's evidence, (1) accused [REDACTED_NAME]; (2) private complainant Lara Michelle De Leon; (3) Atty. lan\nDuero, private prosecutor who is armed with an Authority to PrOsecute:\n(4) [REDACTED_NAME], accused's counsel de parte; (5)\nProsecution Attorney Celsa T. Faustino; and (6) [REDACTED_NAME]\nof the Public Attorney's Ofice are present in court.\nThe court notes the submission by Atty. Duero of a written\nAuthority to Prosecute issued by the Office of the City Prosecutor in his\nfavor.\nAtty. Duero called again his first witness, private complainant\nLara Michelle De Leon, for further examination. Her testimony is now\nterminated.\nAccordingly, set the continuation of the presentation of\nprosecution's evidence on July 29, 2026 at 1:30 in the afternoon. All\nparties present are notified of the next setting in open court.\nSO ORDERED\nFinally, the cout notes the joint manifestation of the counsels\nthat they intend to file a motion to pray that this case be calendared in\nthe morning, considering that the physical presence of the public\nprosecutor may now be dispensed with, in view of the issuance of a\nwritten Authority to Prosecute in favor of Atty. Duero.", 'In Open Court, June 17, 2026, City of Malolos, Province of\nBulacan, Philippines.\nsslinstodnogDoso GAYLE ANGEL) M. RECTO\no d ksiiw onssocos ni O Presiding Budge\nCopy furnished:\n1.\n2\n3\n4\n5\nOffice of the City Prosecutor City of Malolos, Bulacan\nAtty. lan Duero (private prosecutor)\n[REDACTED_NAME] (for the accused)\nLara Michelle De Leon (private complainant)\nRoy Faustino Pabio (accused)'].map(x=>x),
    secrets: ['Lara Michelle De Leon','Michelle','De Leon','Duero','Celsa','Faustino','GAYLE','ANGEL','RECTO','Roy Faustino Pabio','Pabio'],
    keep: ['Republic of the Philippines','City of Malolos','Authority to Prosecute','July 29, 2026','June 17, 2026','SO ORDERED','Presiding','Copy furnished','Office of the City Prosecutor','private prosecutor','private complainant','Atty.'],
  },
  {
    id: 'affidavit-multipage',
    pages: ['REPUBLIC OF THE PHILIPPINES )\nCITY OF QUEZON ) S.S.\nAFFIDAVIT OF LOSS\nI, MARITES SALAZAR DIAZ, of legal age, Filipino, married, do hereby depose and state:\n1. That I lost my wallet on October 3, 2026 while riding a jeepney.\n2. That I am executing this affidavit to attest to the truth of the foregoing.', '3. That Marites Diaz further states that the loss was witnessed by Mr. Danilo Cruz Perez.\nIN WITNESS WHEREOF, I have hereunto set my hand this 5th day of October 2026.\n\nMARITES S. DIAZ\nAffiant\n\nSUBSCRIBED AND SWORN to before me this 5th day of October 2026.\nNotary Public'],
    secrets: ['MARITES','Marites','SALAZAR','DIAZ','Diaz','Danilo','Perez','Cruz Perez'],
    keep: ['AFFIDAVIT OF LOSS','October 3, 2026','Notary Public','Affiant','SUBSCRIBED AND SWORN'],
  },
  {
    id: 'demand-letter-multipage',
    pages: ['LAW OFFICE OF BENJAMIN L. CASTILLO\nOctober 10, 2026\nDear Mr. Santos:\nWe write on behalf of our client regarding your unpaid obligation of PHP 120,000.00 under the Promissory Note.\nDemand is hereby made for payment within five (5) days from receipt of this letter, otherwise we shall file the appropriate case.', 'Failure to comply will compel our client to file a civil case against you, Mr. Santos, without further notice.\nVery truly yours,\n\nATTY. BENJAMIN L. CASTILLO\nCounsel for the Complainant\nReceived by: Rolando Santos Mercado'],
    secrets: ['BENJAMIN','Benjamin','CASTILLO','Castillo','Santos','Rolando','Mercado'],
    keep: ['PHP 120,000.00','five (5) days','Promissory Note','Counsel for the Complainant','Demand is hereby made'],
  },
];

let docLeaks = 0, docOver = 0;
for (const d of docs) {
  const pages = d.pages.map((text, i) => ({
    pageId: `p${i + 1}`, sessionId: 's1', pageNumber: i + 1, sourceUri: `file://p${i + 1}.jpg`, text,
  }));
  const r = buildSanitizedDocumentForAI(`doc-${d.id}`, pages);
  const out = r.combinedText;
  const leaked = d.secrets.filter(x => out.toLowerCase().includes(x.toLowerCase()));
  const lost = (d.keep || []).filter(k => !out.includes(k));
  if (leaked.length) { docLeaks++; rows2.push(`LEAK  [DOC ${d.id}] ${JSON.stringify(leaked)}`); }
  if (lost.length) { docOver++; rows2.push(`OVER  [DOC ${d.id}] lost ${JSON.stringify(lost)}`); }
}


// ============================================================
// CHAT TESTS (sanitizeLocalText: ginagamit sa AskAiScreen)
// 1) May personal na detalye -> dapat matakpan
// 2) Mga ordinaryong tanong -> dapat HINDI magbago kahit isang character
// ============================================================
const chatSecrets: { id: string; text: string; secrets: string[] }[] = [
  { id: 'chat-si-juan', text: 'Si Juan Dela Cruz ay nangungupahan sa 123 Rizal St.', secrets: ['Juan', 'Dela Cruz', '123 Rizal'] },
  { id: 'chat-kay-maria', text: 'Kay Maria Santos ako nagbabayad ng renta.', secrets: ['Maria', 'Santos'] },
  { id: 'chat-sina', text: 'Sina Pedro Reyes at Ana Lim ang may-ari ng unit.', secrets: ['Pedro Reyes', 'Ana Lim'] },
  { id: 'chat-ako-si', text: 'Ako si Rodel Manalo at may utang ako kay Carlos Tan.', secrets: ['Rodel Manalo', 'Carlos Tan', 'Manalo'] },
  { id: 'chat-phone', text: 'Tawagan mo ako sa 0917 123 4567 tungkol sa kontrata.', secrets: ['123 4567'] },
];
const chatKeep: string[] = [
  'Ano ang ibig sabihin ng indemnify?',
  'Ano ang Lessee?',
  'tf dimo alam kung ano yung Lessee?',
  'Ano ang Lessor?',
  'Ano ang security deposit?',
  'Pwede ba akong paalisin ng landlord nang walang notice?',
  'Ano ang Article 1686 ng Civil Code?',
  'Ano ang Affiant?',
  'Sino ang Plaintiff?',
  'Ano ang penalty clause?',
];
let chatLeaks = 0, chatOver = 0;
for (const c of chatSecrets) {
  const out = sanitizeLocalText(c.text);
  const leaked = c.secrets.filter(x => out.toLowerCase().includes(x.toLowerCase()));
  if (leaked.length) { chatLeaks++; rows2.push(`LEAK  [CHAT ${c.id}] ${JSON.stringify(leaked)} -> ${out}`); }
}
for (const q of chatKeep) {
  const out = sanitizeLocalText(q);
  if (out !== q) { chatOver++; rows2.push(`OVER  [CHAT keep] ${JSON.stringify(q)} -> ${JSON.stringify(out)}`); }
}

console.log(rows.join('\n'));
console.log(rows2.join('\n'));
console.log(`\nTOTAL cases=${cases.length}+${docs.length} docs  leaking=${leaks}  overRedacted=${over}  flaggedBlocked=${blockedCount}`);
leaks += docLeaks + chatLeaks; over += docOver + chatOver;
if (leaks > 0 || over > 0) {
  throw new Error(`[FAIL] ${leaks} leaking case(s), ${over} over-redacted case(s).`);
}
console.log('[PASS] sanitizer adversarial checks completed.');