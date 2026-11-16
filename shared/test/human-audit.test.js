const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('shared/src/database');
const humanAudit = require('shared/src/audit/human-audit');
const { recordHumanChange, getAdminIdForUser } = humanAudit;

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

describe('Human Audit Service (US-20)', () => {
  const created = {
    auditLogIds: [],
    candidateProfileIds: [],
    adminIds: [],
    userIds: []
  };

  let adminUser;
  let candidateUser;
  let candidateProfile;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL must be set in .env');
    }

    const { rows } = await pool.query('SELECT current_database() AS name');
    if (!rows[0].name.startsWith('simera_test')) {
      throw new Error(
        `Database tests must run on a database starting with simera_test, not ${rows[0].name}`
      );
    }

    // Create admin user and admin record
    const adminEmail = `admin-audit-${nextId()}@example.com`;
    const adminUserRes = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, 'hash', true, NOW())
       RETURNING id`,
      [adminEmail]
    );
    const adminUserId = adminUserRes.rows[0].id;
    created.userIds.push(adminUserId);

    const adminRes = await pool.query(
      `INSERT INTO admins (user_id) VALUES ($1) RETURNING id`,
      [adminUserId]
    );
    const adminId = adminRes.rows[0].id;
    created.adminIds.push(adminId);

    adminUser = { userId: adminUserId, adminId, email: adminEmail };

    // Create candidate user and candidate profile
    const candidateEmail = `candidate-audit-${nextId()}@example.com`;
    const candidateUserRes = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, 'hash', true, NOW())
       RETURNING id`,
      [candidateEmail]
    );
    const candidateUserId = candidateUserRes.rows[0].id;
    created.userIds.push(candidateUserId);

    candidateUser = { userId: candidateUserId, email: candidateEmail };

    const profileRes = await pool.query(
      `INSERT INTO candidate_profiles (
         user_id, first_name, last_name, headline, summary, created_at
       )
       VALUES ($1, 'Audit', 'Candidate', 'Headline', 'Summary', NOW())
       RETURNING id`,
      [candidateUserId]
    );
    candidateProfile = { candidateId: profileRes.rows[0].id };
    created.candidateProfileIds.push(candidateProfile.candidateId);
  });

  afterAll(async () => {
    if (pool) {
      if (created.auditLogIds.length > 0) {
        await pool.query(
          'DELETE FROM human_audit_log WHERE id = ANY($1::int[])',
          [created.auditLogIds]
        );
      }
      if (created.candidateProfileIds.length > 0) {
        await pool.query(
          'DELETE FROM human_audit_log WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM candidate_profiles WHERE id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
      }
      if (created.adminIds.length > 0) {
        await pool.query('DELETE FROM admins WHERE id = ANY($1::int[])', [
          created.adminIds
        ]);
      }
      if (created.userIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
          created.userIds
        ]);
      }
      await pool.end();
    }
  });

  it('AC1: inside BEGIN/COMMIT, start_date 2019-05 to 2019-08 with reason "Checked the CV" -> one row with both values as jsonb, changed_by, timestamp and reason', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'work_experience',
        itemId: 101,
        fieldName: 'start_date',
        previousValue: '2019-05',
        newValue: '2019-08',
        changedBy: adminUser.adminId,
        reason: 'Checked the CV'
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(row).toBeDefined();
    created.auditLogIds.push(row.id);

    const { rows } = await pool.query(
      'SELECT * FROM human_audit_log WHERE id = $1',
      [row.id]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].previous_value).toBe('2019-05');
    expect(rows[0].new_value).toBe('2019-08');
    expect(rows[0].changed_by).toBe(adminUser.adminId);
    expect(rows[0].reason).toBe('Checked the CV');
    expect(rows[0].item_type).toBe('work_experience');
    expect(rows[0].item_id).toBe('101');
    expect(rows[0].field_name).toBe('start_date');
    expect(rows[0].timestamp instanceof Date).toBe(true);
  });

  it('AC2: the same value -> returns null and no row', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'work_experience',
        itemId: 102,
        fieldName: 'start_date',
        previousValue: '2019-05',
        newValue: '2019-05',
        changedBy: adminUser.adminId,
        reason: 'Confirmed unchanged'
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(row).toBeNull();

    const { rows } = await pool.query(
      'SELECT * FROM human_audit_log WHERE candidate_id = $1 AND item_id = $2',
      [candidateProfile.candidateId, '102']
    );
    expect(rows).toHaveLength(0);
  });

  it('{ a: 1, b: 2 } vs { b: 2, a: 1 } -> no row', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'work_experience',
        itemId: 103,
        fieldName: 'metadata',
        previousValue: { a: 1, b: 2 },
        newValue: { b: 2, a: 1 },
        changedBy: adminUser.adminId
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(row).toBeNull();

    const { rows } = await pool.query(
      'SELECT * FROM human_audit_log WHERE candidate_id = $1 AND item_id = $2',
      [candidateProfile.candidateId, '103']
    );
    expect(rows).toHaveLength(0);
  });

  it('null vs null -> no row', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'work_experience',
        itemId: 104,
        fieldName: 'description',
        previousValue: null,
        newValue: null,
        changedBy: adminUser.adminId
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(row).toBeNull();

    const { rows } = await pool.query(
      'SELECT * FROM human_audit_log WHERE candidate_id = $1 AND item_id = $2',
      [candidateProfile.candidateId, '104']
    );
    expect(rows).toHaveLength(0);
  });

  it('null vs "x" -> one row', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'work_experience',
        itemId: 105,
        fieldName: 'description',
        previousValue: null,
        newValue: 'x',
        changedBy: adminUser.adminId
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(row).toBeDefined();
    created.auditLogIds.push(row.id);

    const { rows } = await pool.query(
      'SELECT previous_value, new_value FROM human_audit_log WHERE id = $1',
      [row.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].previous_value).toBeNull();
    expect(rows[0].new_value).toBe('x');
  });

  it('AC3: item_type candidate_skills, field skill_id, null to 12 -> one row', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'candidate_skills',
        itemId: 201,
        fieldName: 'skill_id',
        previousValue: null,
        newValue: 12,
        changedBy: adminUser.adminId,
        reason: 'Linked unknown skill'
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(row).toBeDefined();
    created.auditLogIds.push(row.id);

    const { rows } = await pool.query(
      'SELECT item_type, field_name, previous_value, new_value, reason FROM human_audit_log WHERE id = $1',
      [row.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].item_type).toBe('candidate_skills');
    expect(rows[0].field_name).toBe('skill_id');
    expect(rows[0].previous_value).toBeNull();
    expect(rows[0].new_value).toBe(12);
    expect(rows[0].reason).toBe('Linked unknown skill');
  });

  it('AC4: a change written inside BEGIN, then ROLLBACK -> no row remains', async () => {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      row = await recordHumanChange(client, {
        candidateId: candidateProfile.candidateId,
        itemType: 'education',
        itemId: 301,
        fieldName: 'degree_level',
        previousValue: 'BSc',
        newValue: 'MSc',
        changedBy: adminUser.adminId,
        reason: 'Will be rolled back'
      });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    expect(row).toBeDefined();

    const { rows } = await pool.query(
      'SELECT * FROM human_audit_log WHERE id = $1',
      [row.id]
    );
    expect(rows).toHaveLength(0);
  });

  it('invalid itemType, itemId "abc", empty fieldName, changedBy 0 -> TypeError and no row', async () => {
    const client = await pool.connect();
    try {
      await expect(
        recordHumanChange(client, {
          candidateId: candidateProfile.candidateId,
          itemType: 'invalid_type',
          itemId: 1,
          fieldName: 'validation_test',
          previousValue: 'a',
          newValue: 'b',
          changedBy: adminUser.adminId
        })
      ).rejects.toThrow(TypeError);

      await expect(
        recordHumanChange(client, {
          candidateId: candidateProfile.candidateId,
          itemType: 'candidate_profile',
          itemId: 'abc',
          fieldName: 'validation_test',
          previousValue: 'a',
          newValue: 'b',
          changedBy: adminUser.adminId
        })
      ).rejects.toThrow(TypeError);

      await expect(
        recordHumanChange(client, {
          candidateId: candidateProfile.candidateId,
          itemType: 'candidate_profile',
          itemId: 1,
          fieldName: '',
          previousValue: 'a',
          newValue: 'b',
          changedBy: adminUser.adminId
        })
      ).rejects.toThrow(TypeError);

      await expect(
        recordHumanChange(client, {
          candidateId: candidateProfile.candidateId,
          itemType: 'candidate_profile',
          itemId: 1,
          fieldName: 'validation_test',
          previousValue: 'a',
          newValue: 'b',
          changedBy: 0
        })
      ).rejects.toThrow(TypeError);

      const { rows } = await pool.query(
        "SELECT * FROM human_audit_log WHERE field_name = 'validation_test'"
      );
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('getAdminIdForUser: the admin user -> its admins.id, a candidate user -> null', async () => {
    const resolvedAdminId = await getAdminIdForUser(pool, adminUser.userId);
    expect(resolvedAdminId).toBe(adminUser.adminId);

    const resolvedCandidateAdminId = await getAdminIdForUser(
      pool,
      candidateUser.userId
    );
    expect(resolvedCandidateAdminId).toBeNull();
  });

  it('the module exports no update or delete function', () => {
    const exports = Object.keys(humanAudit);
    const forbidden = exports.filter((key) => /update|delete/i.test(key));
    expect(forbidden).toEqual([]);
    expect(humanAudit.updateHumanChange).toBeUndefined();
    expect(humanAudit.deleteHumanChange).toBeUndefined();
  });
});
