const { calculateRate } = require('./compare');

/**
 * An entry passes when its status matches. A rejection that names an expected
 * reason passes only when the actual reason is the same.
 */
function entryPassed(entry) {
  if (entry.expectedStatus !== entry.actualStatus) {
    return false;
  }
  if (entry.expectedStatus === 'rejected' && entry.expectedRejectReason) {
    return entry.rejectReason === entry.expectedRejectReason;
  }
  return true;
}

function generateMarkdownReport(data) {
  const {
    timestamp = new Date().toISOString(),
    entryResults = [],
    overallAccuracy = { compared: 0, matched: 0 },
    sectionAccuracy = {},
    dateAccuracy = { compared: 0, matched: 0 },
    experienceResults = [],
    conflictsSplit = { automaticCount: 0, reviewCount: 0 },
    plantedResults = []
  } = data;

  const overallRate = calculateRate(
    overallAccuracy.matched,
    overallAccuracy.compared
  );
  const dateRate = calculateRate(dateAccuracy.matched, dateAccuracy.compared);

  const lines = [];

  lines.push('# Golden Dataset Accuracy Report');
  lines.push('');
  lines.push(`**Generated at:** ${timestamp}`);
  lines.push('');

  // 1. Executive Summary
  lines.push('## 1. Executive Summary');
  lines.push('');
  lines.push(`- **Total Dataset Entries:** ${entryResults.length}`);
  lines.push(
    `- **Overall Field Accuracy:** ${overallAccuracy.matched} / ${overallAccuracy.compared} (${overallRate}%)`
  );
  lines.push(
    `- **Date Exact-Match Rate:** ${dateAccuracy.matched} / ${dateAccuracy.compared} (${dateRate}%)`
  );
  lines.push(
    `- **Automatic vs Review Split:** ${conflictsSplit.automaticCount} automatic / ${conflictsSplit.reviewCount} human review`
  );
  lines.push('');

  // 2. Per-Entry Execution Breakdown
  lines.push('## 2. Per-Entry Breakdown');
  lines.push('');
  lines.push(
    '| ID | File | Source | Expected | Actual | Job Status | Result / Reason |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');

  for (const entry of entryResults) {
    const statusMatch = entryPassed(entry) ? 'PASS' : 'FAIL';
    const reason =
      entry.failureReason ||
      entry.rejectReason ||
      (statusMatch === 'PASS' ? 'OK' : 'Mismatch');
    lines.push(
      `| ${entry.id} | ${entry.file} | ${entry.sourceType} | ${entry.expectedStatus} | ${entry.actualStatus} | ${entry.jobStatus || 'N/A'} | ${statusMatch}: ${reason} |`
    );
  }
  lines.push('');

  // 3. Field Accuracy (Overall & Per-Section)
  lines.push('## 3. Field Accuracy');
  lines.push('');
  lines.push(
    `**Overall Accuracy:** ${overallAccuracy.matched} / ${overallAccuracy.compared} (${overallRate}%)`
  );
  lines.push('');
  lines.push('| Section | Compared Fields | Matched Fields | Accuracy Rate |');
  lines.push('| --- | --- | --- | --- |');

  for (const [section, stats] of Object.entries(sectionAccuracy)) {
    const rate = calculateRate(stats.matched, stats.compared);
    lines.push(
      `| ${section} | ${stats.compared} | ${stats.matched} | ${rate}% |`
    );
  }
  lines.push('');

  // 4. Date Exact-Match Rate
  lines.push('## 4. Date Exact-Match Rate');
  lines.push('');
  lines.push(`- **Compared Date Fields:** ${dateAccuracy.compared}`);
  lines.push(`- **Matched Date Fields:** ${dateAccuracy.matched}`);
  lines.push(`- **Exact-Match Rate:** ${dateRate}%`);
  lines.push('');

  // 5. Experience Months Comparison
  lines.push('## 5. Experience Months Verification');
  lines.push('');
  lines.push('| Entry ID | Expected Months | Actual Months | Match |');
  lines.push('| --- | --- | --- | --- |');

  if (experienceResults.length === 0) {
    lines.push('| N/A | None tested | N/A | N/A |');
  } else {
    for (const exp of experienceResults) {
      lines.push(
        `| ${exp.id} | ${exp.expected ?? 'N/A'} | ${exp.actual ?? 'N/A'} | ${exp.matches ? 'YES' : 'NO'} |`
      );
    }
  }
  lines.push('');

  // 6. Automatic vs Review Split
  lines.push('## 6. Automatic Resolution vs Human Review');
  lines.push('');
  const totalDecisions =
    conflictsSplit.automaticCount + conflictsSplit.reviewCount;
  const autoPercent =
    totalDecisions > 0
      ? calculateRate(conflictsSplit.automaticCount, totalDecisions)
      : 0;
  const reviewPercent =
    totalDecisions > 0
      ? calculateRate(conflictsSplit.reviewCount, totalDecisions)
      : 0;

  lines.push(
    `- **Automatic Rule Resolutions (A & B):** ${conflictsSplit.automaticCount} (${autoPercent}%)`
  );
  lines.push(
    `- **Human Reviews Triggered (C):** ${conflictsSplit.reviewCount} (${reviewPercent}%)`
  );
  lines.push(`- **Total Conflicts Tracked:** ${totalDecisions}`);
  lines.push('');

  // 7. Planted Cases & Decisions
  lines.push('## 7. Planted Cases & Decisions');
  lines.push('');
  lines.push(
    '| Case | Section | Field | Expected Decision | Actual Decision / Status | Match |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');

  if (plantedResults.length === 0) {
    lines.push('| N/A | None | None | N/A | N/A | N/A |');
  } else {
    const matched = plantedResults.filter((p) => p.matches).length;
    for (const p of plantedResults) {
      const actualText = p.available ? p.actual : p.status;
      const matchText = p.matches ? 'PASS' : 'FAIL';
      lines.push(
        `| ${p.case} | ${p.section} | ${p.field} | ${p.expected} | ${actualText} | ${matchText} |`
      );
    }
    lines.push('');
    lines.push(
      `**Planted cases matched:** ${matched} / ${plantedResults.length}`
    );
  }
  lines.push('');

  // 8. Expected Failures
  lines.push('## 8. Expected Failures');
  lines.push('');
  const rejectedEntries = entryResults.filter(
    (e) => e.expectedStatus === 'rejected'
  );
  for (const rej of rejectedEntries) {
    const passed = entryPassed(rej) ? 'PASSED' : 'FAILED';
    const expectedText = rej.expectedRejectReason || 'any reason';
    lines.push(
      `- **${rej.id} (${rej.file}):** [${passed}] Expected rejection with "${expectedText}", actual: "${rej.rejectReason || 'none'}"`
    );
  }
  lines.push('');

  return lines.join('\n');
}

module.exports = { generateMarkdownReport, entryPassed };
