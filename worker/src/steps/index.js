const { createValidateWithCodeStep } = require('./validate-with-code');

const stub = (name) => async (ctx) => {
  ctx.completedSteps = [...(ctx.completedSteps || []), name];
  return ctx;
};

module.exports = [
  stub('extractTextAndLinks'), // US-06
  stub('checkEmail'), // US-07
  stub('callLlm'), // US-08
  stub('normalizeSkills'), // US-13
  createValidateWithCodeStep(), // US-09, US-14
  stub('compareAndApplyLatest'), // US-15, US-16, US-17
  stub('store') // US-10
];
