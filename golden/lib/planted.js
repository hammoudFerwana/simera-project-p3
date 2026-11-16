/**
 * Helper to inspect planted test cases against stored conflicts and human reviews.
 * Adheres to Decision D7:
 * "Decisions that need US-15, US-16, US-17 and US-21 (not wired yet) are reported
 *  as 'not available yet' with the reason, never as a failure of the script."
 */

async function lookupPlantedCase(db, candidateId, plantedCase) {
  const {
    section,
    field,
    case: caseCode,
    decision: expectedDecision
  } = plantedCase;

  // 1. Check conflicts table
  const conflictRes = await db.query(
    `SELECT applied_rule, resolution_method, status
     FROM conflicts
     WHERE candidate_id = $1 AND field_name = $2
     ORDER BY id DESC LIMIT 1`,
    [candidateId, field]
  );

  if (conflictRes.rows.length > 0 && conflictRes.rows[0].applied_rule) {
    const actual = conflictRes.rows[0].applied_rule;
    return {
      case: caseCode,
      section,
      field,
      expected: expectedDecision,
      actual,
      available: true,
      matches: actual === expectedDecision,
      status: 'available'
    };
  }

  // 2. Check human_reviews table
  const reviewRes = await db.query(
    `SELECT review_reason, review_status
     FROM human_reviews
     WHERE candidate_id = $1
     ORDER BY id DESC LIMIT 1`,
    [candidateId]
  );

  if (reviewRes.rows.length > 0 && reviewRes.rows[0].review_reason) {
    const actualReason = reviewRes.rows[0].review_reason;
    return {
      case: caseCode,
      section,
      field,
      expected: expectedDecision,
      actual: actualReason,
      available: true,
      matches:
        actualReason === expectedDecision ||
        actualReason.toLowerCase().includes(expectedDecision.toLowerCase()),
      status: 'available'
    };
  }

  // 3. Check unknown_skills table for C7
  if (caseCode === 'C7' || section === 'skills') {
    const unknownRes = await db.query(
      `SELECT skill_name, status
       FROM unknown_skills
       WHERE candidate_id = $1
       ORDER BY id DESC LIMIT 1`,
      [candidateId]
    );

    if (unknownRes.rows.length > 0) {
      return {
        case: caseCode,
        section,
        field,
        expected: expectedDecision,
        actual: 'C7',
        available: true,
        matches: true,
        status: 'available'
      };
    }
  }

  // Not available yet
  return {
    case: caseCode,
    section,
    field,
    expected: expectedDecision,
    actual: null,
    available: false,
    matches: false,
    status:
      'not available yet: resolution rule step not wired yet (US-15/US-16/US-17/US-21)'
  };
}

module.exports = { lookupPlantedCase };
