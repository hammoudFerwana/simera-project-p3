const {
  compareDates,
  normalizeCompany,
  normalizePhone,
  normalizeText,
  normalizeUrl
} = require('../src/comparison/normalize');
const { compareWithStored } = require('../src/comparison/compare');
const { withSkillNames } = require('../src/comparison/skills');

const NOW = new Date('2026-11-14T00:00:00Z');

/** A new value as the extraction gives it. */
const wrap = (value) => ({ value, confidence: 0.9, evidence: 'evidence' });

/** A new job. `dates` can leave out end_date and is_current. */
function newJob({ title, company, start, end = null, current = false }) {
  return {
    job_title: wrap(title),
    company_name: wrap(company),
    start_date: wrap(start),
    end_date: wrap(end),
    is_current: wrap(current)
  };
}

/** A stored job (plain values). */
function storedJob({
  id = 1,
  title,
  company,
  start,
  end = null,
  current = false
}) {
  return {
    id,
    job_title: title,
    company_name: company,
    start_date: start,
    end_date: end,
    is_current: current
  };
}

const compare = (stored, extraction) =>
  compareWithStored(stored, extraction, { now: NOW });

function entries(diff, list, filter = {}) {
  return diff[list].filter((entry) =>
    Object.entries(filter).every(([key, value]) => entry[key] === value)
  );
}

describe('normalizers', () => {
  it.each([
    ['Acme Inc.', 'acme'],
    ['ACME', 'acme'],
    ['  Acme   Corp  ', 'acme'],
    ['Acme Co., Ltd.', 'acme'],
    ['Acme Technologies', 'acme technologies'],
    ['Smith & Sons LLC', 'smith and sons'],
    ['Inc', 'inc'],
    ['Société Générale S.A.', 'societe generale']
  ])('normalizeCompany(%j) = %j', (input, expected) => {
    expect(normalizeCompany(input)).toBe(expected);
  });

  it.each([
    ['+962791234567', '+962791234567'],
    ['00962791234567', '+962791234567'],
    ['+962 79 123 4567', '+962791234567'],
    ['+962-79-123-4567', '+962791234567'],
    ['(962) 79 1234567', '962791234567']
  ])('normalizePhone(%j) = %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ['2022', '2022', 'same'],
    ['2022', '2022-05', 'new_more_precise'],
    ['2022-05', '2022', 'stored_more_precise'],
    ['2022-05', '2022-05-14', 'new_more_precise'],
    ['2022-05', '2022-05', 'same'],
    ['2019-05', '2019-08', 'different'],
    ['2022', '2023', 'different'],
    ['2022-05-10', '2022-05-11', 'different']
  ])('compareDates(%j, %j) = %s', (stored, next, expected) => {
    expect(compareDates(stored, next)).toBe(expected);
  });

  it('normalizes text and urls', () => {
    expect(normalizeText('  Amman, ')).toBe('amman');
    expect(normalizeUrl('HTTPS://GitHub.com/Jane/')).toBe(
      'https://github.com/jane'
    );
  });
});

describe('acceptance criteria', () => {
  it('1. "Acme Inc." and "ACME" are one job', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Backend Developer',
          company: 'Acme Inc.',
          start: '2020-01',
          current: true
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Backend Developer',
          company: 'ACME',
          start: '2020-01',
          current: true
        })
      ]
    };
    const diff = compare(stored, extraction);
    expect(entries(diff, 'added')).toEqual([]);
    expect(diff.uncertainMatches).toEqual([]);
    expect(diff.differences).toEqual([]);
    expect(
      entries(diff, 'unchanged', {
        section: 'work_experience',
        field: 'company_name'
      })
    ).toEqual([
      expect.objectContaining({
        storedIndex: 0,
        storedId: 1,
        newIndex: 0,
        reason: 'format_only'
      })
    ]);
  });

  it('2. a new job is added and nothing is in conflict', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Backend Developer',
          company: 'Acme Inc.',
          start: '2020-01',
          end: '2022-06'
        })
      ]
    };
    const job = newJob({
      title: 'Data Engineer',
      company: 'Beta Ltd',
      start: '2023-01',
      current: true
    });
    const diff = compare(stored, { work_experience: [job] });
    expect(diff.added).toEqual([
      { section: 'work_experience', scope: 'item', newIndex: 0, new: job }
    ]);
    expect(diff.differences).toEqual([]);
    expect(diff.uncertainMatches).toEqual([]);
  });

  it('3. +962791234567 and 00962791234567 are no conflict', () => {
    const diff = compare(
      { candidate: { phone: '+962791234567' } },
      { candidate: { phone: wrap('00962791234567') } }
    );
    expect(diff.differences).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(entries(diff, 'unchanged', { field: 'phone' })).toEqual([
      expect.objectContaining({ reason: 'format_only' })
    ]);
  });

  it('4. stored 2022 and new 2022-05: the more precise 2022-05 is kept, no conflict', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2022',
          current: true
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Dev',
          company: 'Acme',
          start: '2022-05',
          current: true
        })
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.differences).toEqual([]);
    expect(diff.precisionUpgrades).toEqual([
      expect.objectContaining({
        field: 'start_date',
        stored: '2022',
        new: wrap('2022-05')
      })
    ]);
  });

  it('5. stored 2022-05 and new 2022: the stored value stays', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2022-05',
          current: true
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({ title: 'Dev', company: 'Acme', start: '2022', current: true })
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.precisionUpgrades).toEqual([]);
    expect(diff.differences).toEqual([]);
    expect(entries(diff, 'unchanged', { field: 'start_date' })).toEqual([
      expect.objectContaining({ reason: 'less_precise' })
    ]);
  });

  it('6. a stored job missing from the new file stays (nothing is removed)', () => {
    const stored = {
      work_experience: [
        storedJob({
          id: 1,
          title: 'Backend Developer',
          company: 'Acme',
          start: '2020-01',
          end: '2022-06'
        }),
        storedJob({
          id: 2,
          title: 'Intern',
          company: 'Gamma',
          start: '2018-01',
          end: '2018-06'
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Backend Developer',
          company: 'Acme',
          start: '2020-01',
          end: '2022-06'
        })
      ]
    };
    const diff = compare(stored, extraction);
    // nothing refers to the stored job 2: it is not added, changed or in doubt
    for (const list of Object.values(diff)) {
      expect(list.some((entry) => entry.storedId === 2)).toBe(false);
    }
    expect(diff.added).toEqual([]);
    expect(diff.differences).toEqual([]);
    expect(diff.uncertainMatches).toEqual([]);
  });

  it('7. same company, overlapping period, other job title: an uncertain match (C3)', () => {
    const stored = {
      work_experience: [
        storedJob({
          id: 5,
          title: 'Backend Developer',
          company: 'Acme Inc.',
          start: '2020-01',
          end: '2023-01'
        })
      ]
    };
    const job = newJob({
      title: 'Software Engineer',
      company: 'Acme',
      start: '2021-06',
      end: '2023-01'
    });
    const diff = compare(stored, { work_experience: [job] });
    expect(diff.uncertainMatches).toEqual([
      {
        section: 'work_experience',
        reason: 'item_match_uncertain',
        newIndex: 0,
        newItem: job,
        candidates: [{ storedIndex: 0, storedId: 5 }]
      }
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.differences).toEqual([]);
  });

  it('8. stored city Amman and new Dubai: a real difference for US-16', () => {
    const diff = compare(
      { candidate: { city: 'Amman' } },
      { candidate: { city: wrap('Dubai') } }
    );
    expect(diff.differences).toEqual([
      {
        section: 'candidate',
        storedIndex: null,
        storedId: null,
        newIndex: null,
        field: 'city',
        stored: 'Amman',
        new: wrap('Dubai')
      }
    ]);
  });
});

describe('item matching', () => {
  it('keeps a past start date that changed as a real difference of the same job', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2019-05',
          end: '2022-05'
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Dev',
          company: 'Acme',
          start: '2019-08',
          end: '2022-05'
        })
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.differences).toEqual([
      expect.objectContaining({
        field: 'start_date',
        stored: '2019-05',
        new: wrap('2019-08')
      })
    ]);
    expect(diff.added).toEqual([]);
  });

  it('treats the same company and title with periods that do not overlap as a new job', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2015-01',
          end: '2016-12'
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Dev',
          company: 'Acme',
          start: '2021-01',
          current: true
        })
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.added).toHaveLength(1);
    expect(diff.uncertainMatches).toEqual([]);
  });

  it('matches a current job with a year-only period', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2022',
          current: true
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Dev',
          company: 'Acme',
          start: '2022-03',
          end: '2023-12'
        })
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.added).toEqual([]);
    expect(diff.uncertainMatches).toEqual([]);
    expect(
      entries(diff, 'precisionUpgrades', { field: 'start_date' })
    ).toHaveLength(1);
    // the stored job is current and the new one has an end date: US-16 decides (B1)
    expect(diff.differences.map((entry) => entry.field).sort()).toEqual([
      'end_date',
      'is_current'
    ]);
  });

  it('does not let two new jobs take the same stored job', () => {
    const stored = {
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2020-01',
          current: true
        })
      ]
    };
    const extraction = {
      work_experience: [
        newJob({
          title: 'Dev',
          company: 'Acme',
          start: '2020-01',
          current: true
        }),
        newJob({
          title: 'Dev',
          company: 'Acme',
          start: '2020-01',
          current: true
        })
      ]
    };
    const diff = compare(stored, extraction);
    expect(entries(diff, 'unchanged', { newIndex: 0 }).length).toBeGreaterThan(
      0
    );
    expect(diff.added.filter((entry) => entry.newIndex === 1)).toHaveLength(1);
  });

  it('matches education by school, degree level and field', () => {
    const stored = {
      education: [
        {
          id: 3,
          institution_name: 'Palestine Polytechnic University',
          degree_level: 'Bachelor',
          field_of_study: 'Computer Engineering',
          start_date: '2014',
          end_date: '2018',
          is_current: false
        }
      ]
    };
    const extraction = {
      education: [
        {
          institution_name: wrap('Palestine Polytechnic University'),
          degree_level: wrap('bachelor'),
          field_of_study: wrap('Computer Engineering'),
          start_date: wrap('2014-09'),
          end_date: wrap('2018'),
          is_current: wrap(false)
        }
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.added).toEqual([]);
    expect(diff.uncertainMatches).toEqual([]);
    expect(
      entries(diff, 'precisionUpgrades', { field: 'start_date' })
    ).toHaveLength(1);
  });

  it('marks the same school with another degree and an overlapping period as uncertain', () => {
    const stored = {
      education: [
        {
          id: 3,
          institution_name: 'PPU',
          degree_level: 'Bachelor',
          field_of_study: 'Computer Engineering',
          start_date: '2014',
          end_date: '2018',
          is_current: false
        }
      ]
    };
    const extraction = {
      education: [
        {
          institution_name: wrap('PPU'),
          degree_level: wrap('Master'),
          field_of_study: wrap('Computer Science'),
          start_date: wrap('2016'),
          end_date: wrap('2019'),
          is_current: wrap(false)
        }
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.uncertainMatches).toHaveLength(1);
    expect(diff.added).toEqual([]);
  });
});

describe('fields and sections', () => {
  it('fills a stored field that was empty (A1)', () => {
    const diff = compare(
      { candidate: { city: null, headline: 'Engineer' } },
      { candidate: { city: wrap('Amman'), headline: wrap(null) } }
    );
    expect(diff.added).toEqual([
      expect.objectContaining({
        section: 'candidate',
        scope: 'field',
        field: 'city',
        new: wrap('Amman')
      })
    ]);
    // the new file has no headline: the stored one stays and is not in the diff
    expect(entries(diff, 'differences')).toEqual([]);
    expect(entries(diff, 'unchanged', { field: 'headline' })).toEqual([]);
  });

  it('ignores case and spacing in text', () => {
    const diff = compare(
      { candidate: { city: 'Amman', country_code: 'jo' } },
      { candidate: { city: wrap('  AMMAN '), country_code: wrap('JO') } }
    );
    expect(diff.differences).toEqual([]);
    expect(entries(diff, 'unchanged')).toHaveLength(2);
  });

  it('matches links by address and languages by name', () => {
    const stored = {
      links: [
        {
          id: 1,
          url: 'https://github.com/jane',
          link_type: 'github',
          label: 'GitHub'
        }
      ],
      languages: [
        { id: 1, language: 'English', proficiency_level: 'intermediate' }
      ]
    };
    const extraction = {
      links: [
        {
          url: wrap('https://GitHub.com/jane/'),
          link_type: wrap('github'),
          label: wrap('GitHub')
        }
      ],
      languages: [
        { language: wrap('english'), proficiency_level: wrap('advanced') }
      ]
    };
    const diff = compare(stored, extraction);
    expect(diff.added).toEqual([]);
    expect(
      entries(diff, 'unchanged', { section: 'links', field: 'url' })
    ).toHaveLength(1);
    expect(entries(diff, 'differences')).toEqual([
      expect.objectContaining({
        section: 'languages',
        field: 'proficiency_level',
        stored: 'intermediate',
        new: wrap('advanced')
      })
    ]);
  });

  it('adds a known new skill (A5) and reports an unknown one', () => {
    const known = {
      name: wrap('reactjs'),
      canonical_name: 'React',
      proficiency_level: wrap(null),
      stated_duration: wrap(null)
    };
    const unknown = {
      name: wrap('quantum basketweaving'),
      canonical_name: null,
      proficiency_level: wrap(null),
      stated_duration: wrap(null)
    };
    const diff = compare(
      {
        skills: [
          {
            id: 1,
            canonical_name: 'Node.js',
            proficiency_level: null,
            months_of_experience: null
          }
        ]
      },
      { skills: [known, unknown] }
    );
    expect(diff.added).toEqual([
      { section: 'skills', scope: 'item', newIndex: 0, new: known }
    ]);
    expect(diff.unknownSkills).toEqual([
      { section: 'skills', newIndex: 1, newItem: unknown }
    ]);
  });

  it('compares a skill by its canonical name and its stated duration in months', () => {
    const stored = {
      skills: [
        {
          id: 1,
          canonical_name: 'React',
          proficiency_level: 'intermediate',
          months_of_experience: 24
        }
      ]
    };
    const same = {
      name: wrap('ReactJS'),
      canonical_name: 'React',
      proficiency_level: wrap('intermediate'),
      stated_duration: wrap({ amount: 2, unit: 'years' })
    };
    expect(compare(stored, { skills: [same] }).differences).toEqual([]);

    const more = {
      ...same,
      stated_duration: wrap({ amount: 3, unit: 'years' })
    };
    expect(compare(stored, { skills: [more] }).differences).toEqual([
      expect.objectContaining({
        section: 'skills',
        field: 'months_of_experience',
        stored: 24
      })
    ]);
  });

  it('handles empty sections and a missing candidate', () => {
    const diff = compare(
      {},
      { candidate: { city: wrap('Amman') }, work_experience: [], skills: [] }
    );
    expect(diff.added).toEqual([
      expect.objectContaining({ section: 'candidate', field: 'city' })
    ]);
  });

  it('returns null for the first file (nothing is stored)', () => {
    expect(compare(null, { candidate: {} })).toBeNull();
  });

  it('gives the same diff for the same input', () => {
    const stored = {
      candidate: { city: 'Amman' },
      work_experience: [
        storedJob({
          title: 'Dev',
          company: 'Acme',
          start: '2020-01',
          current: true
        })
      ]
    };
    const extraction = {
      candidate: { city: wrap('Dubai') },
      work_experience: [
        newJob({
          title: 'Dev',
          company: 'ACME',
          start: '2020-01',
          current: true
        })
      ]
    };
    expect(compare(stored, extraction)).toEqual(compare(stored, extraction));
  });

  describe('withSkillNames', () => {
    it('sets canonical_name for matched, null for unknown/skipped/missing, and does not mutate input', () => {
      const extraction = {
        candidate: { city: wrap('Amman') },
        skills: [
          { name: wrap('ReactJS'), proficiency_level: wrap('intermediate') },
          { name: wrap('GoLang'), proficiency_level: wrap('basic') },
          { name: wrap(''), proficiency_level: wrap(null) },
          { name: wrap('Rust'), proficiency_level: wrap('advanced') }
        ]
      };
      const skillResolutions = [
        { index: 0, status: 'matched', canonicalName: 'React', skillId: 10 },
        { index: 1, status: 'unknown', canonicalName: null, skillId: null },
        { index: 2, status: 'skipped', canonicalName: null, skillId: null }
      ];

      const frozenExtraction = JSON.parse(JSON.stringify(extraction));
      const result = withSkillNames(extraction, skillResolutions);

      expect(result.skills[0].canonical_name).toBe('React');
      expect(result.skills[1].canonical_name).toBeNull();
      expect(result.skills[2].canonical_name).toBeNull();
      expect(result.skills[3].canonical_name).toBeNull();

      expect(extraction).toEqual(frozenExtraction);
      expect(extraction.skills[0].canonical_name).toBeUndefined();
    });

    it('end to end with withSkillNames: stored skill "React" and new raw "ReactJS" resolved to "React" produces no unknownSkills, and an unknown resolution produces one unknownSkills entry', () => {
      const stored = {
        skills: [
          {
            id: 1,
            canonical_name: 'React',
            proficiency_level: 'intermediate',
            months_of_experience: null
          }
        ]
      };
      const extraction = {
        skills: [
          {
            name: wrap('ReactJS'),
            proficiency_level: wrap('intermediate'),
            stated_duration: wrap(null)
          },
          {
            name: wrap('obscure-skill'),
            proficiency_level: wrap(null),
            stated_duration: wrap(null)
          }
        ]
      };
      const skillResolutions = [
        { index: 0, status: 'matched', canonicalName: 'React', skillId: 1 },
        { index: 1, status: 'unknown', canonicalName: null, skillId: null }
      ];

      const extractionWithSkills = withSkillNames(extraction, skillResolutions);
      const diff = compareWithStored(stored, extractionWithSkills);

      expect(diff.unknownSkills).toEqual([
        {
          section: 'skills',
          newIndex: 1,
          newItem: extractionWithSkills.skills[1]
        }
      ]);
      expect(diff.added).toEqual([]);
      expect(diff.differences).toEqual([]);
      expect(entries(diff, 'unchanged', { section: 'skills' })).toHaveLength(1);
    });
  });
});
