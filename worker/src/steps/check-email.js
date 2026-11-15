const { PermanentError } = require('shared/src/errors');

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Finds all email addresses in the text and in mailto: links.
 * Returns a lowercase, de-duplicated array.
 *
 * @param {string} text
 * @param {Array<{ label?: string, url?: string }>} links
 * @returns {string[]}
 */
function findEmails(text, links) {
  const found = [];

  if (typeof text === 'string') {
    const textMatches = text.match(EMAIL_REGEX);
    if (textMatches) {
      found.push(...textMatches);
    }
  }

  if (Array.isArray(links)) {
    for (const link of links) {
      const url = typeof link === 'string' ? link : link?.url;
      if (typeof url === 'string' && /^mailto:/i.test(url)) {
        const raw = url.replace(/^mailto:/i, '').split('?')[0];
        let decoded;
        try {
          decoded = decodeURIComponent(raw);
        } catch {
          decoded = raw;
        }
        const linkMatches = decoded.match(EMAIL_REGEX);
        if (linkMatches) {
          found.push(...linkMatches);
        }
      }
    }
  }

  return [...new Set(found.map((e) => e.toLowerCase()))];
}

/**
 * Decides whether the file emails match the account login email.
 * Case-insensitive comparison.
 *
 * Rules:
 * 1. fileEmails contains loginEmail (even with other addresses): continue.
 * 2. fileEmails is empty: continue, the login email is the file email.
 * 3. fileEmails is not empty and does not contain loginEmail: mismatch.
 *
 * @param {string[]} fileEmails
 * @param {string} loginEmail
 * @returns {{ ok: boolean }}
 */
function decideEmail(fileEmails, loginEmail) {
  if (!fileEmails || fileEmails.length === 0) {
    return { ok: true };
  }

  const normalizedLogin = (loginEmail || '').toLowerCase();
  const containsLogin = fileEmails.some(
    (e) => (e || '').toLowerCase() === normalizedLogin
  );

  if (containsLogin) {
    return { ok: true };
  }

  return { ok: false };
}

/**
 * Step factory for the email check step.
 *
 * @param {{ db: object }} options
 * @returns {Function} step function (ctx) => ctx
 */
function createCheckEmailStep({ db }) {
  return async function checkEmailStep(ctx) {
    const { rows } = await db.query(
      'SELECT u.email FROM candidate_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.id = $1',
      [ctx.candidateId]
    );

    if (rows.length === 0) {
      throw new PermanentError('Candidate account not found');
    }

    const loginEmail = rows[0].email;
    const fileEmails = findEmails(ctx.text, ctx.links);
    const decision = decideEmail(fileEmails, loginEmail);

    if (!decision.ok) {
      throw new PermanentError(
        'The file contains an email that does not match your account email'
      );
    }

    return {
      ...ctx,
      loginEmail: loginEmail.toLowerCase()
    };
  };
}

module.exports = {
  findEmails,
  decideEmail,
  createCheckEmailStep
};
