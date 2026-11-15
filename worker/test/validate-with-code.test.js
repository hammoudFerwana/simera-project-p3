const {
  createValidateWithCodeStep
} = require('../src/steps/validate-with-code');

const v = (value, evidence = String(value), confidence = 0.9) => ({
  value,
  confidence,
  evidence
});
const empty = () => ({ value: null, confidence: null, evidence: null });

function buildFullExtraction() {
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
      phone: v('00962 79 123 4567', '00962 79 123 4567'),
      industry: empty(),
      profession: v('Software Engineer'),
      city: v('Amman'),
      country_code: v('Jordan', 'Jordan')
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
        company_url: v('acme.com', 'acme.com')
      }
    ],
    education: [
      {
        institution_name: v('University of Jordan'),
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
        name: v('JavaScript'),
        proficiency_level: empty(),
        stated_duration: v(
          { amount: 3, unit: 'years' },
          '3 years of JavaScript'
        )
      }
    ],
    languages: [
      {
        language: v('en', 'English'),
        proficiency_level: v('advanced', 'English (fluent)')
      }
    ],
    links: [
      {
        link_type: v('github', 'GitHub'),
        url: v('github.com/sam', 'github.com/sam'),
        label: v('GitHub')
      }
    ],
    certifications: [
      {
        name: v('AWS Developer'),
        issuing_organization: v('AWS'),
        issue_date: v('2023-06', 'June 2023'),
        expiration_date: empty(),
        credential_id: empty(),
        credential_url: v('cert.com/123', 'cert.com/123'),
        description: empty()
      }
    ],
    projects: [
      {
        name: v('CV Parser'),
        description: empty(),
        role: v('Lead developer'),
        project_url: v('myproject.org', 'myproject.org'),
        start_date: v('2022'),
        end_date: empty()
      }
    ],
    awards: [
      {
        name: v('Best Project'),
        issuer: v('University of Jordan'),
        award_date: v('2020'),
        description: empty()
      }
    ],
    publications: [
      {
        title: v('Modern Parsing'),
        publisher: empty(),
        publication_date: v('2024-02', 'Feb 2024'),
        url: v('research.net/paper', 'research.net/paper'),
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

describe('validateWithCode step', () => {
  test('auto-fixes formats and keeps confidence and evidence intact when valid', async () => {
    const logSpy = jest.fn();
    const step = createValidateWithCodeStep({ log: logSpy });

    const extraction = buildFullExtraction();
    const sourceText = [
      'Jane Doe Backend Developer Software Engineer Amman Jordan 00962 79 123 4567',
      'Acme Mar 2021 Present Mar 2021 - Present Full-time Remote Node.js, PostgreSQL acme.com',
      "University of Jordan Bachelor's BSc Computer Science Computer Science 2016 2020 2016 - 2020",
      'JavaScript 3 years of JavaScript',
      'English English (fluent)',
      'GitHub github.com/sam',
      'AWS Developer AWS June 2023 cert.com/123',
      'CV Parser Lead developer myproject.org 2022',
      'Best Project 2020',
      'Modern Parsing Feb 2024 research.net/paper',
      'Code Club Mentor 2019 2019 - present'
    ].join('\n');

    const ctx = {
      jobId: 'test-job-1',
      text: sourceText,
      links: [{ label: 'GitHub', url: 'https://github.com/sam' }],
      extraction
    };

    const result = await step(ctx);

    expect(result.failedChecks).toEqual([]);
    expect(logSpy).not.toHaveBeenCalled();

    // Auto-fixes applied to values
    expect(result.extraction.candidate.phone.value).toBe('+962791234567');
    expect(result.extraction.candidate.phone.evidence).toBe(
      '00962 79 123 4567'
    );
    expect(result.extraction.candidate.phone.confidence).toBe(0.9);

    expect(result.extraction.candidate.country_code.value).toBe('JO');
    expect(result.extraction.candidate.country_code.evidence).toBe('Jordan');

    expect(result.extraction.languages[0].language.value).toBe('English');

    expect(result.extraction.links[0].url.value).toBe('https://github.com/sam');
    expect(result.extraction.work_experience[0].company_url.value).toBe(
      'https://acme.com'
    );
    expect(result.extraction.certifications[0].credential_url.value).toBe(
      'https://cert.com/123'
    );
    expect(result.extraction.projects[0].project_url.value).toBe(
      'https://myproject.org'
    );
    expect(result.extraction.publications[0].url.value).toBe(
      'https://research.net/paper'
    );
  });

  test('keeps failed values unchanged, records failedChecks, and logs without value or evidence', async () => {
    const loggedEntries = [];
    const logSpy = jest.fn((entry) => loggedEntries.push(entry));
    const step = createValidateWithCodeStep({ log: logSpy });

    const extraction = buildFullExtraction();
    // Intentionally introduce format violations and missing evidence
    extraction.candidate.headline.evidence = 'Non-existent Headline'; // missing evidence
    extraction.candidate.phone.value = '+962 12'; // invalid phone
    extraction.candidate.phone.evidence = '+962 12';
    extraction.candidate.country_code.value = 'Atlantis'; // invalid country
    extraction.candidate.country_code.evidence = 'Atlantis';
    extraction.languages[0].language.value = 'xx'; // invalid language
    extraction.languages[0].language.evidence = 'xx';
    extraction.links[0].url.value = 'not a url'; // invalid url
    extraction.links[0].url.evidence = 'not a url';
    extraction.work_experience[0].company_url.value = 'javascript:alert(1)'; // invalid url
    extraction.work_experience[0].company_url.evidence = 'javascript:alert(1)';
    extraction.certifications[0].credential_url.value = 'invalid cert url'; // invalid url
    extraction.certifications[0].credential_url.evidence = 'invalid cert url';
    extraction.projects[0].project_url.value = 'bad project url'; // invalid url
    extraction.projects[0].project_url.evidence = 'bad project url';
    extraction.publications[0].url.value = 'broken publication url'; // invalid url
    extraction.publications[0].url.evidence = 'broken publication url';

    const sourceText = [
      'Jane Doe Backend Developer Software Engineer Amman Atlantis +962 12',
      'Acme Mar 2021 Present Mar 2021 - Present Full-time Remote Node.js, PostgreSQL javascript:alert(1)',
      "University of Jordan Bachelor's BSc Computer Science Computer Science 2016 2020 2016 - 2020",
      'JavaScript 3 years of JavaScript',
      'xx English (fluent)',
      'GitHub not a url',
      'AWS Developer AWS June 2023 invalid cert url',
      'CV Parser Lead developer bad project url 2022',
      'Best Project 2020',
      'Modern Parsing Feb 2024 broken publication url',
      'Code Club Mentor 2019 2019 - present'
    ].join('\n');

    const ctx = {
      jobId: 'test-job-2',
      text: sourceText,
      links: [],
      extraction
    };

    const result = await step(ctx);

    // Poka-yoke: failed values are preserved
    expect(result.extraction.candidate.phone.value).toBe('+962 12');
    expect(result.extraction.candidate.country_code.value).toBe('Atlantis');
    expect(result.extraction.languages[0].language.value).toBe('xx');
    expect(result.extraction.links[0].url.value).toBe('not a url');
    expect(result.extraction.work_experience[0].company_url.value).toBe(
      'javascript:alert(1)'
    );
    expect(result.extraction.certifications[0].credential_url.value).toBe(
      'invalid cert url'
    );
    expect(result.extraction.projects[0].project_url.value).toBe(
      'bad project url'
    );
    expect(result.extraction.publications[0].url.value).toBe(
      'broken publication url'
    );

    // Exact failedChecks
    expect(result.failedChecks).toEqual([
      {
        section: 'candidate',
        index: null,
        field: 'headline',
        reason: 'evidence_not_found'
      },
      {
        section: 'candidate',
        index: null,
        field: 'phone',
        reason: 'invalid_phone'
      },
      {
        section: 'candidate',
        index: null,
        field: 'country_code',
        reason: 'invalid_country'
      },
      {
        section: 'languages',
        index: 0,
        field: 'language',
        reason: 'invalid_language'
      },
      {
        section: 'links',
        index: 0,
        field: 'url',
        reason: 'invalid_url'
      },
      {
        section: 'work_experience',
        index: 0,
        field: 'company_url',
        reason: 'invalid_url'
      },
      {
        section: 'certifications',
        index: 0,
        field: 'credential_url',
        reason: 'invalid_url'
      },
      {
        section: 'projects',
        index: 0,
        field: 'project_url',
        reason: 'invalid_url'
      },
      {
        section: 'publications',
        index: 0,
        field: 'url',
        reason: 'invalid_url'
      }
    ]);

    // Check log calls: exactly matches failed checks, exactly the 5 allowed keys
    expect(logSpy).toHaveBeenCalledTimes(9);
    for (const logged of loggedEntries) {
      expect(Object.keys(logged).sort()).toEqual([
        'field',
        'index',
        'jobId',
        'reason',
        'section'
      ]);
      expect(logged.jobId).toBe('test-job-2');
      expect(logged).not.toHaveProperty('value');
      expect(logged).not.toHaveProperty('evidence');
    }
  });

  test('reports phone_without_country_code when phone lacks leading plus', async () => {
    const logSpy = jest.fn();
    const step = createValidateWithCodeStep({ log: logSpy });

    const extraction = {
      meta: { document_language: 'en', extraction_warnings: [] },
      candidate: {
        phone: v('079 123 4567', '079 123 4567'),
        country_code: empty()
      },
      languages: [],
      links: [],
      work_experience: [],
      education: [],
      skills: [],
      certifications: [],
      projects: [],
      awards: [],
      publications: [],
      volunteering: []
    };

    const ctx = {
      jobId: 'test-job-phone',
      text: '079 123 4567',
      links: [],
      extraction
    };

    const result = await step(ctx);

    expect(result.failedChecks).toEqual([
      {
        section: 'candidate',
        index: null,
        field: 'phone',
        reason: 'phone_without_country_code'
      }
    ]);
    expect(result.extraction.candidate.phone.value).toBe('079 123 4567');
  });

  test('handles null value wrappers and empty extraction without error', async () => {
    const logSpy = jest.fn();
    const step = createValidateWithCodeStep({ log: logSpy });

    const ctxEmpty = {
      jobId: 'test-job-3',
      text: 'Some text',
      links: [],
      extraction: null
    };

    const resEmpty = await step(ctxEmpty);
    expect(resEmpty.failedChecks).toEqual([]);
    expect(logSpy).not.toHaveBeenCalled();

    const extractionNullValues = {
      meta: { document_language: 'en', extraction_warnings: [] },
      candidate: {
        phone: empty(),
        country_code: empty()
      },
      languages: [{ language: empty(), proficiency_level: empty() }],
      links: [{ link_type: empty(), url: empty(), label: empty() }],
      work_experience: [],
      education: [],
      skills: [],
      certifications: [],
      projects: [],
      awards: [],
      publications: [],
      volunteering: []
    };

    const ctxNulls = {
      jobId: 'test-job-4',
      text: 'Some text',
      links: [],
      extraction: extractionNullValues
    };

    const resNulls = await step(ctxNulls);
    expect(resNulls.failedChecks).toEqual([]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('LLM duration 20 for 2020-01 to 2021-12 -> replaced by 24 (D2)', async () => {
    const fixedNow = new Date('2026-11-15T10:00:00Z');
    const step = createValidateWithCodeStep({
      now: () => fixedNow,
      log: jest.fn()
    });
    const extraction = buildFullExtraction();
    extraction.work_experience = [
      {
        job_title: v('Engineer'),
        company_name: v('Acme'),
        start_date: v('2020-01', 'Jan 2020'),
        end_date: v('2021-12', 'Dec 2021'),
        is_current: v(false, 'no'),
        duration_months: v(20, 'Jan 2020 - Dec 2021', 0.8),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      }
    ];

    const ctx = {
      jobId: 'job-d2',
      text: 'Jan 2020 Dec 2021 Jan 2020 - Dec 2021 Engineer Acme no',
      links: [],
      extraction
    };

    const res = await step(ctx);
    expect(res.extraction.work_experience[0].duration_months.value).toBe(24);
    expect(res.extraction.work_experience[0].duration_months.evidence).toBe(
      'Jan 2020 - Dec 2021'
    );
    expect(res.extraction.work_experience[0].duration_months.confidence).toBe(
      0.8
    );
  });

  test('LLM duration null for "2021" to "2023" -> 36, evidence and confidence taken from start_date', async () => {
    const fixedNow = new Date('2026-11-15T10:00:00Z');
    const step = createValidateWithCodeStep({
      now: () => fixedNow,
      log: jest.fn()
    });
    const extraction = buildFullExtraction();
    extraction.work_experience = [
      {
        job_title: v('Engineer'),
        company_name: v('Acme'),
        start_date: v('2021', '2021', 0.95),
        end_date: v('2023', '2023', 0.95),
        is_current: v(false, 'no'),
        duration_months: empty(),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      }
    ];

    const ctx = {
      jobId: 'job-null-duration',
      text: '2021 2023 Engineer Acme no',
      links: [],
      extraction
    };

    const res = await step(ctx);
    expect(res.extraction.work_experience[0].duration_months.value).toBe(36);
    expect(res.extraction.work_experience[0].duration_months.evidence).toBe(
      '2021'
    );
    expect(res.extraction.work_experience[0].duration_months.confidence).toBe(
      0.95
    );
  });

  test('an ongoing job started 2025-01 -> 23 with the fixed now (card AC5)', async () => {
    const fixedNow = new Date('2026-11-15T10:00:00Z');
    const step = createValidateWithCodeStep({
      now: () => fixedNow,
      log: jest.fn()
    });
    const extraction = buildFullExtraction();
    extraction.work_experience = [
      {
        job_title: v('Engineer'),
        company_name: v('Acme'),
        start_date: v('2025-01', 'Jan 2025', 0.9),
        end_date: empty(),
        is_current: v(true, 'Present'),
        duration_months: empty(),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      }
    ];

    const ctx = {
      jobId: 'job-ongoing',
      text: 'Jan 2025 Present Engineer Acme',
      links: [],
      extraction
    };

    const res = await step(ctx);
    expect(res.extraction.work_experience[0].duration_months.value).toBe(23);
    expect(res.extraction.work_experience[0].duration_months.evidence).toBe(
      'Jan 2025'
    );
    expect(res.extraction.work_experience[0].duration_months.confidence).toBe(
      0.9
    );
  });

  test('a job with month 13 keeps its LLM duration and gets the invalid_date entry', async () => {
    const fixedNow = new Date('2026-11-15T10:00:00Z');
    const step = createValidateWithCodeStep({
      now: () => fixedNow,
      log: jest.fn()
    });
    const extraction = buildFullExtraction();
    extraction.work_experience = [
      {
        job_title: v('Engineer'),
        company_name: v('Acme'),
        start_date: v('2021-13', '2021-13', 0.9),
        end_date: v('2022-05', 'May 2022', 0.9),
        is_current: v(false, 'no'),
        duration_months: v(15, '15 months', 0.85),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      }
    ];

    const ctx = {
      jobId: 'job-month-13',
      text: '2021-13 May 2022 no 15 months Engineer Acme',
      links: [],
      extraction
    };

    const res = await step(ctx);
    expect(res.extraction.work_experience[0].duration_months.value).toBe(15);
    expect(res.failedChecks).toEqual(
      expect.arrayContaining([
        {
          section: 'work_experience',
          index: 0,
          field: 'start_date',
          reason: 'invalid_date'
        }
      ])
    );
  });

  test('date entries are logged with jobId, section, index, field, reason only, never the value or the evidence', async () => {
    const fixedNow = new Date('2026-11-15T10:00:00Z');
    const loggedEntries = [];
    const logSpy = jest.fn((entry) => loggedEntries.push(entry));
    const step = createValidateWithCodeStep({
      log: logSpy,
      now: () => fixedNow
    });

    const extraction = buildFullExtraction();
    extraction.work_experience = [
      {
        job_title: v('Engineer'),
        company_name: v('Acme'),
        start_date: v('2022-05', 'May 2022'),
        end_date: v('2021-03', 'Mar 2021'),
        is_current: v(false, 'no'),
        duration_months: empty(),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      }
    ];

    const ctx = {
      jobId: 'job-date-log',
      text: 'Engineer Acme May 2022 Mar 2021 no',
      links: [],
      extraction
    };

    await step(ctx);

    const dateEntry = loggedEntries.find(
      (e) => e.section === 'work_experience' && e.field === 'end_date'
    );
    expect(dateEntry).toBeDefined();
    expect(dateEntry).toEqual({
      jobId: 'job-date-log',
      section: 'work_experience',
      index: 0,
      field: 'end_date',
      reason: 'start_after_end'
    });
    expect(Object.keys(dateEntry).sort()).toEqual(
      ['field', 'index', 'jobId', 'reason', 'section'].sort()
    );
    expect(dateEntry).not.toHaveProperty('value');
    expect(dateEntry).not.toHaveProperty('evidence');
  });

  test('AC7: no experience total appears in ctx.extraction or in any other ctx key', async () => {
    const fixedNow = new Date('2026-11-15T10:00:00Z');
    const step = createValidateWithCodeStep({
      now: () => fixedNow,
      log: jest.fn()
    });
    const extraction = buildFullExtraction();
    extraction.work_experience = [
      {
        job_title: v('Dev 1'),
        company_name: v('Acme'),
        start_date: v('2020-01', 'Jan 2020'),
        end_date: v('2021-12', 'Dec 2021'),
        is_current: v(false, 'no'),
        duration_months: empty(),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      },
      {
        job_title: v('Dev 2'),
        company_name: v('Beta'),
        start_date: v('2021-01', 'Jan 2021'),
        end_date: v('2022-12', 'Dec 2022'),
        is_current: v(false, 'no'),
        duration_months: empty(),
        location: empty(),
        employment_type: empty(),
        work_mode: empty(),
        description: empty(),
        responsibilities: empty(),
        achievements: empty(),
        skills_used: empty(),
        company_url: empty()
      }
    ];

    const ctx = {
      jobId: 'job-ac7',
      text: 'Dev 1 Acme Jan 2020 Dec 2021 no Dev 2 Beta Jan 2021 Dec 2022 no',
      links: [],
      extraction
    };

    const res = await step(ctx);

    const allowedCtxKeys = [
      'jobId',
      'text',
      'links',
      'extraction',
      'failedChecks'
    ];
    for (const key of Object.keys(res)) {
      expect(allowedCtxKeys).toContain(key);
    }
    expect(res).not.toHaveProperty('total_experience');
    expect(res).not.toHaveProperty('total_months');
    expect(res).not.toHaveProperty('totalMonths');
    expect(res).not.toHaveProperty('experience_months');

    const allowedExtractionKeys = [
      'meta',
      'candidate',
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
    for (const key of Object.keys(res.extraction)) {
      expect(allowedExtractionKeys).toContain(key);
    }
    expect(res.extraction).not.toHaveProperty('total_experience');
    expect(res.extraction).not.toHaveProperty('total_months');
    expect(res.extraction).not.toHaveProperty('totalMonths');
    expect(res.extraction).not.toHaveProperty('experience_months');
  });
});
