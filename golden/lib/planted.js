/**
 * Looks up the decision the system recorded for a planted test case.
 *
 * Where each table's decision is stored (Requirements v2 tables A, B, C and the
 * README "Review routing (US-17)" section):
 * - Table A (A1 to A5): not a conflict, so no conflicts row is written for the
 *   field. The stored values themselves are checked by the field accuracy step.
 * - Table B (B1 to B3): a resolved conflicts row with resolution_method
 *   automatic_rule and applied_rule = the B code.
 * - Table C (C1 to C6): a pending human_reviews row on a conflicts row for the
 *   field, with the review_reason mapped below.
 * - C7: an unknown_skills row.
 */

const REVIEW_REASON_BY_CASE = Object.freeze({
  C1: 'conflict',
  C2: 'conflict',
  C3: 'item_match_uncertain',
  C4: 'intra_source_conflict',
  C5: 'validation_failure',
  C6: 'low_confidence',
  C7: 'unknown_skill'
});

// C3 reviews a whole item, so its conflicts row uses this field name.
const ITEM_FIELD_NAME = '__item__';

function result(plantedCase, actual, matches, status) {
  return {
    case: plantedCase.case,
    section: plantedCase.section,
    field: plantedCase.field,
    expected: plantedCase.decision,
    actual,
    available: true,
    matches,
    status
  };
}

async function lookupTableA(db, candidateId, plantedCase) {
  const { rows } = await db.query(
    `SELECT applied_rule, resolution_method, status
     FROM conflicts
     WHERE candidate_id = $1 AND field_name = $2
     ORDER BY id DESC LIMIT 1`,
    [candidateId, plantedCase.field]
  );

  if (rows.length === 0) {
    return result(
      plantedCase,
      `${plantedCase.decision} (no conflict row)`,
      true,
      'no conflict row, as table A requires'
    );
  }

  const row = rows[0];
  const actual = row.applied_rule || `conflict ${row.status}`;
  return result(
    plantedCase,
    actual,
    false,
    'table A case produced a conflict row'
  );
}

async function lookupTableB(db, candidateId, plantedCase) {
  const { rows } = await db.query(
    `SELECT applied_rule, resolution_method, status
     FROM conflicts
     WHERE candidate_id = $1
       AND field_name = $2
       AND resolution_method = 'automatic_rule'
     ORDER BY id DESC LIMIT 1`,
    [candidateId, plantedCase.field]
  );

  if (rows.length === 0) {
    return result(
      plantedCase,
      'none',
      false,
      'no automatic_rule conflict row recorded'
    );
  }

  const actual = rows[0].applied_rule;
  return result(
    plantedCase,
    actual,
    actual === plantedCase.decision,
    'automatic_rule conflict row'
  );
}

async function lookupTableC(db, candidateId, plantedCase) {
  const expectedReason = REVIEW_REASON_BY_CASE[plantedCase.decision];
  const fieldName =
    plantedCase.decision === 'C3' ? ITEM_FIELD_NAME : plantedCase.field;

  const { rows } = await db.query(
    `SELECT hr.review_reason, hr.review_status
     FROM human_reviews hr
     JOIN conflicts c
       ON hr.review_target_type = 'conflict'
      AND c.id = hr.item_id
     WHERE hr.candidate_id = $1 AND c.field_name = $2
     ORDER BY hr.id DESC LIMIT 1`,
    [candidateId, fieldName]
  );

  if (rows.length === 0) {
    return result(
      plantedCase,
      'none',
      false,
      `no human review recorded (expected ${expectedReason})`
    );
  }

  const actualReason = rows[0].review_reason;
  return result(
    plantedCase,
    `${actualReason} (${rows[0].review_status})`,
    actualReason === expectedReason,
    `human review, expected reason ${expectedReason}`
  );
}

async function lookupUnknownSkill(db, candidateId, plantedCase) {
  const { rows } = await db.query(
    `SELECT skill_name, status
     FROM unknown_skills
     WHERE candidate_id = $1
     ORDER BY id DESC LIMIT 1`,
    [candidateId]
  );

  if (rows.length === 0) {
    return result(plantedCase, 'none', false, 'no unknown skill recorded');
  }

  return result(
    plantedCase,
    `unknown_skill (${rows[0].status})`,
    true,
    'unknown skill recorded'
  );
}

async function lookupPlantedCase(db, candidateId, plantedCase) {
  const code = plantedCase.decision || plantedCase.case || '';

  if (code === 'C7') {
    return lookupUnknownSkill(db, candidateId, plantedCase);
  }
  if (code.startsWith('A')) {
    return lookupTableA(db, candidateId, plantedCase);
  }
  if (code.startsWith('B')) {
    return lookupTableB(db, candidateId, plantedCase);
  }
  if (REVIEW_REASON_BY_CASE[code]) {
    return lookupTableC(db, candidateId, plantedCase);
  }

  return {
    case: plantedCase.case,
    section: plantedCase.section,
    field: plantedCase.field,
    expected: plantedCase.decision,
    actual: null,
    available: false,
    matches: false,
    status: `unknown planted case code: ${code}`
  };
}

module.exports = { lookupPlantedCase, REVIEW_REASON_BY_CASE };
