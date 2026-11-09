const { loadConfig } = require('shared/src/config');
const { createApp } = require('./app');

const config = loadConfig();
const port = config.API_PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
