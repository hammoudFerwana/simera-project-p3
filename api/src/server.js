const { loadConfig } = require('shared/src/config');
const { readMailConfig } = require('./mail/mailer');
const { readAuthConfig } = require('./auth/token');
const { readUploadConfig } = require('shared/src/upload/upload.config');
const { createApp } = require('./app');

const config = loadConfig();

// Fail at startup, not at the first registration, login or upload, when SMTP,
// the JWT secret or the upload settings aren't configured correctly.
try {
  readMailConfig();
  readAuthConfig();
  readUploadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const port = config.API_PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
