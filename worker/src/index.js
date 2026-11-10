const { loadConfig } = require('shared/src/config');
const pool = require('shared/src/database');
const { startBoss, startWorker } = require('./queue');
const { processJob } = require('./process-job');

const config = loadConfig();

async function main() {
  const boss = await startBoss(config.DATABASE_URL);
  await startWorker(boss, pool, processJob);
  console.log('worker started');

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    try {
      await boss.stop();
      await pool.end();
    } catch (err) {
      console.error('error while stopping:', err.message);
    } finally {
      process.exit(0);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('worker failed to start:', err.message);
  process.exit(1);
});
