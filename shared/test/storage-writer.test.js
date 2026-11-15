jest.mock('../src/database', () => ({
  connect: jest.fn()
}));

const pool = require('../src/database');
const { PermanentError } = require('../src/errors');
const { writeExtraction } = require('../src/storage-writer');

describe('storage-writer', () => {
  let client;

  const educationItem = {
    sourceIndex: 0,
    fields: {
      institution_name: {
        value: 'An-Najah National University',
        confidence: 0.99,
        evidence: 'An-Najah National University'
      },
      degree_level: {
        value: 'Bachelor',
        confidence: 0.99,
        evidence: "Bachelor's degree"
      },
      field_of_study: {
        value: 'Computer Engineering',
        confidence: 0.98,
        evidence: 'Computer Engineering'
      },
      degree_name: {
        value: 'BSc',
        confidence: 0.95,
        evidence: 'BSc'
      }
    }
  };
  const workExperienceItem = {
    sourceIndex: 0,
    fields: {
      job_title: {
        value: 'Software Engineer',
        confidence: 0.99,
        evidence: 'Software Engineer'
      },
      company_name: {
        value: 'ABC Technologies',
        confidence: 0.98,
        evidence: 'ABC Technologies'
      },
      start_date: {
        value: '2023',
        confidence: 0.95,
        evidence: '2023'
      },
      end_date: {
        value: null,
        confidence: null,
        evidence: null
      },
      is_current: {
        value: true,
        confidence: 0.99,
        evidence: 'Present'
      }
    }
  };
  const certificationItem = {
    sourceIndex: 0,
    fields: {
      name: {
        value: 'AWS Certified Developer',
        confidence: 0.99,
        evidence: 'AWS Certified Developer'
      },
      issuing_organization: {
        value: 'Amazon Web Services',
        confidence: 0.98,
        evidence: 'Amazon Web Services'
      },
      issue_date: {
        value: '2025',
        confidence: 0.95,
        evidence: 'Issued in 2025'
      },
      expiration_date: {
        value: null,
        confidence: null,
        evidence: null
      },
      credential_id: {
        value: 'AWS-12345',
        confidence: 0.97,
        evidence: 'Credential ID: AWS-12345'
      },
      credential_url: {
        value: null,
        confidence: null,
        evidence: null
      },
      description: {
        value: 'Cloud development certification',
        confidence: 0.96,
        evidence: 'Cloud development certification'
      }
    }
  };
  const projectItem = {
    sourceIndex: 0,
    fields: {
      name: {
        value: 'Simera Candidate Platform',
        confidence: 0.99,
        evidence: 'Simera Candidate Platform'
      },
      description: {
        value: 'A candidate data processing platform',
        confidence: 0.98,
        evidence: 'A platform for processing candidate data'
      },
      role: {
        value: 'Backend Developer',
        confidence: 0.97,
        evidence: 'Backend Developer'
      },
      project_url: {
        value: 'https://github.com/example/simera',
        confidence: 0.99,
        evidence: 'GitHub repository URL'
      },
      start_date: {
        value: '2025',
        confidence: 0.95,
        evidence: 'Started in 2025'
      },
      end_date: {
        value: null,
        confidence: null,
        evidence: null
      }
    }
  };
  const awardItem = {
    sourceIndex: 0,
    fields: {
      name: {
        value: 'Best Developer Award',
        confidence: 0.99,
        evidence: 'Best Developer Award'
      },
      issuer: {
        value: 'Tech Organization',
        confidence: 0.98,
        evidence: 'Awarded by Tech Organization'
      },
      award_date: {
        value: '2025',
        confidence: 0.95,
        evidence: 'Awarded in 2025'
      },
      description: {
        value: 'Recognition for outstanding development work',
        confidence: 0.97,
        evidence: 'Outstanding development work'
      }
    }
  };
  const publicationItem = {
    sourceIndex: 0,
    fields: {
      title: {
        value: 'Machine Learning in Healthcare',
        confidence: 0.99,
        evidence: 'Machine Learning in Healthcare'
      },
      publisher: {
        value: 'IEEE',
        confidence: 0.98,
        evidence: 'Published by IEEE'
      },
      publication_date: {
        value: '2025',
        confidence: 0.95,
        evidence: 'Published in 2025'
      },
      url: {
        value: 'https://example.com/publication',
        confidence: 0.97,
        evidence: 'Publication URL'
      },
      description: {
        value: 'Research on machine learning applications in healthcare',
        confidence: 0.96,
        evidence: 'Research on machine learning applications in healthcare'
      }
    }
  };
  const volunteeringItem = {
    sourceIndex: 0,
    fields: {
      organization: {
        value: 'Community Tech Initiative',
        confidence: 0.98,
        evidence: 'Community Tech Initiative'
      },
      role: {
        value: 'Volunteer Developer',
        confidence: 0.97,
        evidence: 'Volunteer Developer'
      },
      description: {
        value: 'Helped build a community website',
        confidence: 0.96,
        evidence: 'Built a community website'
      },
      start_date: {
        value: '2024',
        confidence: 0.95,
        evidence: 'Started in 2024'
      },
      end_date: {
        value: null,
        confidence: null,
        evidence: null
      },
      is_current: {
        value: true,
        confidence: 0.98,
        evidence: 'Currently volunteering'
      }
    }
  };
  const languageItem = {
    sourceIndex: 0,
    fields: {
      language: {
        value: 'English',
        confidence: 0.99,
        evidence: 'English'
      },
      proficiency_level: {
        value: 'advanced',
        confidence: 0.98,
        evidence: 'Advanced'
      }
    }
  };
  const linkItem = {
    sourceIndex: 0,
    fields: {
      link_type: {
        value: 'github',
        confidence: 0.99,
        evidence: 'GitHub: https://github.com/ExampleUser/'
      },
      url: {
        value: 'https://github.com/ExampleUser/',
        confidence: 0.99,
        evidence: 'GitHub: https://github.com/ExampleUser/'
      },
      label: {
        value: 'GitHub',
        confidence: 0.95,
        evidence: 'GitHub'
      }
    }
  };
  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(client);

    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM conflicts')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO conflicts')) {
        return { rows: [{ id: 501 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO conflict_options')) {
        return { rows: [{ id: 601 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO human_reviews')) {
        return { rows: [{ id: 701 }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO data_provenance_sources')) {
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }
      if (
        sql.includes('UPDATE candidate_profiles') ||
        sql.includes('FROM candidate_profiles')
      ) {
        return {
          rows: [
            {
              id: 10,
              first_name: null,
              last_name: null
            }
          ],
          rowCount: 1
        };
      }
      if (sql.includes('SELECT') && sql.includes('candidate_id')) {
        return {
          rows: [
            {
              candidate_id: 10,
              job_id: 5,
              file_id: 20
            }
          ]
        };
      }

      if (sql.includes('INSERT INTO education')) {
        return {
          rows: [
            {
              id: 25,
              institution_name: 'An-Najah National University'
            }
          ]
        };
      }
      if (sql.includes('INSERT INTO work_experience')) {
        return {
          rows: [{ id: 35 }]
        };
      }
      if (sql.includes('INSERT INTO candidate_links')) {
        return {
          rows: [
            {
              id: 85,
              link_type: 'github',
              url: 'https://github.com/ExampleUser/',
              label: 'GitHub'
            }
          ],
          rowCount: 1
        };
      }

      return { rows: [] };
    });
  });
  test('should create a human review for a new unknown skill', async () => {
    const originalMock = client.query.getMockImplementation();

    client.query.mockImplementation(async (sql, params) => {
      if (sql.includes('INSERT INTO unknown_skills')) {
        return {
          rows: [{ id: 901, skill_name: 'Rust', status: 'pending' }],
          rowCount: 1
        };
      }

      return originalMock(sql, params);
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        skills: {
          matched: [],
          unknown: [
            {
              sourceIndex: 0,
              skillName: 'Rust',
              confidence: 0.85,
              evidence: 'Developed backend services using Rust'
            }
          ]
        }
      }
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO unknown_skills'),
      [10, 'Rust', 20, 0.85, 'Developed backend services using Rust']
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO human_reviews'),
      [10, 901]
    );

    expect(result.skills.unknown).toHaveLength(1);
    expect(result.pendingReviewCount).toBe(1);
  });
  test('should insert a new education item', async () => {
    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          education: [educationItem]
        }
      }
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO education'),
      expect.any(Array)
    );

    expect(result.education).toHaveLength(1);
    expect(result.education[0].itemId).toBe(25);
    expect(result.education[0].itemType).toBe('education');

    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
  test('should throw PermanentError when education institution name is missing', async () => {
    const invalidEducationItem = {
      sourceIndex: 0,
      fields: {
        institution_name: {
          value: null,
          confidence: null,
          evidence: null
        }
      }
    };

    await expect(
      writeExtraction({
        userId: 1,
        jobId: 5,
        mappedData: {
          profile: {},
          items: {
            education: [invalidEducationItem]
          }
        }
      })
    ).rejects.toBeInstanceOf(PermanentError);
  });

  test('should handle two education items with the same deduplication key in one extraction', async () => {
    const secondEducationItem = {
      ...educationItem,
      sourceIndex: 1
    };

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          education: [educationItem, secondEducationItem]
        }
      }
    });

    const educationQueries = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO education')
    );

    // Both items should be merged into one database record.
    expect(educationQueries).toHaveLength(1);

    expect(result.education).toHaveLength(1);

    expect(result.education[0].itemId).toBe(25);
    expect(result.education[0].sourceIndex).toBe(0);
  });
  test('should detect an intra-source conflict between duplicate education items', async () => {
    const secondEducationItem = {
      ...educationItem,
      sourceIndex: 1,
      fields: {
        ...educationItem.fields,
        degree_name: {
          value: 'MSc',
          confidence: 0.9,
          evidence: 'Master of Science'
        }
      }
    };

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          education: [educationItem, secondEducationItem]
        }
      }
    });

    // Both entries should represent one education record.
    expect(result.education).toHaveLength(1);

    // The conflicting field should be identified for review.
    expect(result.reviewCandidates).toHaveLength(1);
    expect(result.reviewCandidates[0]).toMatchObject({
      itemType: 'education',
      itemId: 25,
      fieldName: 'degree_name'
    });

    expect(result.reviewCandidates[0].values).toHaveLength(2);
    expect(
      result.reviewCandidates[0].values.map((option) => option.wrapper.value)
    ).toEqual(['BSc', 'MSc']);
    // A pending conflict should be created.
    const conflictCall = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO conflicts')
    );
    expect(conflictCall).toBeDefined();

    // Both conflicting values should be saved as options.
    const optionCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO conflict_options')
    );
    expect(optionCalls).toHaveLength(2);

    // One human review should be created for the conflict.
    const reviewCall = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO human_reviews')
    );
    expect(reviewCall).toBeDefined();
  });
  it('should reuse an existing pending conflict and add new options', async () => {
    const secondEducationItem = {
      ...educationItem,
      sourceIndex: 1,
      fields: {
        ...educationItem.fields,
        degree_name: {
          value: 'MSc',
          confidence: 0.9,
          evidence: 'Master of Science'
        }
      }
    };

    // Preserve the default mock behavior, but simulate an existing conflict.
    const defaultQuery = client.query.getMockImplementation();

    client.query.mockImplementation(async (sql, ...params) => {
      if (sql.includes('FROM conflicts')) {
        return { rows: [{ id: 777 }], rowCount: 1 };
      }

      return defaultQuery(sql, ...params);
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          education: [educationItem, secondEducationItem]
        }
      }
    });

    // No new conflict should be created.
    const conflictInsertCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO conflicts')
    );
    expect(conflictInsertCalls).toHaveLength(0);

    // Both new options should be attached to the existing conflict.
    const optionCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO conflict_options')
    );

    expect(optionCalls).toHaveLength(2);
    expect(optionCalls[0][1][0]).toBe(777);
    expect(optionCalls[1][1][0]).toBe(777);

    // No duplicate human review should be created.
    const reviewCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO human_reviews')
    );
    expect(reviewCalls).toHaveLength(0);

    // No new pending review was created.
    expect(result.pendingReviewCount).toBe(0);
  });
  it('should update an existing education item by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO education')) {
        expect(sql).toContain('DO UPDATE SET');
        expect(sql).toContain(
          'degree_level = COALESCE(education.degree_level, EXCLUDED.degree_level)'
        );
        expect(sql).toContain(
          'degree_name = COALESCE(education.degree_name, EXCLUDED.degree_name)'
        );

        // Simulate updating an existing row.
        return { rows: [{ id: 15 }] };
      }

      if (sql.includes('INSERT INTO conflicts')) {
        return {
          rows: [{ id: 501 }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO conflict_options')) {
        return {
          rows: [{ id: 601 }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO human_reviews')) {
        return {
          rows: [{ id: 701 }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [] };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        items: {
          education: [educationItem]
        }
      }
    });

    expect(result.education[0].itemId).toBe(15);

    const educationQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO education')
    );

    expect(educationQuery).toBeDefined();
    expect(educationQuery[0]).toContain('DO UPDATE SET');
  });

  test('should rollback the transaction when education insertion fails', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return {
          rows: [{ candidate_id: 10, job_id: 5 }]
        };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO education')) {
        throw new Error('Database insertion failed');
      }

      return { rows: [] };
    });

    await expect(
      writeExtraction({
        userId: 1,
        jobId: 5,
        mappedData: {
          profile: {},
          items: {
            education: [educationItem]
          }
        }
      })
    ).rejects.toThrow('Database insertion failed');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
  it('should save provenance and source for non-null education fields', async () => {
    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          education: [educationItem]
        }
      }
    });
    console.log(client.query.mock.calls.map(([sql]) => sql));

    const provenanceInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO data_provenance')
    );

    const sourceInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO data_provenance_sources')
    );

    expect(provenanceInsert).toBeDefined();
    expect(sourceInsert).toBeDefined();

    expect(provenanceInsert[1]).toEqual([
      10,
      'education',
      '25',
      'institution_name'
    ]);

    expect(sourceInsert[1]).toEqual([
      expect.any(Number),
      5,
      JSON.stringify('An-Najah National University'),
      0.99,
      'An-Najah National University'
    ]);

    expect(result.provenance).toContainEqual({
      provenanceId: expect.any(Number),
      fieldName: 'institution_name'
    });
  });
  test('should rollback when provenance insertion fails', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return {
          rows: [{ candidate_id: 10, job_id: 5 }]
        };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO education')) {
        return {
          rows: [
            {
              id: 25,
              institution_name: 'An-Najah National University'
            }
          ]
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        throw new Error('Provenance insertion failed');
      }

      return { rows: [] };
    });

    await expect(
      writeExtraction({
        userId: 1,
        jobId: 5,
        mappedData: {
          profile: {},
          items: {
            education: [educationItem]
          }
        }
      })
    ).rejects.toThrow('Provenance insertion failed');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
  test('should insert a new work experience item', async () => {
    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          work_experience: [workExperienceItem]
        }
      }
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO work_experience'),
      expect.any(Array)
    );

    expect(result.work_experience).toHaveLength(1);
    expect(result.work_experience[0].itemId).toBe(35);
    expect(result.work_experience[0].itemType).toBe('work_experience');

    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
  test('should create a low-confidence review for a work experience field', async () => {
    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          work_experience: [
            {
              ...workExperienceItem,
              fields: {
                ...workExperienceItem.fields,
                location: {
                  value: 'Nablus',
                  confidence: 0.3,
                  evidence: 'Worked in Nablus'
                }
              }
            }
          ]
        }
      }
    });

    const conflictQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO conflicts')
    );

    expect(conflictQuery).toBeDefined();
    expect(conflictQuery[1]).toEqual([10, 'work_experience', '35', 'location']);

    const humanReviewQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO human_reviews')
    );

    expect(humanReviewQuery).toBeDefined();
    expect(humanReviewQuery[1]).toEqual([10, 501, 'low_confidence']);

    const optionQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO conflict_options')
    );

    expect(optionQuery).toBeDefined();
    expect(optionQuery[1]).toEqual([
      501,
      JSON.stringify('Nablus'),
      20,
      0.3,
      'Worked in Nablus'
    ]);

    expect(result.pendingReviewCount).toBe(1);
  });
  test('should update an existing work experience item by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO work_experience')) {
        expect(sql).toContain('DO UPDATE SET');

        expect(sql).toContain(
          'job_title = COALESCE(work_experience.job_title, EXCLUDED.job_title)'
        );

        expect(sql).toContain(
          'location = COALESCE(work_experience.location, EXCLUDED.location)'
        );

        return { rows: [{ id: 40 }] };
      }

      if (sql.includes('INSERT INTO data_provenance')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [] };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        items: {
          work_experience: [workExperienceItem]
        }
      }
    });

    expect(result.work_experience[0].itemId).toBe(40);
  });
  test('should update provenance source when the same job is processed again', async () => {
    await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          education: [educationItem]
        }
      }
    });

    const sourceQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO data_provenance_sources')
    );

    expect(sourceQuery).toBeDefined();
    expect(sourceQuery[0]).toContain('ON CONFLICT (provenance_id, job_id)');
    expect(sourceQuery[0]).toContain('DO UPDATE SET');
    expect(sourceQuery[0]).toContain('source_value = EXCLUDED.source_value');
    expect(sourceQuery[0]).toContain('confidence = EXCLUDED.confidence');
    expect(sourceQuery[0]).toContain('evidence = EXCLUDED.evidence');
  });
  test('should save provenance for non-null profile fields', async () => {
    const profile = {
      first_name: {
        value: 'Deema',
        confidence: 0.99,
        evidence: 'Deema Hamoudeh'
      },
      last_name: {
        value: 'Hamoudeh',
        confidence: 0.98,
        evidence: 'Deema Hamoudeh'
      },
      phone: {
        value: null,
        confidence: null,
        evidence: null
      }
    };
    const defaultQueryImplementation = client.query.getMockImplementation();

    client.query.mockImplementation(async (sql, params) => {
      if (sql.includes('UPDATE candidate_profiles')) {
        return {
          rows: [
            {
              id: 10,
              first_name: 'Deema',
              last_name: 'Hamoudeh'
            }
          ],
          rowCount: 1
        };
      }

      return defaultQueryImplementation(sql, params);
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile,
        items: {}
      }
    });

    const profileProvenanceQueries = client.query.mock.calls.filter(
      ([sql, params]) =>
        sql.includes('INSERT INTO data_provenance (') &&
        params?.[1] === 'candidate_profile'
    );

    expect(profileProvenanceQueries).toHaveLength(2);

    expect(profileProvenanceQueries[0][1]).toEqual([
      10,
      'candidate_profile',
      '10',
      'first_name'
    ]);

    expect(profileProvenanceQueries[1][1]).toEqual([
      10,
      'candidate_profile',
      '10',
      'last_name'
    ]);

    expect(result.provenance).toHaveLength(2);
  });
  test('should create a pending review for a low-confidence profile field', async () => {
    const defaultQueryImplementation = client.query.getMockImplementation();

    client.query.mockImplementation(async (sql, params) => {
      if (sql.includes('UPDATE candidate_profiles')) {
        return {
          rows: [
            {
              id: 10,
              first_name: 'Deema',
              last_name: 'Hamoudeh'
            }
          ],
          rowCount: 1
        };
      }

      return defaultQueryImplementation(sql, params);
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {
          first_name: {
            value: 'Deema',
            confidence: 0.99,
            evidence: 'Deema Hamoudeh'
          },
          last_name: {
            value: 'Hamoudeh',
            confidence: 0.98,
            evidence: 'Deema Hamoudeh'
          }
        },
        items: {}
      },
      reviewItems: [
        {
          targetType: 'conflict',
          reviewReason: 'low_confidence',
          itemType: 'candidate_profile',
          fieldName: 'phone',
          options: [
            {
              value: '+970123456789',
              confidence: 0.3,
              evidence: 'Phone number found in resume'
            }
          ]
        }
      ]
    });

    const conflictQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO conflicts')
    );

    expect(conflictQuery).toBeDefined();
    expect(conflictQuery[1]).toEqual([10, 'candidate_profile', '10', 'phone']);

    const humanReviewQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO human_reviews')
    );

    expect(humanReviewQuery).toBeDefined();
    expect(humanReviewQuery[1]).toEqual([10, 501, 'low_confidence']);

    const optionQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO conflict_options')
    );

    expect(optionQuery).toBeDefined();
    expect(optionQuery[1]).toEqual([
      501,
      JSON.stringify('+970123456789'),
      20,
      0.3,
      'Phone number found in resume'
    ]);

    expect(result.pendingReviewCount).toBe(1);
  });
  test('should save processing metadata', async () => {
    await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        processing: {
          document_language: 'en',
          extraction_warnings: ['Some text was unclear.']
        },
        profile: {},
        items: {}
      }
    });

    const processingQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE processing_jobs')
    );

    expect(processingQuery).toBeDefined();

    expect(processingQuery[1]).toEqual([
      'en',
      JSON.stringify(['Some text was unclear.']),
      5
    ]);
  });
  test('should insert a new certification item', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO certifications')) {
        expect(sql).toContain('ON CONFLICT (candidate_id, deduplication_key)');
        return { rows: [{ id: 45 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          certifications: [certificationItem]
        }
      }
    });

    expect(result.certifications).toHaveLength(1);
    expect(result.certifications[0]).toEqual(
      expect.objectContaining({
        itemType: 'certifications',
        itemId: 45,
        sourceIndex: 0
      })
    );

    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO certifications')
      )
    ).toBe(true);
  });
  test('should update an existing certification by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO certifications')) {
        expect(sql).toContain('ON CONFLICT (candidate_id, deduplication_key)');
        expect(sql).toMatch(
          /issuing_organization\s*=\s*COALESCE\(\s*certifications\.issuing_organization,\s*EXCLUDED\.issuing_organization\s*\)/
        );

        return { rows: [{ id: 46 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          certifications: [certificationItem]
        }
      }
    });

    expect(result.certifications).toHaveLength(1);
    expect(result.certifications[0].itemId).toBe(46);
  });
  test('should save provenance for non-null certification fields', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO certifications')) {
        return {
          rows: [
            {
              id: 47,
              name: 'AWS Certified Developer',
              issuing_organization: 'Amazon Web Services',
              issue_date: '2025',
              expiration_date: null,
              credential_id: 'AWS-12345',
              credential_url: null,
              description: 'Cloud development certification'
            }
          ],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          certifications: [certificationItem]
        }
      }
    });

    const provenanceCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance (')
    );

    const sourceCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance_sources')
    );

    // Five non-null certification fields.
    expect(provenanceCalls).toHaveLength(5);
    expect(sourceCalls).toHaveLength(5);

    expect(result.provenance).toHaveLength(5);
    expect(result.certifications[0].itemId).toBe(47);
  });
  test('should insert a new project item', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO projects')) {
        expect(sql).toContain('ON CONFLICT (candidate_id, deduplication_key)');

        return { rows: [{ id: 55 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          projects: [projectItem]
        }
      }
    });

    expect(result.projects).toHaveLength(1);

    expect(result.projects[0]).toEqual(
      expect.objectContaining({
        itemType: 'projects',
        itemId: 55,
        sourceIndex: 0
      })
    );

    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO projects')
      )
    ).toBe(true);
  });
  test('should update an existing project by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO projects')) {
        expect(sql).toMatch(
          /description\s*=\s*COALESCE\(\s*projects\.description,\s*EXCLUDED\.description\s*\)/
        );

        expect(sql).toMatch(
          /role\s*=\s*COALESCE\(\s*projects\.role,\s*EXCLUDED\.role\s*\)/
        );

        return { rows: [{ id: 56 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          projects: [projectItem]
        }
      }
    });

    expect(result.projects[0].itemId).toBe(56);
  });
  test('should save provenance for non-null project fields', async () => {
    const provenanceCalls = [];
    const sourceCalls = [];

    client.query.mockImplementation(async (sql, values) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO projects')) {
        return {
          rows: [
            {
              id: 57,
              name: 'Simera Candidate Platform',
              description: 'A candidate data processing platform',
              role: 'Backend Developer',
              project_url: 'https://github.com/example/simera',
              start_date: '2025',
              end_date: null
            }
          ],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        provenanceCalls.push(values);
        return { rows: [{ id: 100 + provenanceCalls.length }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance_sources')) {
        sourceCalls.push(values);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          projects: [projectItem]
        }
      }
    });

    expect(provenanceCalls).toHaveLength(5);
    expect(sourceCalls).toHaveLength(5);
    expect(result.provenance).toHaveLength(5);
  });
  test('should insert a new award item', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO awards')) {
        expect(sql).toContain('ON CONFLICT (candidate_id, deduplication_key)');

        return { rows: [{ id: 65 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          awards: [awardItem]
        }
      }
    });

    expect(result.awards).toHaveLength(1);

    expect(result.awards[0]).toEqual(
      expect.objectContaining({
        itemType: 'awards',
        itemId: 65,
        sourceIndex: 0
      })
    );
  });
  test('should update an existing award by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO awards')) {
        expect(sql).toMatch(
          /issuer\s*=\s*COALESCE\(\s*awards\.issuer,\s*EXCLUDED\.issuer\s*\)/
        );

        expect(sql).toMatch(
          /description\s*=\s*COALESCE\(\s*awards\.description,\s*EXCLUDED\.description\s*\)/
        );

        return { rows: [{ id: 66 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          awards: [awardItem]
        }
      }
    });

    expect(result.awards[0].itemId).toBe(66);
  });
  test('should save provenance for non-null award fields', async () => {
    const provenanceCalls = [];
    const sourceCalls = [];

    client.query.mockImplementation(async (sql, values) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO awards')) {
        return {
          rows: [
            {
              id: 67,
              name: 'Best Developer Award',
              issuer: 'Tech Organization',
              award_date: '2025',
              description: 'Recognition for outstanding development work'
            }
          ],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        provenanceCalls.push(values);
        return { rows: [{ id: 100 + provenanceCalls.length }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance_sources')) {
        sourceCalls.push(values);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          awards: [awardItem]
        }
      }
    });

    expect(provenanceCalls).toHaveLength(4);
    expect(sourceCalls).toHaveLength(4);
    expect(result.provenance).toHaveLength(4);
  });

  test('should insert a new publication item', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO publications')) {
        expect(sql).toContain('ON CONFLICT (candidate_id, deduplication_key)');

        return { rows: [{ id: 75 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          publications: [publicationItem]
        }
      }
    });

    expect(result.publications).toHaveLength(1);

    expect(result.publications[0]).toEqual(
      expect.objectContaining({
        itemType: 'publications',
        itemId: 75,
        sourceIndex: 0
      })
    );
  });
  test('should update an existing publication by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO publications')) {
        expect(sql).toMatch(
          /publisher\s*=\s*COALESCE\(\s*publications\.publisher,\s*EXCLUDED\.publisher\s*\)/
        );

        expect(sql).toMatch(
          /description\s*=\s*COALESCE\(\s*publications\.description,\s*EXCLUDED\.description\s*\)/
        );

        return { rows: [{ id: 76 }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          publications: [publicationItem]
        }
      }
    });

    expect(result.publications[0].itemId).toBe(76);
  });
  test('should save provenance for non-null publication fields', async () => {
    const provenanceCalls = [];
    const sourceCalls = [];

    client.query.mockImplementation(async (sql, values) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10, job_id: 5 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO publications')) {
        return {
          rows: [
            {
              id: 77,
              title: 'Machine Learning in Healthcare',
              publisher: 'IEEE',
              publication_date: '2025',
              url: 'https://example.com/publication',
              description:
                'Research on machine learning applications in healthcare'
            }
          ],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        provenanceCalls.push(values);
        return { rows: [{ id: 100 + provenanceCalls.length }], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO data_provenance_sources')) {
        sourceCalls.push(values);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 1 };
    });
    //   console.log(publicationItem);
    //   console.log('PUBLICATION ITEM:', JSON.stringify(publicationItem, null, 2));

    const result = await writeExtraction({
      userId: 1,
      jobId: 5,
      mappedData: {
        profile: {},
        items: {
          publications: [publicationItem]
        }
      }
    });

    expect(provenanceCalls).toHaveLength(5);
    expect(sourceCalls).toHaveLength(5);
    expect(result.provenance).toHaveLength(5);
  });
  test('should insert a new volunteering item', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO volunteering')) {
        return { rows: [{ id: 85 }] };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 1,
      mappedData: {
        profile: {},
        items: {
          volunteering: [volunteeringItem]
        }
      }
    });

    expect(result.volunteering).toHaveLength(1);
    expect(result.volunteering[0]).toMatchObject({
      itemType: 'volunteering',
      itemId: 85,
      sourceIndex: 0
    });

    const volunteeringQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO volunteering')
    );

    expect(volunteeringQuery).toBeDefined();
    expect(volunteeringQuery[0]).toContain(
      'ON CONFLICT (candidate_id, deduplication_key)'
    );
    expect(volunteeringQuery[0]).toContain('DO UPDATE SET');
  });
  test('should update an existing volunteering item by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO volunteering')) {
        return { rows: [{ id: 86 }] };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 1,
      mappedData: {
        profile: {},
        items: {
          volunteering: [volunteeringItem]
        }
      }
    });

    expect(result.volunteering[0].itemId).toBe(86);

    const volunteeringQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO volunteering')
    );

    expect(volunteeringQuery[0]).toContain(
      'organization = COALESCE(volunteering.organization, EXCLUDED.organization)'
    );

    expect(volunteeringQuery[0]).toContain(
      'description = COALESCE(volunteering.description, EXCLUDED.description)'
    );
  });
  test('should save provenance for non-null volunteering fields', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO volunteering')) {
        return {
          rows: [
            {
              id: 87,
              organization: 'Community Tech Initiative',
              role: 'Volunteer Developer',
              description: 'Helped build a community website',
              start_date: '2024',
              end_date: null,
              is_current: true
            }
          ],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [], rowCount: 1 };
    });
    //   console.log('VOLUNTEERING ITEM:', JSON.stringify(volunteeringItem, null, 2));
    const result = await writeExtraction({
      userId: 1,
      jobId: 1,
      mappedData: {
        profile: {},
        items: {
          volunteering: [volunteeringItem]
        }
      }
    });

    const provenanceCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance (')
    );

    const sourceCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance_sources')
    );

    expect(provenanceCalls).toHaveLength(5);
    expect(sourceCalls).toHaveLength(5);
    expect(result.provenance).toHaveLength(5);
  });
  test('should insert a new language item', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO candidate_languages')) {
        return { rows: [{ id: 95 }] };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 1,
      mappedData: {
        profile: {},
        items: {
          languages: [languageItem]
        }
      }
    });

    expect(result.languages).toHaveLength(1);
    expect(result.languages[0]).toMatchObject({
      itemType: 'candidate_languages',
      itemId: 95,
      sourceIndex: 0
    });

    const languageQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO candidate_languages')
    );

    expect(languageQuery).toBeDefined();
    expect(languageQuery[0]).toContain('ON CONFLICT (candidate_id, language)');
    expect(languageQuery[0]).toContain('DO UPDATE SET');
  });
  test('should update an existing language by filling null fields only', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }
      if (sql.includes('INSERT INTO candidate_languages')) {
        return { rows: [{ id: 96 }] };
      }

      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [], rowCount: 1 };
    });

    const result = await writeExtraction({
      userId: 1,
      jobId: 1,
      mappedData: {
        profile: {},
        items: {
          languages: [languageItem]
        }
      }
    });

    expect(result.languages[0].itemId).toBe(96);

    const languageQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO candidate_languages')
    );

    expect(languageQuery[0]).toContain('proficiency_level = COALESCE(');

    expect(languageQuery[0]).toContain('candidate_languages.proficiency_level');

    expect(languageQuery[0]).toContain('EXCLUDED.proficiency_level');
  });
  test('should save provenance for non-null language fields', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users u')) {
        return { rows: [{ candidate_id: 10 }] };
      }
      if (sql.includes('FROM candidate_profiles')) {
        return {
          rows: [{ id: 10, first_name: null, last_name: null }],
          rowCount: 1
        };
      }

      if (sql.includes('INSERT INTO candidate_languages')) {
        return {
          rows: [
            {
              id: 97,
              language: 'English',
              proficiency_level: 'advanced'
            }
          ]
        };
      }
      if (sql.includes('INSERT INTO data_provenance (')) {
        return { rows: [{ id: 100 }] };
      }

      return { rows: [], rowCount: 1 };
    });
    //   console.log('LANGUAGE ITEM:', JSON.stringify(languageItem, null, 2));
    const result = await writeExtraction({
      userId: 1,
      jobId: 1,
      mappedData: {
        profile: {},
        items: {
          languages: [languageItem]
        }
      }
    });

    const provenanceCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance (')
    );

    const sourceCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance_sources')
    );

    expect(provenanceCalls).toHaveLength(2);
    expect(sourceCalls).toHaveLength(2);
    expect(result.provenance).toHaveLength(2);
  });
  it('should insert a new candidate link', async () => {
    const mappedData = {
      profile: {},
      items: {
        links: [linkItem]
      }
    };

    const result = await writeExtraction({
      userId: 1,
      jobId: 10,
      mappedData
    });

    const linkQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO candidate_links')
    );

    expect(linkQuery).toBeDefined();
    expect(linkQuery[1]).toEqual([
      10,
      'github',
      'https://github.com/exampleuser',
      'GitHub'
    ]);

    expect(result.links).toEqual([
      expect.objectContaining({
        itemType: 'candidate_links',
        itemId: 85,
        sourceIndex: 0
      })
    ]);
  });
  it('should update an existing candidate link without overwriting non-null fields', async () => {
    const mappedData = {
      profile: {},
      items: {
        links: [linkItem]
      }
    };

    await writeExtraction({
      userId: 1,
      jobId: 10,
      mappedData
    });

    const linkQuery = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO candidate_links')
    );

    expect(linkQuery[0]).toContain('ON CONFLICT (candidate_id, url)');

    expect(linkQuery[0]).toContain(
      'link_type = COALESCE(candidate_links.link_type, EXCLUDED.link_type)'
    );

    expect(linkQuery[0]).toContain(
      'label = COALESCE(candidate_links.label, EXCLUDED.label)'
    );
  });
  it('should save provenance for non-null candidate link fields', async () => {
    const mappedData = {
      profile: {},
      items: {
        links: [linkItem]
      }
    };

    await writeExtraction({
      userId: 1,
      jobId: 10,
      mappedData
    });

    const provenanceSourceQueries = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO data_provenance_sources')
    );

    expect(provenanceSourceQueries).toHaveLength(3);

    expect(provenanceSourceQueries[0][1]).toContain(JSON.stringify('github'));

    expect(provenanceSourceQueries[1][1]).toContain(
      JSON.stringify('https://github.com/ExampleUser/')
    );

    expect(provenanceSourceQueries[2][1]).toContain(JSON.stringify('GitHub'));
  });
});
