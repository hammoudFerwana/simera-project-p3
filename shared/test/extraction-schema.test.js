const {
  SCHEMA_VERSION,
  validateExtraction,
  getExtractionJsonSchema
} = require('../src/extraction/schema');

const v = (value, evidence = String(value), confidence = 0.9) => ({
  value,
  confidence,
  evidence
});
const empty = () => ({ value: null, confidence: null, evidence: null });

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
      country: v('Palestine')
    },
    work_experience: [
      {
        job_title: v('Backend Developer'),
        company_name: v('Acme'),
        start_date: v('2021-03', 'Mar 2021'),
        end_date: empty(),
        is_current: v(true, 'Present'),
        duration_months: v(44, 'Mar 2021 - Present'),
        location: empty(),
        employment_type: v('Full-time'),
        work_mode: v('Remote'),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: v('Node.js, PostgreSQL'),
        company_url: empty()
      }
    ],
    education: [
      {
        institution_name: v('Birzeit University'),
        degree_level: v("Bachelor's"),
        degree_name: v('BSc Computer Science'),
        field_of_study: v('Computer Science'),
        start_date: v('2016'),
        end_date: v('2020'),
        is_current: v(false, '2016 - 2020'),
        gpa: empty(),
        honors: empty(),
        location: empty(),
        description: empty()
      }
    ],
    skills: [
      {
        name: v('ReactJS'),
        proficiency_level: empty(),
        stated_duration: v({ amount: 3, unit: 'years' }, '3 years of React')
      }
    ],
    languages: [
      {
        language: v('English'),
        proficiency_level: v('advanced', 'English (fluent)')
      }
    ],
    links: [
      {
        link_type: v('github', 'GitHub'),
        url: v('https://github.com/janedoe'),
        label: v('GitHub')
      }
    ],
    certifications: [
      {
        name: v('AWS Certified Developer'),
        issuing_organization: v('Amazon Web Services'),
        issue_date: v('2023-06', 'June 2023'),
        expiration_date: empty(),
        credential_id: empty(),
        credential_url: empty(),
        description: empty()
      }
    ],
    projects: [
      {
        name: v('CV Parser'),
        description: empty(),
        role: v('Lead developer'),
        project_url: empty(),
        start_date: v('2022'),
        end_date: empty()
      }
    ],
    awards: [
      {
        name: v('Best Graduation Project'),
        issuer: v('Birzeit University'),
        award_date: v('2020'),
        description: empty()
      }
    ],
    publications: [
      {
        title: v('Parsing CVs at scale'),
        publisher: empty(),
        publication_date: v('2024-02', 'Feb 2024'),
        url: empty(),
        description: empty()
      }
    ],
    volunteering: [
      {
        organization: v('Code Club'),
        role: v('Mentor'),
        description: empty(),
        start_date: v('2019'),
        end_date: empty(),
        is_current: v(true, '2019 - present')
      }
    ]
  };
}

const SECTION_LISTS = [
  'work_experience',
  'education',
  'skills',
  'languages',
  'links',
  'certifications',
  'projects',
  'awards',
  'publications',
  'volunteering'
];

function collectPropertyNames(jsonSchema, names = new Set()) {
  if (Array.isArray(jsonSchema)) {
    jsonSchema.forEach((entry) => collectPropertyNames(entry, names));
    return names;
  }
  if (jsonSchema && typeof jsonSchema === 'object') {
    if (jsonSchema.properties) {
      Object.keys(jsonSchema.properties).forEach((name) => names.add(name));
    }
    Object.values(jsonSchema).forEach((entry) =>
      collectPropertyNames(entry, names)
    );
  }
  return names;
}

describe('extraction schema', () => {
  test('exports SCHEMA_VERSION', () => {
    expect(typeof SCHEMA_VERSION).toBe('string');
    expect(SCHEMA_VERSION).not.toBe('');
  });

  test('a complete and correct JSON passes', () => {
    const input = buildValidExtraction();
    const result = validateExtraction(input);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  test('missing information as null and empty lists as [] pass', () => {
    const input = buildValidExtraction();
    Object.keys(input.candidate).forEach((key) => {
      input.candidate[key] = empty();
    });
    input.meta.document_language = null;
    SECTION_LISTS.forEach((section) => {
      input[section] = [];
    });

    expect(validateExtraction(input).success).toBe(true);
  });

  test.each([null, undefined, 'text', 42, []])(
    'a non-object input (%p) fails at the root',
    (input) => {
      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain('(root)');
    }
  );

  describe('missing fields fail and name the field', () => {
    test('missing top-level section', () => {
      const input = buildValidExtraction();
      delete input.volunteering;

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain('volunteering');
    });

    test('missing candidate field', () => {
      const input = buildValidExtraction();
      delete input.candidate.first_name;

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'candidate.first_name'
      );
    });

    test('missing field inside a list item', () => {
      const input = buildValidExtraction();
      delete input.work_experience[0].end_date;

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'work_experience[0].end_date'
      );
    });

    test('missing key inside a value wrapper', () => {
      const input = buildValidExtraction();
      delete input.candidate.city.confidence;

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'candidate.city.confidence'
      );
    });
  });

  test('extra undefined fields are removed at every level', () => {
    const input = buildValidExtraction();
    input.extra_section = { anything: true };
    input.meta.extra = 'x';
    input.candidate.middle_name = v('X');
    input.candidate.city.source = 'cv';
    SECTION_LISTS.forEach((section) => {
      input[section][0].unknown_field = v('X');
    });

    const result = validateExtraction(input);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(buildValidExtraction());
  });

  test('a missing field in any list section names its path', () => {
    SECTION_LISTS.forEach((section) => {
      const input = buildValidExtraction();
      const [firstKey] = Object.keys(input[section][0]);
      delete input[section][0][firstKey];

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        `${section}[0].${firstKey}`
      );
    });
  });

  describe('dates', () => {
    test('a date without a month is accepted as year only', () => {
      const input = buildValidExtraction();
      input.work_experience[0].start_date = v('2019');

      const result = validateExtraction(input);

      expect(result.success).toBe(true);
      expect(result.data.work_experience[0].start_date.value).toBe('2019');
    });

    test.each(['2019-05', '2019-05-14'])('accepts %s', (value) => {
      const input = buildValidExtraction();
      input.work_experience[0].start_date = v(value);

      expect(validateExtraction(input).success).toBe(true);
    });

    test.each(['May 2019', '05/2019', '19'])('rejects %s', (value) => {
      const input = buildValidExtraction();
      input.work_experience[0].start_date = v(value);

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'work_experience[0].start_date.value'
      );
    });
  });

  describe('value wrapper', () => {
    test('a non-null value without evidence fails', () => {
      const input = buildValidExtraction();
      input.candidate.city = {
        value: 'Ramallah',
        confidence: 0.9,
        evidence: ''
      };

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'candidate.city.evidence'
      );
    });

    test('a non-null value without confidence fails', () => {
      const input = buildValidExtraction();
      input.candidate.city = {
        value: 'Ramallah',
        confidence: null,
        evidence: 'Ramallah'
      };

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'candidate.city.confidence'
      );
    });

    test('a null value with evidence fails', () => {
      const input = buildValidExtraction();
      input.candidate.summary = {
        value: null,
        confidence: null,
        evidence: 'some text'
      };

      expect(validateExtraction(input).success).toBe(false);
    });

    test.each([-0.1, 1.1])('confidence %s outside 0..1 fails', (confidence) => {
      const input = buildValidExtraction();
      input.candidate.city = v('Ramallah', 'Ramallah', confidence);

      expect(validateExtraction(input).success).toBe(false);
    });
  });

  test('is_current true with an end_date passes the contract (content check belongs to the validation layer)', () => {
    const input = buildValidExtraction();
    input.work_experience[0].end_date = v('2024-01');

    expect(validateExtraction(input).success).toBe(true);
  });

  describe('work_experience.duration_months', () => {
    test.each([0, 44])('accepts %s whole months', (months) => {
      const input = buildValidExtraction();
      input.work_experience[0].duration_months = v(
        months,
        'Mar 2021 - Present'
      );

      expect(validateExtraction(input).success).toBe(true);
    });

    test('accepts null when the dates do not allow a calculation', () => {
      const input = buildValidExtraction();
      input.work_experience[0].duration_months = empty();

      expect(validateExtraction(input).success).toBe(true);
    });

    test.each([-1, 3.5, '12'])('rejects %p', (months) => {
      const input = buildValidExtraction();
      input.work_experience[0].duration_months = v(
        months,
        'Mar 2021 - Present'
      );

      const result = validateExtraction(input);

      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.path)).toContain(
        'work_experience[0].duration_months.value'
      );
    });

    test('is an integer in the JSON Schema', () => {
      const jsonSchema = getExtractionJsonSchema();
      const durationValue =
        jsonSchema.properties.work_experience.items.properties.duration_months
          .properties.value;

      expect(JSON.stringify(durationValue)).toContain('integer');
    });
  });

  test('skills stated_duration rejects an unknown unit', () => {
    const input = buildValidExtraction();
    input.skills[0].stated_duration = v(
      { amount: 3, unit: 'weeks' },
      '3 weeks'
    );

    expect(validateExtraction(input).success).toBe(false);
  });

  test('enum fields reject values outside the allowed list', () => {
    const input = buildValidExtraction();
    input.languages[0].proficiency_level = v('fluent');

    expect(validateExtraction(input).success).toBe(false);
  });

  describe('excluded personal fields', () => {
    const excludedPattern =
      /birth|dob|nationality|gender|sex|religion|marital|photo|picture|image/i;

    test('the JSON Schema does not contain any of the six excluded fields', () => {
      const names = [...collectPropertyNames(getExtractionJsonSchema())];

      expect(names.length).toBeGreaterThan(0);
      expect(names.filter((name) => excludedPattern.test(name))).toEqual([]);
    });

    test('excluded fields sent in the input are removed', () => {
      const input = buildValidExtraction();
      Object.assign(input.candidate, {
        date_of_birth: v('1995-01-01'),
        nationality: v('X'),
        gender: v('X'),
        religion: v('X'),
        marital_status: v('X'),
        photo: v('X')
      });

      const result = validateExtraction(input);

      expect(result.success).toBe(true);
      expect(Object.keys(result.data.candidate)).toEqual(
        Object.keys(buildValidExtraction().candidate)
      );
    });
  });

  test('getExtractionJsonSchema returns a strict JSON Schema for the LLM', () => {
    const jsonSchema = getExtractionJsonSchema();

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.required).toEqual(Object.keys(buildValidExtraction()));
  });
});
