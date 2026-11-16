const { loadStoredCandidate } = require('shared/src/comparison/stored-data');
const { withSkillNames } = require('shared/src/comparison/skills');
const { compareWithStored } = require('shared/src/comparison/compare');

/**
 * Creates the worker step for comparing a new extraction with stored candidate data.
 * Pure read-only operation: sets ctx.storedData and ctx.diff, writes nothing to DB,
 * and logs only count metrics.
 *
 * @param {object} [options]
 * @param {object} [options.db] - pg Pool or client
 * @param {Function} [options.now] - function returning current Date
 * @param {Function} [options.log] - logging function (defaults to console.log)
 * @returns {Function} async (ctx) => ctx
 */
function createCompareStep({
  db,
  now = () => new Date(),
  log = console.log
} = {}) {
  return async function compareStep(ctx) {
    const storedData = await loadStoredCandidate(db, ctx.candidateId);
    ctx.storedData = storedData;

    const extractionWithSkills = withSkillNames(
      ctx.extraction,
      ctx.skillResolutions || []
    );

    const diff = compareWithStored(storedData, extractionWithSkills, {
      now: now()
    });
    ctx.diff = diff;

    const firstFile = storedData === null;
    const added = diff ? diff.added.length : 0;
    const differences = diff ? diff.differences.length : 0;
    const uncertain = diff ? diff.uncertainMatches.length : 0;

    log({
      jobId: ctx.jobId,
      firstFile,
      added,
      differences,
      uncertain
    });

    return ctx;
  };
}

module.exports = {
  createCompareStep
};
