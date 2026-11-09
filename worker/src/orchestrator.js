async function runSteps(ctx, steps = []) {
  let currentCtx = { ...ctx };
  for (const step of steps) {
    if (typeof step === 'function') {
      currentCtx = await step(currentCtx) || currentCtx;
    }
  }
  return currentCtx;
}

module.exports = { runSteps };