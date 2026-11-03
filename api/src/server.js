const { loadConfig } = require('shared/src/config');
const app = require('./app');

const config = loadConfig();
const port = config.API_PORT || 3000;

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
