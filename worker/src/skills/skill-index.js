const Fuse = require('fuse.js');

let cachedIndex = null;

function parseMinSimilarity(value) {
  let minSim;
  if (value !== undefined && value !== null) {
    minSim = Number(value);
  } else if (
    process.env.SKILL_MIN_SIMILARITY !== undefined &&
    process.env.SKILL_MIN_SIMILARITY !== null
  ) {
    minSim = Number(process.env.SKILL_MIN_SIMILARITY);
  } else {
    minSim = 0.5;
  }

  if (!Number.isFinite(minSim) || minSim < 0 || minSim > 1) {
    throw new Error('SKILL_MIN_SIMILARITY must be a number between 0 and 1');
  }

  return minSim;
}

function createSkillIndex(rows, options = {}) {
  const minSim = parseMinSimilarity(options.minSimilarity);
  const rowsList = Array.isArray(rows) ? rows : [];

  const exactMap = new Map();
  for (const row of rowsList) {
    if (row && typeof row.canonical_name === 'string') {
      exactMap.set(row.canonical_name.trim().toLowerCase(), {
        id: row.id,
        canonical_name: row.canonical_name
      });
    }
  }

  const fuse = new Fuse(rowsList, {
    keys: ['canonical_name'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 1 - minSim
  });

  function findExact(raw) {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    return exactMap.get(raw.trim().toLowerCase()) || null;
  }

  function search(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return [];
    }

    const results = fuse.search(raw.trim());
    const formatted = [];

    for (const res of results) {
      const similarity = 1 - (res.score ?? 0);
      if (similarity >= minSim) {
        formatted.push({
          id: res.item.id,
          canonical_name: res.item.canonical_name,
          similarity
        });
      }
    }

    formatted.sort((a, b) => b.similarity - a.similarity);
    return formatted.slice(0, 50);
  }

  return {
    size: rowsList.length,
    findExact,
    search
  };
}

async function loadSkillIndex(db, { minSimilarity } = {}) {
  const minSim = parseMinSimilarity(minSimilarity);

  if (!db || typeof db.query !== 'function') {
    throw new Error('Database pool or client is required to load skill index');
  }

  const result = await db.query('SELECT id, canonical_name FROM skills');
  cachedIndex = createSkillIndex(result.rows, { minSimilarity: minSim });
  return cachedIndex;
}

function getSkillIndex() {
  return cachedIndex;
}

async function rebuildSkillIndex(db, options = {}) {
  return loadSkillIndex(db, options);
}

module.exports = {
  createSkillIndex,
  loadSkillIndex,
  getSkillIndex,
  rebuildSkillIndex
};
