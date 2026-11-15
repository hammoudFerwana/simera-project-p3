const { loadConfig } = require('shared/src/config');
const pool = require('shared/src/database');
const {
  startBoss,
  startWorker,
  enqueueUnfinishedJobs
} = require('shared/src/queue');
const { processJob } = require('./process-job');

const config = loadConfig({
  requiredVars: [
    'NODE_ENV',
    'API_PORT',
    'DATABASE_URL',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'LLM_API_KEY'
  ]
});

async function main() {
  const boss = await startBoss(config.DATABASE_URL);
  await startWorker(boss, pool, processJob);
  const sent = await enqueueUnfinishedJobs(boss, pool);
  console.log(`worker started (${sent} unfinished jobs sent to the queue)`);

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
