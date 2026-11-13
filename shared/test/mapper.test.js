
const { mapExtractionToStorage } = require('../src/mapper');

const v = (value, evidence = String(value), confidence = 0.9) => ({
  value,
  confidence,
  evidence
});

const empty = () => ({
  value: null,
  confidence: null,
  evidence: null
});

function buildValidExtraction() {
  return {
    meta: {
      document_language: 'en',
      extraction_warnings: []
    },

    candidate: {
      first_name: v('Jane'),
      last_name: v('Doe'),
      headline: v('Backend Developer'),
      summary: empty(),
      phone: v('+970 599 000 000'),
      industry: empty(),
      profession: v('Software Engineer'),
      city: v('Ramallah'),
      country_code: v('PS')
    },

    work_experience: [
      {
        job_title: v('Backend Developer'),
        company_name: v('Acme'),
        start_date: v('2021-03'),
        end_date: empty(),
        is_current: v(true, 'Present'),
        duration_months: v(44, 'Mar 2021 - Present'),
        location: empty()
      }
    ],

    education: [
      {
        institution_name: v('Birzeit University'),
        degree_level: v("Bachelor's"),
        degree_name: v('Computer Science'),
        field_of_study: v('Computer Science'),
        start_date: v('2016'),
        end_date: v('2020'),
        is_current: v(false, '2016 - 2020'),
        gpa: empty()
      }
    ],

    skills: [
      {
        name: v('ReactJS')
      }
    ],

    languages: [
      {
        language: v('English'),
        proficiency_level: v('advanced')
      }
    ],

    links: [
      {
        link_type: v('github'),
        url: v('https://github.com/janedoe'),
        label: v('GitHub')
      }
    ],

    certifications: [],
    projects: [],
    awards: [],
    publications: [],
    volunteering: []
  };
}

describe('mapExtractionToStorage', () => {
  test('maps processing metadata correctly', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(result.processing).toEqual(input.meta);
  });

  test('maps candidate profile and preserves null wrappers', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(result.profile).toEqual(input.candidate);
    expect(result.profile.summary).toEqual(empty());
  });

  test('maps list items with their original source indexes', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(result.items.work_experience[0].sourceIndex).toBe(0);
    expect(result.items.education[0].sourceIndex).toBe(0);
    expect(result.items.languages[0].sourceIndex).toBe(0);
    expect(result.items.links[0].sourceIndex).toBe(0);
  });

  test('preserves field wrappers inside list items', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(
      result.items.work_experience[0].fields.job_title
    ).toEqual(input.work_experience[0].job_title);
  });

  test('preserves false values', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(result.items.education[0].fields.is_current.value).toBe(false);
  });

  test('excludes duration_months from work experience', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(
      result.items.work_experience[0].fields
    ).not.toHaveProperty('duration_months');
  });

  test('does not include skills in the mapped output', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(result.items).not.toHaveProperty('skills');
  });

  test('includes all expected item sections even when empty', () => {
    const input = buildValidExtraction();

    const result = mapExtractionToStorage(input);

    expect(result.items).toHaveProperty('certifications', []);
    expect(result.items).toHaveProperty('projects', []);
    expect(result.items).toHaveProperty('awards', []);
    expect(result.items).toHaveProperty('publications', []);
    expect(result.items).toHaveProperty('volunteering', []);
  });

  test('does not mutate the original input', () => {
    const input = buildValidExtraction();
    const original = structuredClone(input);

    const result = mapExtractionToStorage(input);

    result.profile.first_name.value = 'Changed';
    result.items.work_experience[0].fields.job_title.value = 'Changed';

    expect(input).toEqual(original);
  });

  test.each([null, undefined, 'text', 42, []])(
    'throws TypeError for invalid root input (%p)',
    (input) => {
      expect(() => mapExtractionToStorage(input)).toThrow(TypeError);
    }
  );
});
