const { TemporaryError } = require('shared/src/errors');
const { createLlmClientFromEnv } = require('shared/src/llm/client');
const { getFreshSkillIndex } = require('../skills/skill-index');
const {
  buildSkillSelectionMessages
} = require('../llm/skill-selection-prompt');

function stripFences(raw) {
  let s = String(raw).trim();
  if (s.startsWith('```')) {
    const firstNewline = s.indexOf('\n');
    if (firstNewline !== -1) {
      s = s.slice(firstNewline + 1);
    }
  }
  if (s.endsWith('```')) {
    s = s.slice(0, s.lastIndexOf('```'));
  }
  return s.trim();
}

function createNormalizeSkillsStep({
  db,
  getIndex,
  getClient = createLlmClientFromEnv,
  log = console.log
} = {}) {
  return async function normalizeSkills(ctx) {
    const skills = ctx.extraction?.skills;
    if (!Array.isArray(skills) || skills.length === 0) {
      ctx.skillResolutions = [];
      log({
        jobId: ctx.jobId,
        matched: 0,
        unknown: 0,
        llmRequests: 0
      });
      return ctx;
    }

    const index = getIndex ? await getIndex() : await getFreshSkillIndex(db);

    if (!index || index.size === 0) {
      log('Warning: Skill index is empty; all skills marked as unknown');
      const resolutions = skills.map((skill, i) => {
        const rawName = skill?.name?.value;
        if (
          rawName === null ||
          rawName === undefined ||
          (typeof rawName === 'string' && rawName.trim() === '')
        ) {
          return {
            index: i,
            status: 'skipped',
            skillId: null,
            canonicalName: null,
            method: 'no_name'
          };
        }
        return {
          index: i,
          status: 'unknown',
          skillId: null,
          canonicalName: null,
          method: 'no_candidates'
        };
      });

      ctx.skillResolutions = resolutions;
      const unknownCount = resolutions.filter(
        (r) => r.status === 'unknown'
      ).length;
      log({
        jobId: ctx.jobId,
        matched: 0,
        unknown: unknownCount,
        llmRequests: 0
      });
      return ctx;
    }

    const resolutions = new Array(skills.length);
    const itemsForLlm = [];

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const rawName = skill?.name?.value;

      if (
        rawName === null ||
        rawName === undefined ||
        (typeof rawName === 'string' && rawName.trim() === '')
      ) {
        resolutions[i] = {
          index: i,
          status: 'skipped',
          skillId: null,
          canonicalName: null,
          method: 'no_name'
        };
        continue;
      }

      const exactMatch = index.findExact(rawName);
      if (exactMatch) {
        resolutions[i] = {
          index: i,
          status: 'matched',
          skillId: exactMatch.id,
          canonicalName: exactMatch.canonical_name,
          method: 'exact'
        };
        continue;
      }

      const candidates = index.search(rawName);
      if (candidates.length === 0) {
        resolutions[i] = {
          index: i,
          status: 'unknown',
          skillId: null,
          canonicalName: null,
          method: 'no_candidates'
        };
        continue;
      }

      const candidateNames = candidates.map((c) => c.canonical_name);
      const candidatesMap = new Map(
        candidates.map((c) => [c.canonical_name, c.id])
      );

      itemsForLlm.push({
        id: i,
        raw: rawName,
        candidates: candidateNames,
        candidatesMap
      });
    }

    let llmRequests = 0;

    if (itemsForLlm.length > 0) {
      llmRequests = 1;
      const client = getClient();
      const messages = buildSkillSelectionMessages(
        itemsForLlm.map(({ id, raw, candidates }) => ({
          id,
          raw,
          candidates
        }))
      );

      const response = await client.chatJson(messages);
      const content = response?.content;

      let parsed;
      try {
        parsed = JSON.parse(stripFences(content));
      } catch {
        throw new TemporaryError('Skill selection output was not valid JSON');
      }

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.choices)
      ) {
        throw new TemporaryError('Skill selection output was not valid JSON');
      }

      const choicesById = new Map();
      for (const choice of parsed.choices) {
        if (choice && choice.id !== undefined) {
          choicesById.set(Number(choice.id), choice);
        }
      }

      for (const item of itemsForLlm) {
        const choice = choicesById.get(item.id);
        if (!choice) {
          resolutions[item.id] = {
            index: item.id,
            status: 'unknown',
            skillId: null,
            canonicalName: null,
            method: 'llm_invalid_choice'
          };
          continue;
        }

        const canonical = choice.canonical;
        if (canonical === null || canonical === 'none') {
          resolutions[item.id] = {
            index: item.id,
            status: 'unknown',
            skillId: null,
            canonicalName: null,
            method: 'llm_none'
          };
        } else if (
          typeof canonical === 'string' &&
          item.candidates.includes(canonical)
        ) {
          resolutions[item.id] = {
            index: item.id,
            status: 'matched',
            skillId: item.candidatesMap.get(canonical),
            canonicalName: canonical,
            method: 'llm'
          };
        } else {
          resolutions[item.id] = {
            index: item.id,
            status: 'unknown',
            skillId: null,
            canonicalName: null,
            method: 'llm_invalid_choice'
          };
        }
      }
    }

    ctx.skillResolutions = resolutions;

    const matched = resolutions.filter((r) => r.status === 'matched').length;
    const unknown = resolutions.filter((r) => r.status === 'unknown').length;

    log({
      jobId: ctx.jobId,
      matched,
      unknown,
      llmRequests
    });

    return ctx;
  };
}

module.exports = {
  createNormalizeSkillsStep
};
