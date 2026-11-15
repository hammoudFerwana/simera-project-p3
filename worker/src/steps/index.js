const { createCallLlmStep } = require('./call-llm');
const { createCheckEmailStep } = require('./check-email');

const stub = (name) => async (ctx) => {
  ctx.completedSteps = [...(ctx.completedSteps || []), name];
  return ctx;
};

module.exports = [
  stub('extractTextAndLinks'), // US-06
  stub('checkEmail'), // US-07
  createCallLlmStep({ db: require('shared/src/database') }), // US-08
  createCheckEmailStep({ db: require('shared/src/database') }), // US-07
  stub('callLlm'), // US-08
  stub('normalizeSkills'), // US-13
  stub('validateWithCode'), // US-09, US-14
  stub('compareAndApplyLatest'), // US-15, US-16, US-17
  stub('store') // US-10
];
