const { createExtractTextStep } = require('./extract-text');
const { createCallLlmStep } = require('./call-llm');
const { createCheckEmailStep } = require('./check-email');
const { createNormalizeSkillsStep } = require('./normalize-skills');
const { createValidateWithCodeStep } = require('./validate-with-code');
const { createCompareStep } = require('./compare');
const { createStoreStep } = require('./store');
const db = require('shared/src/database');

module.exports = [
  createExtractTextStep({ db }), // US-06
  createCheckEmailStep({ db }),
  createCallLlmStep({ db }),
  createNormalizeSkillsStep({ db }), // US-13
  createValidateWithCodeStep(), // US-09, US-14
  createCompareStep({ db }), // US-15
  createStoreStep({ db }) // US-10, US-21
];
