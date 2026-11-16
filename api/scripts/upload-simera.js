/**
 * Uploads Simera JSON files (US-22) through the admin endpoint
 * POST /api/admin/simera-files, the same way the dev team would.
 *
 * Usage (the API must be running; Node 22, which has fetch and FormData):
 *   npm run simera:upload --workspace=api -- <file.json> [more.json ...]
 * File paths are relative to the folder the command is run from.
 *
 * Settings, read from the repository .env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD  the admin account (required)
 *   API_URL                      default http://localhost:<API_PORT or 3000>
 *
 * Each file is uploaded on its own; a rejected file does not stop the others.
 * The exit code is 1 when the login or any upload failed.
 */
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('shared/src/config');

loadConfig({ requiredVars: ['ADMIN_EMAIL', 'ADMIN_PASSWORD'] });

const API_URL = (
  process.env.API_URL || `http://localhost:${process.env.API_PORT || 3000}`
).replace(/\/+$/, '');

/** Logs in as the admin and returns the access_token cookie. */
async function loginAsAdmin() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Admin login failed (${response.status}): ${JSON.stringify(body.errors || body)}`
    );
  }
  if (!body.user || body.user.role !== 'admin') {
    throw new Error('ADMIN_EMAIL is not an admin account');
  }

  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('access_token='));
  if (!cookie) {
    throw new Error('The login response has no access_token cookie');
  }
  return cookie.split(';')[0];
}

/** Uploads one file; returns true when it was accepted. */
async function uploadFile(cookie, filePath) {
  const name = path.basename(filePath);
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    console.error(`✗ ${name}: cannot read the file (${error.code})`);
    return false;
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/json' }), name);

  const response = await fetch(`${API_URL}/api/admin/simera-files`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form
  });
  const body = await response.json().catch(() => ({}));

  if (response.status === 201) {
    console.log(
      `✓ ${name}: saved as file ${body.fileId} for candidate ${body.candidateId} (not sent to processing yet)`
    );
    return true;
  }
  const message = body.errors ? Object.values(body.errors).join(', ') : '';
  console.error(
    `✗ ${name}: ${response.status}${body.reason ? ` ${body.reason}` : ''} ${message}`.trim()
  );
  return false;
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error(
      'Usage: npm run simera:upload --workspace=api -- <file.json> [more.json ...]'
    );
    process.exit(1);
  }

  const cookie = await loginAsAdmin();
  let failed = 0;
  for (const file of files) {
    // npm runs workspace scripts from the workspace folder; INIT_CWD is the
    // folder the command was typed in, so paths are relative to it.
    const ok = await uploadFile(
      cookie,
      path.resolve(process.env.INIT_CWD || '.', file)
    );
    if (!ok) failed += 1;
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  // fetch() hides the network reason (e.g. ECONNREFUSED) in error.cause.
  const reason =
    error.cause && error.cause.code ? ` (${error.cause.code})` : '';
  const hint = reason ? `. Is the API running at ${API_URL}?` : '';
  console.error(`Simera upload failed: ${error.message}${reason}${hint}`);
  process.exit(1);
});
