const { createSkillIndex } = require('../src/skills/skill-index');

describe('skill-index', () => {
  const originalEnv = process.env.SKILL_MIN_SIMILARITY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SKILL_MIN_SIMILARITY = originalEnv;
    } else {
      delete process.env.SKILL_MIN_SIMILARITY;
    }
  });

  const sampleRows = [
    { id: 1, canonical_name: 'React' },
    { id: 2, canonical_name: 'React Native' },
    { id: 3, canonical_name: 'Vue.js' },
    { id: 4, canonical_name: 'Angular' },
    { id: 5, canonical_name: 'JavaScript' },
    { id: 6, canonical_name: 'TypeScript' }
  ];

  it('finds exact match case-insensitively with trimming', () => {
    const index = createSkillIndex(sampleRows);
    const match = index.findExact('  react  ');

    expect(match).toEqual({ id: 1, canonical_name: 'React' });
  });

  it('includes React when searching for "ReactJS"', () => {
    const index = createSkillIndex(sampleRows);
    const results = index.search('ReactJS');

    const canonicalNames = results.map((r) => r.canonical_name);
    expect(canonicalNames).toContain('React');
  });

  it('returns empty array when searching for an unrelated term', () => {
    const index = createSkillIndex(sampleRows);
    const results = index.search('Underwater Basket Weaving');

    expect(results).toEqual([]);
  });

  it('returns at most 50 results on a list of 60 similar names', () => {
    const sixtyRows = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      canonical_name: `Skill Test Variant ${i + 1}`
    }));

    const index = createSkillIndex(sixtyRows, { minSimilarity: 0.1 });
    const results = index.search('Skill Test Variant');

    expect(results.length).toBeLessThanOrEqual(50);
    expect(results.length).toBe(50);
  });

  it('sorts search results by similarity best first', () => {
    const index = createSkillIndex(sampleRows);
    const results = index.search('React');

    expect(results.length).toBeGreaterThan(1);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(
        results[i + 1].similarity
      );
    }
  });

  it('throws when SKILL_MIN_SIMILARITY is outside 0 to 1', () => {
    process.env.SKILL_MIN_SIMILARITY = '2';

    expect(() => {
      createSkillIndex(sampleRows);
    }).toThrow('SKILL_MIN_SIMILARITY must be a number between 0 and 1');
  });
});
