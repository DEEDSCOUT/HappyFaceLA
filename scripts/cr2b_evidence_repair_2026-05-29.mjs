import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const spreadsheetId = '1RVCOE7mkGxu4YS18TmJhu3btxUQ1S26zFPDHs52kw9Q';
const testTab = '03_INTERNAL_QUOTE_TRAVEL_TEST_CR2B';
const evidenceTab = 'CR2B_REGRESSION_EVIDENCE';
const timestampValue = '2026-05-29';

const runJs = 'C:/Users/shawn/AppData/Roaming/npm/node_modules/@googleworkspace/cli/run.js';
const credentialFile = 'C:/Users/shawn/.local/share/google-workspace-mcp/credentials/info_at_happyfacesla_dot_com.json';
const summaryPath = 'C:/HappyFaceLA/artifacts/verification/cr2b_fix_2026-05-29_summary.json';

const expectedByTestId = {
  'TC-S01': 'VALID — CHOOSE ONE SERVICE',
  'TC-S02': 'VALID — CHOOSE ONE SERVICE',
  'TC-S03': 'VALID — CHOOSE ONE SERVICE',
  'TC-S04': 'BLOCKED — INVALID SERVICE SELECTION',
  'TC-S05': 'BLOCKED — INVALID SERVICE SELECTION',
  'TC-S06': 'BLOCKED — CHOOSE-ONE DOES NOT ACCEPT A SECOND SERVICE',
  'TC-S07': 'BLOCKED — INVALID FACE GEMS ADD-ON STATUS',
  'TC-S08': 'VALID — CHOOSE ONE WITH FACE GEMS ADD-ON',
  'TC-S09': 'VALID — TWO-SERVICE MIX',
  'TC-S10': 'VALID — TWO-SERVICE MIX',
  'TC-S11': 'BLOCKED — FACE GEMS ALREADY INCLUDED; CLARIFY ADD-ON REQUEST',
  'TC-S12': 'CUSTOM REVIEW REQUIRED — THREE-SERVICE REQUEST',
  'TC-S13': 'BLOCKED — DUPLICATE SERVICE SELECTION',
  'TC-S14': 'BLOCKED — INCOMPLETE SERVICE SELECTION',
  'TC-S15': 'BLOCKED — INVALID SERVICE SELECTION',

  'TC-E01': 'VALID — STANDARD OPERATIONAL LANE',
  'TC-E02': 'CUSTOM REVIEW REQUIRED — SCHOOL EVENT',
  'TC-E03': 'CUSTOM REVIEW REQUIRED — FESTIVAL EVENT',
  'TC-E04': 'CUSTOM REVIEW REQUIRED — CORPORATE EVENT',
  'TC-E05': 'CUSTOM REVIEW REQUIRED — VENDOR PROMOTION',
  'TC-E06': 'CUSTOM REVIEW REQUIRED — OTHER EVENT',
  'TC-E07': 'BLOCKED — SELECT EVENT TYPE',
  'TC-E08': 'BLOCKED — INVALID EVENT TYPE',
  'TC-E09': 'BLOCKED — INVALID ARTIST COUNT',
  'TC-E10': 'BLOCKED — INVALID ARTIST COUNT',
  'TC-E11': 'BLOCKED — INVALID ARTIST COUNT',
  'TC-E12': 'BLOCKED — INVALID ARTIST COUNT',
  'TC-E13': 'CUSTOM REVIEW REQUIRED — MULTI-ARTIST',
  'TC-E14': 'BLOCKED — INVALID EXCEPTION FLAG',
  'TC-E15': 'BLOCKED — INVALID EXCEPTION FLAG',
  'TC-E16': 'CUSTOM REVIEW REQUIRED — EXCEPTION FLAG',

  'TC-C01': 'BLOCKED — INVALID CHILD COUNT',
  'TC-C02': 'BLOCKED — INVALID CHILD COUNT',
  'TC-C03': 'BLOCKED — INVALID CHILD COUNT',
  'TC-C04': 'BLOCKED — INVALID CHILD COUNT',
  'TC-C05': 'COVERAGE CONFIRMED — NO GUARANTEE REQUESTED',
  'TC-C06': 'COVERAGE CONFIRMATION REQUIRED — MANUAL REVIEW',
  'TC-C07': 'BLOCKED — INVALID COVERAGE SELECTION',
  'TC-C08': 'BLOCKED — COVERAGE SELECTION REQUIRED',
  'TC-C09': 'COVERAGE CONFIRMATION REQUIRED — MANUAL REVIEW',

  'TC-T01': 'TRAVEL ELIGIBLE — LOCAL ZONE',
  'TC-T02': 'TRAVEL ELIGIBLE — LOCAL ZONE',
  'TC-T03': 'BLOCKED — 2-HOUR MINIMUM REQUIRED FOR TRAVEL ZONE',
  'TC-T04': 'TRAVEL ELIGIBLE — NO-FEE ZONE',
  'TC-T05': 'BLOCKED — 2-HOUR MINIMUM REQUIRED FOR TRAVEL ZONE',
  'TC-T06': 'TRAVEL ELIGIBLE — MILEAGE ZONE',
  'TC-T07': 'MANUAL APPROVAL REQUIRED — FARTHER-DISTANCE ZONE',
  'TC-T08': 'CUSTOM REVIEW REQUIRED — OUT-OF-RANGE DISTANCE',
  'TC-T09': 'BLOCKED — PRIVATE DISPATCH REFERENCE CONTROL REQUIRED',
  'TC-T10': 'BLOCKED — INVALID MILEAGE INPUT',
  'TC-T11': 'MANUAL APPROVAL REQUIRED — FARTHER-DISTANCE ZONE',

  'TC-M01': 'BLOCKED — INVALID MONETARY INPUT',
  'TC-M02': 'BLOCKED — INVALID MONETARY INPUT',
  'TC-M03': 'BLOCKED — INVALID MONETARY INPUT',
  'TC-M04': 'BLOCKED — INVALID MONETARY INPUT',
  'TC-M05': 'BLOCKED — INVALID MONETARY INPUT',
  'TC-M06': 'VALID — MONETARY INPUTS',
  'TC-M07': 'BLOCKED — INVALID MONETARY INPUT',
  'TC-M08': 'MANUAL REVIEW REQUIRED — CUSTOM ADJUSTMENT',

  'TC-R01': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',
  'TC-R02': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',
  'TC-R03': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',
  'TC-R04': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',
  'TC-R05': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',
  'TC-R06': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',
  'TC-R07': 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO',

  'TC-D01': 'BLOCKED — SELECT DURATION',
  'TC-D02': 'VALID — DURATION',
  'TC-D03': 'VALID — DURATION',
  'TC-D04': 'VALID — DURATION',
  'TC-D05': 'BLOCKED — INVALID DURATION',
  'TC-D06': 'BLOCKED — INVALID DURATION'
};

const retainerTriples = {
  'TC-R01': [249, 50, 199],
  'TC-R02': [250, 100, 150],
  'TC-R03': [599, 100, 499],
  'TC-R04': [600, 150, 450],
  'TC-R05': [650, 162.5, 487.5],
  'TC-R06': [799, 199.75, 599.25],
  'TC-R07': [800, 200, 600]
};

function sleep(ms) {
  const shared = new SharedArrayBuffer(4);
  const view = new Int32Array(shared);
  Atomics.wait(view, 0, 0, ms);
}

function runGwsJson(args) {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let out;
    try {
      out = execFileSync(
        'node',
        [runJs, ...args, '--format', 'json'],
        {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
          env: {
            ...process.env,
            GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: credentialFile
          }
        }
      );
    } catch (err) {
      const stdout = err.stdout ? String(err.stdout) : '';
      const stderr = err.stderr ? String(err.stderr) : '';
      const combined = `${stdout}\n${stderr}`;
      const quotaHit = /quota exceeded|read requests per minute|\"code\"\s*:\s*429|429/i.test(combined);
      if (quotaHit && attempt < maxAttempts) {
        const waitMs = Math.min(60000, 5000 * attempt);
        console.warn(`Quota limit hit for ${args[3] || args[0]} (attempt ${attempt}/${maxAttempts}). Waiting ${waitMs}ms...`);
        sleep(waitMs);
        continue;
      }
      throw new Error(`gws failed: ${args.join(' ')}\n${stdout}\n${stderr}`);
    }

    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`Unable to locate JSON payload in output for args: ${args.join(' ')}\n${out}`);
    }

    const payload = out.slice(start, end + 1);
    const obj = JSON.parse(payload);
    if (obj.error) {
      const quotaHit = obj.error.code === 429 || /quota exceeded|read requests per minute/i.test(String(obj.error.message || ''));
      if (quotaHit && attempt < maxAttempts) {
        const waitMs = Math.min(60000, 5000 * attempt);
        console.warn(`Quota API response for ${args[3] || args[0]} (attempt ${attempt}/${maxAttempts}). Waiting ${waitMs}ms...`);
        sleep(waitMs);
        continue;
      }
      throw new Error(`gws API error for ${args.join(' ')}: ${JSON.stringify(obj.error)}`);
    }

    return obj;
  }

  throw new Error(`Exceeded retry attempts for gws call: ${args.join(' ')}`);
}

function cell(row, idx) {
  if (!Array.isArray(row)) return '';
  if (idx < row.length && row[idx] != null) return String(row[idx]);
  return '';
}

function colValueAtOffset(valueRange, offset) {
  if (!valueRange || !Array.isArray(valueRange.values)) return '';
  if (offset < 0 || offset >= valueRange.values.length) return '';
  const r = valueRange.values[offset];
  if (!Array.isArray(r) || r.length < 1 || r[0] == null) return '';
  return String(r[0]);
}

function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numEq(actual, expected) {
  const n = parseNum(actual);
  return n !== null && Math.abs(n - expected) < 1e-6;
}

function addAnomaly(list, text) {
  if (!list.includes(text)) list.push(text);
}

function main() {
  const inputData = runGwsJson([
    'sheets', 'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId, range: `${evidenceTab}!A2:R73` })
  ]);

  const rows = Array.isArray(inputData.values) ? inputData.values : [];
  if (rows.length !== 72) {
    throw new Error(`Expected 72 rows in ${evidenceTab}!A2:R73, got ${rows.length}`);
  }

  const allOutputRows = [];
  const failedTestIds = [];
  const anomalies = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx];
    const sheetRow = rowIdx + 2;

    const testId = cell(row, 0);
    const domain = cell(row, 1);

    const inD = cell(row, 3);
    const inE = cell(row, 4);
    const inF = cell(row, 5);
    const inG = cell(row, 6);
    const inH = cell(row, 7);
    const inI = cell(row, 8);
    const inJ = cell(row, 9);
    const inK = cell(row, 10);
    const inL = cell(row, 11);
    const inM = cell(row, 12);
    const inN = cell(row, 13);
    const inO = cell(row, 14);
    const inP = cell(row, 15);
    const inQ = cell(row, 16);
    const inR = cell(row, 17);

    const wInputs = [inD, inE, inF, inH, inI, inJ, inK, inL, inM, inN, inO, inP].map((v) => [v]);

    runGwsJson([
      'sheets', 'spreadsheets', 'values', 'batchUpdate',
      '--params', JSON.stringify({ spreadsheetId, valueInputOption: 'USER_ENTERED' }),
      '--json', JSON.stringify({
        data: [
          { range: `${testTab}!W6:W17`, values: wInputs },
          { range: `${testTab}!Y8`, values: [[inG]] },
          { range: `${testTab}!Y9`, values: [[inQ]] },
          { range: `${testTab}!W19`, values: [[inR]] }
        ]
      })
    ]);

    const outputsObj = runGwsJson([
      'sheets', 'spreadsheets', 'values', 'batchGet',
      '--params', JSON.stringify({
        spreadsheetId,
        ranges: [
          `${testTab}!Y11:Y12`,
          `${testTab}!Y20:Y24`,
          `${testTab}!W20:W30`
        ]
      })
    ]);

    const ranges = Array.isArray(outputsObj.valueRanges) ? outputsObj.valueRanges : [];

    const y11 = colValueAtOffset(ranges[0], 0);
    const y12 = colValueAtOffset(ranges[0], 1);
    const y20 = colValueAtOffset(ranges[1], 0);
    const y21 = colValueAtOffset(ranges[1], 1);
    const y22 = colValueAtOffset(ranges[1], 2);
    const y23 = colValueAtOffset(ranges[1], 3);
    const y24 = colValueAtOffset(ranges[1], 4);

    const w20 = colValueAtOffset(ranges[2], 0);
    const w21 = colValueAtOffset(ranges[2], 1);
    const w22 = colValueAtOffset(ranges[2], 2);
    const w23 = colValueAtOffset(ranges[2], 3);
    const w24 = colValueAtOffset(ranges[2], 4);
    const w25 = colValueAtOffset(ranges[2], 5);
    const w26 = colValueAtOffset(ranges[2], 6);
    const w27 = colValueAtOffset(ranges[2], 7);
    const w28 = colValueAtOffset(ranges[2], 8);
    const w29 = colValueAtOffset(ranges[2], 9);
    const w30 = colValueAtOffset(ranges[2], 10);

    let observedResult = '';
    if (domain === 'Service') observedResult = y20;
    if (domain === 'Event') observedResult = y21;
    if (domain === 'Coverage') observedResult = testId === 'TC-C09' ? y24 : y22;
    if (domain === 'Travel') observedResult = testId === 'TC-T11' ? y24 : y23;
    if (domain === 'Monetary') observedResult = y11;
    if (domain === 'Duration') observedResult = y12;
    if (domain === 'Retainer') observedResult = `W26=${w26}|W27=${w27}|W28=${w28}`;

    const expectedResult = expectedByTestId[testId] || '';

    let passFail = 'FAIL';
    if (retainerTriples[testId]) {
      const [e26, e27, e28] = retainerTriples[testId];
      const ok = numEq(w26, e26) && numEq(w27, e27) && numEq(w28, e28);
      if (ok) passFail = 'PASS';
    } else if (observedResult === expectedResult) {
      passFail = 'PASS';
    }

    if (passFail === 'FAIL') failedTestIds.push(testId);

    if (y20.includes('FACE GEMS ADD-ON') && !y20.includes('INVALID') && !y20.includes('ALREADY INCLUDED')) {
      if (!numEq(w22, 50)) {
        addAnomaly(anomalies, `${testId}: face gems add-on anomaly (W22=${w22})`);
      }
    }

    let baseExpected = null;
    if (inE === 'Choose One Party Service' && inR === '1 Hour') baseExpected = 150;
    if (inE === 'Choose One Party Service' && inR === '90 Minutes') baseExpected = 215;
    if (inE === 'Choose One Party Service' && inR === '2 Hours') baseExpected = 275;
    if (inE === 'Two-Service Party Mix' && inR === '1 Hour') baseExpected = 180;
    if (baseExpected !== null && !numEq(w20, baseExpected)) {
      addAnomaly(anomalies, `${testId}: base ladder mismatch (W20=${w20} expected=${baseExpected})`);
    }

    const nW21 = parseNum(w21);
    if ((y23.includes('LOCAL ZONE') || y23.includes('NO-FEE ZONE')) && nW21 !== null && Math.abs(nW21) > 1e-6) {
      addAnomaly(anomalies, `${testId}: travel fee mismatch (Y23=${y23}, W21=${w21})`);
    }
    if ((y23.includes('MILEAGE ZONE') || y23.includes('FARTHER-DISTANCE ZONE')) && (nW21 === null || nW21 <= 0)) {
      addAnomaly(anomalies, `${testId}: travel fee mismatch (Y23=${y23}, W21=${w21})`);
    }

    const gateText = `${y20} ${y21} ${y22} ${y23} ${y24}`;
    if (/BLOCKED|CUSTOM REVIEW REQUIRED|MANUAL APPROVAL REQUIRED|COVERAGE CONFIRMATION REQUIRED/.test(gateText)) {
      const numW26 = parseNum(w26);
      const numW27 = parseNum(w27);
      const numW28 = parseNum(w28);
      if (numW26 !== null) addAnomaly(anomalies, `${testId}: numeric W26 in blocked/custom/manual state (${w26})`);
      if (numW27 !== null) addAnomaly(anomalies, `${testId}: numeric W27 in blocked/custom/manual state (${w27})`);
      if (numW28 !== null) addAnomaly(anomalies, `${testId}: numeric W28 in blocked/custom/manual state (${w28})`);
    }

    const rowOut = [
      y11, y12,
      y20, y21, y22, y23, y24,
      w20, w21, w22, w23, w24, w25, w26, w27, w28, w29, w30,
      expectedResult, observedResult, passFail, timestampValue
    ];

    allOutputRows.push(rowOut);
    console.log(`Processed ${testId} row ${sheetRow}: ${passFail}`);
  }

  const chunkSize = 8;
  for (let start = 0; start < allOutputRows.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, allOutputRows.length);
    const chunk = allOutputRows.slice(start, end);
    const startRow = 2 + start;
    const endRow = 1 + end;

    runGwsJson([
      'sheets', 'spreadsheets', 'values', 'batchUpdate',
      '--params', JSON.stringify({ spreadsheetId, valueInputOption: 'USER_ENTERED' }),
      '--json', JSON.stringify({
        data: [
          { range: `${evidenceTab}!S${startRow}:AN${endRow}`, values: chunk }
        ]
      })
    ]);
  }

  runGwsJson([
    'sheets', 'spreadsheets', 'values', 'batchUpdate',
    '--params', JSON.stringify({ spreadsheetId, valueInputOption: 'USER_ENTERED' }),
    '--json', JSON.stringify({
      data: [
        { range: `${evidenceTab}!C61:C67`, values: Array.from({ length: 7 }, () => ['Yes']) }
      ]
    })
  ]);

  const baselineWInputs = [
    ['Private Birthday / Family Party'],
    ['Choose One Party Service'],
    ['Face Painting'],
    ['10'],
    ['1'],
    ['0'],
    ['Yes'],
    ['No'],
    ['0'],
    ['0'],
    ['0'],
    ['No']
  ];

  runGwsJson([
    'sheets', 'spreadsheets', 'values', 'batchUpdate',
    '--params', JSON.stringify({ spreadsheetId, valueInputOption: 'USER_ENTERED' }),
    '--json', JSON.stringify({
      data: [
        { range: `${testTab}!W6:W17`, values: baselineWInputs },
        { range: `${testTab}!Y8`, values: [['']] },
        { range: `${testTab}!Y9`, values: [['No']] },
        { range: `${testTab}!W19`, values: [['1 Hour']] }
      ]
    })
  ]);

  const stData = runGwsJson([
    'sheets', 'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId, range: `${evidenceTab}!S2:T73` })
  ]);
  const akData = runGwsJson([
    'sheets', 'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId, range: `${evidenceTab}!AK2:AK73` })
  ]);

  const stRows = Array.isArray(stData.values) ? stData.values : [];
  const akRows = Array.isArray(akData.values) ? akData.values : [];

  let stAllPopulated = true;
  for (let i = 0; i < 72; i += 1) {
    if (i >= stRows.length) {
      stAllPopulated = false;
      break;
    }
    const r = stRows[i] || [];
    if (r.length < 2 || String(r[0] || '').trim() === '' || String(r[1] || '').trim() === '') {
      stAllPopulated = false;
      break;
    }
  }

  let akAllPopulated = true;
  for (let i = 0; i < 72; i += 1) {
    if (i >= akRows.length) {
      akAllPopulated = false;
      break;
    }
    const r = akRows[i] || [];
    if (r.length < 1 || String(r[0] || '').trim() === '') {
      akAllPopulated = false;
      break;
    }
  }

  const passCount = allOutputRows.filter((r) => r[20] === 'PASS').length;
  const failCount = allOutputRows.filter((r) => r[20] === 'FAIL').length;

  const summary = {
    spreadsheetId,
    testTab,
    evidenceTab,
    processedRows: 72,
    passCount,
    failCount,
    failedTestIds,
    stAllPopulated,
    akAllPopulated,
    anomalies
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${summaryPath}`);
}

main();
