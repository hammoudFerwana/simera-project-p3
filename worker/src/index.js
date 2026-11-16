const { loadConfig } = require('shared/src/config');
const pool = require('shared/src/database');
const {
  startBoss,
  startWorker,
  enqueueUnfinishedJobs,
  startQueueSweep
} = require('shared/src/queue');
const { processJob } = require('./process-job');
const { loadSkillIndex } = require('./skills/skill-index');

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

// How often lost 'queued' jobs are sent to the queue again (optional).
function sweepIntervalSeconds() {
  const value = Number(process.env.QUEUE_SWEEP_INTERVAL_SECONDS);
  return Number.isInteger(value) && value > 0 ? value : 60;
}

async function main() {
  const boss = await startBoss(config.DATABASE_URL);
  const skillIndex = await loadSkillIndex(pool);
  console.log(`loaded skill index (${skillIndex.size} skills)`);
  await startWorker(boss, pool, processJob);
  const sent = await enqueueUnfinishedJobs(boss, pool);
  console.log(`worker started (${sent} unfinished jobs sent to the queue)`);
  // A job whose send failed in the API is picked up here, no restart needed.
  const stopSweep = startQueueSweep(boss, pool, {
    intervalSeconds: sweepIntervalSeconds()
  });

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    stopSweep();
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
