const { loadConfig } = require('shared/src/config');

loadConfig();

console.log('worker started');

const intervalId = setInterval(() => {}, 1 << 30);

function handleShutdown() {
  clearInterval(intervalId);
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
