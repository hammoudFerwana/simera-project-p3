const { loadConfig } = require('shared/src/config');
const { readMailConfig } = require('./mail/mailer');
const { createApp } = require('./app');

const config = loadConfig();

// Fail at startup, not at the first registration, when SMTP isn't configured.
try {
  readMailConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const port = config.API_PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
