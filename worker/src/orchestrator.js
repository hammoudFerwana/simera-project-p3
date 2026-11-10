const defaultSteps = require('./steps');

async function runSteps(ctx, steps = defaultSteps) {
  let currentCtx = { ...ctx };
  for (const step of steps) {
    currentCtx = (await step(currentCtx)) || currentCtx;
  }
  return currentCtx;
}

module.exports = { runSteps };
