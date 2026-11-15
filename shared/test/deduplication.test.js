const {
  normalizeTextForKey,
  normalizeCompanyNameForKey,
  normalizeUrlForStorage,
  buildDeduplicationKey,
  mergeFieldValues,
  mergeDateValues,
  mergeDuplicateItems
} = require('../src/deduplication');
describe('normalizeTextForKey', () => {
  test('trims leading and trailing whitespace', () => {
    expect(normalizeTextForKey('  Google  ')).toBe('google');
  });

  test('converts text to lowercase', () => {
    expect(normalizeTextForKey('GOOGLE')).toBe('google');
  });

  test('collapses repeated internal whitespace', () => {
    expect(normalizeTextForKey('software   engineer')).toBe(
      'software engineer'
    );
  });

  test('applies Unicode NFKC normalization', () => {
    expect(normalizeTextForKey('ＡＢＣ')).toBe('abc');
  });

  test('returns null for empty or whitespace-only strings', () => {
    expect(normalizeTextForKey('   ')).toBeNull();
  });

  test('returns null for null or undefined', () => {
    expect(normalizeTextForKey(null)).toBeNull();
    expect(normalizeTextForKey(undefined)).toBeNull();
  });

  test('throws when value is not a string or null', () => {
    expect(() => normalizeTextForKey(123)).toThrow(TypeError);
  });
});



describe('normalizeCompanyNameForKey', () => {
  test('removes common legal suffixes', () => {
    expect(normalizeCompanyNameForKey('Google Inc.')).toBe('google');
    expect(normalizeCompanyNameForKey('Google LLC')).toBe('google');
    expect(normalizeCompanyNameForKey('Google Corporation')).toBe('google');
  });

  test('handles punctuation variations', () => {
    expect(normalizeCompanyNameForKey('Google, Inc.')).toBe('google');
    expect(normalizeCompanyNameForKey('Google L.L.C.')).toBe('google');
    expect(normalizeCompanyNameForKey('Google L.L.P.')).toBe('google');
  });

  test('does not remove suffix-like words inside company names', () => {
    expect(normalizeCompanyNameForKey('Google Incubator')).toBe(
      'google incubator'
    );
  });

  test('does not remove non-approved suffixes', () => {
    expect(normalizeCompanyNameForKey('Google Company')).toBe(
      'google company'
    );
  });

  test('preserves the original normalized value if stripping leaves empty', () => {
    expect(normalizeCompanyNameForKey('Inc.')).toBe('inc.');
  });

  test('returns null for null or empty values', () => {
    expect(normalizeCompanyNameForKey(null)).toBeNull();
    expect(normalizeCompanyNameForKey('   ')).toBeNull();
  });
});
describe('normalizeUrlForStorage', () => {
  test('converts URLs to lowercase', () => {
    expect(normalizeUrlForStorage('HTTPS://GITHUB.COM/DEEMA'))
      .toBe('https://github.com/deema');
  });

  test('removes trailing slashes', () => {
    expect(normalizeUrlForStorage('https://github.com/deema/'))
      .toBe('https://github.com/deema');
  });

  test('removes multiple trailing slashes', () => {
    expect(normalizeUrlForStorage('https://github.com/deema///'))
      .toBe('https://github.com/deema');
  });

  test('preserves internal path and query parameters', () => {
    expect(normalizeUrlForStorage('https://github.com/deema/repo?tab=readme'))
      .toBe('https://github.com/deema/repo?tab=readme');
  });

  test('returns null for null or empty values', () => {
    expect(normalizeUrlForStorage(null)).toBeNull();
    expect(normalizeUrlForStorage('   ')).toBeNull();
  });

  test('throws when value is not a string or null', () => {
    expect(() => normalizeUrlForStorage(123)).toThrow(TypeError);
  });
});
// Helper to create extraction field wrappers.
const field = (value) => ({
  value,
  confidence: value === null ? null : 0.95,
  evidence: value === null ? null : 'Test evidence'
});

describe('buildDeduplicationKey', () => {
  test('generates the same key for identical normalized data', () => {
    const first = {
      company_name: field('Google Inc.'),
      job_title: field('Software Engineer'),
      start_date: field('2022-05')
    };

    const second = {
      company_name: field(' GOOGLE '),
      job_title: field('software   engineer'),
      start_date: field('2022-05')
    };

    expect(
      buildDeduplicationKey('work_experience', first)
    ).toBe(
      buildDeduplicationKey('work_experience', second)
    );
  });

  test('generates different keys when a key field changes', () => {
    const first = {
      company_name: field('Google'),
      job_title: field('Software Engineer'),
      start_date: field('2022')
    };

    const second = {
      company_name: field('Google'),
      job_title: field('Backend Engineer'),
      start_date: field('2022')
    };

    expect(
      buildDeduplicationKey('work_experience', first)
    ).not.toBe(
      buildDeduplicationKey('work_experience', second)
    );
  });

  test('treats null as an explicit key component', () => {
    const withoutDate = {
      company_name: field('Google'),
      job_title: field('Software Engineer'),
      start_date: field(null)
    };

    const withDate = {
      company_name: field('Google'),
      job_title: field('Software Engineer'),
      start_date: field('2022')
    };

    expect(
      buildDeduplicationKey('work_experience', withoutDate)
    ).not.toBe(
      buildDeduplicationKey('work_experience', withDate)
    );
  });

  test('ignores date precision in education keys', () => {
    const yearOnly = {
      institution_name: field('An-Najah University'),
      degree_level: field('Bachelor'),
      field_of_study: field('Computer Engineering'),
      start_date: field('2022')
    };

    const yearAndMonth = {
      institution_name: field('An-Najah University'),
      degree_level: field('Bachelor'),
      field_of_study: field('Computer Engineering'),
      start_date: field('2022-05')
    };

    expect(
      buildDeduplicationKey('education', yearOnly)
    ).toBe(
      buildDeduplicationKey('education', yearAndMonth)
    );
  });

  test('ignores dates when generating education keys', () => {
    const first = {
      institution_name: field('An-Najah University'),
      degree_level: field('Bachelor'),
      field_of_study: field('Computer Engineering'),
      start_date: field('2020')
    };

    const second = {
      institution_name: field('An-Najah University'),
      degree_level: field('Bachelor'),
      field_of_study: field('Computer Engineering'),
      start_date: field('2022')
    };

    expect(
      buildDeduplicationKey('education', first)
    ).toBe(
      buildDeduplicationKey('education', second)
    );
  });

  test('uses normalized URLs for link keys', () => {
    const first = {
      url: field('HTTPS://GITHUB.COM/DEEMA/')
    };

    const second = {
      url: field('https://github.com/deema')
    };

    expect(
      buildDeduplicationKey('links', first)
    ).toBe(
      buildDeduplicationKey('links', second)
    );
  });

  test('generates a 64-character hexadecimal SHA-256 key', () => {
    const fields = {
      language: field('English')
    };

    const key = buildDeduplicationKey('languages', fields);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  test('throws for unsupported item types', () => {
    expect(() => buildDeduplicationKey('skills', {}))
      .toThrow('Unsupported item type: skills');
  });
  test('distinguishes different date precision in work experience keys', () => {
  const yearOnly = {
    company_name: field('Google'),
    job_title: field('Software Engineer'),
    start_date: field('2022')
  };

  const yearAndMonth = {
    company_name: field('Google'),
    job_title: field('Software Engineer'),
    start_date: field('2022-05')
  };

  expect(
    buildDeduplicationKey('work_experience', yearOnly)
  ).not.toBe(
    buildDeduplicationKey('work_experience', yearAndMonth)
  );
});
test.each([
  {
    itemType: 'certifications',
    first: {
      name: field('AWS Certificate'),
      issuing_organization: field('Amazon'),
      issue_date: field('2024')
    },
    changed: {
      name: field('AWS Certificate'),
      issuing_organization: field('Google'),
      issue_date: field('2024')
    }
  },
  {
    itemType: 'projects',
    first: {
      name: field('Portfolio Website'),
      start_date: field('2024')
    },
    changed: {
      name: field('Portfolio Website'),
      start_date: field('2025')
    }
  },
  {
    itemType: 'awards',
    first: {
      name: field('Best Project'),
      issuer: field('University'),
      award_date: field('2024')
    },
    changed: {
      name: field('Best Project'),
      issuer: field('Company'),
      award_date: field('2024')
    }
  },
  {
    itemType: 'publications',
    first: {
      title: field('AI Research'),
      publisher: field('University'),
      publication_date: field('2024')
    },
    changed: {
      title: field('AI Research'),
      publisher: field('Journal'),
      publication_date: field('2024')
    }
  },
  {
    itemType: 'volunteering',
    first: {
      organization: field('Red Crescent'),
      role: field('Volunteer'),
      start_date: field('2023')
    },
    changed: {
      organization: field('Red Crescent'),
      role: field('Coordinator'),
      start_date: field('2023')
    }
  }
])(
  'generates different keys when a key field changes for $itemType',
  ({ itemType, first, changed }) => {
    expect(
      buildDeduplicationKey(itemType, first)
    ).not.toBe(
      buildDeduplicationKey(itemType, changed)
    );
  }
);
describe('mergeFieldValues', () => {
  const wrapper = (value, evidence = 'Evidence') => ({
    value,
    confidence: value === null ? null : 0.9,
    evidence: value === null ? null : evidence
  });

  test('keeps the first wrapper when values are equal after normalization', () => {
    const first = wrapper('Google', 'First evidence');
    const second = wrapper(' google ', 'Second evidence');

    const result = mergeFieldValues(first, second);

    expect(result).toEqual({
      status: 'resolved',
      wrapper: first
    });
  });

  test('keeps the non-null wrapper when the first value is null', () => {
    const second = wrapper('Google');

    expect(mergeFieldValues(wrapper(null), second)).toEqual({
      status: 'resolved',
      wrapper: second
    });
  });

  test('keeps the first wrapper when the second value is null', () => {
    const first = wrapper('Google');

    expect(mergeFieldValues(first, wrapper(null))).toEqual({
      status: 'resolved',
      wrapper: first
    });
  });

  test('returns the first wrapper when both values are null', () => {
    const first = wrapper(null);
    const second = wrapper(null);

    expect(mergeFieldValues(first, second)).toEqual({
      status: 'resolved',
      wrapper: first
    });
  });

  test('marks different non-null values as a conflict', () => {
    expect(
      mergeFieldValues(
        wrapper('Software Engineer'),
        wrapper('Developer')
      )
    ).toEqual({
      status: 'conflict',
      wrapper: null
    });
  });
  test('handles boolean values', () => {
  const first = wrapper(true);

  expect(
    mergeFieldValues(first, wrapper(true))
  ).toEqual({
    status: 'resolved',
    wrapper: first
  });
});

test('marks different boolean values as a conflict', () => {
  expect(
    mergeFieldValues(wrapper(true), wrapper(false))
  ).toEqual({
    status: 'conflict',
    wrapper: null
  });
});
});
describe('mergeDateValues', () => {
  const wrapper = (value, evidence = 'Date evidence') => ({
    value,
    confidence: value === null ? null : 0.9,
    evidence: value === null ? null : evidence
  });

  test('keeps the more precise year-month date', () => {
    const second = wrapper('2023-06');

    expect(
      mergeDateValues(wrapper('2023'), second).wrapper
    ).toBe(second);
  });

  test('keeps the more precise full date', () => {
    const second = wrapper('2023-06-15');

    expect(
      mergeDateValues(wrapper('2023-06'), second).wrapper
    ).toBe(second);
  });

  test('keeps the first wrapper when dates are equal', () => {
    const first = wrapper('2023-06');

    expect(
      mergeDateValues(first, wrapper('2023-06')).wrapper
    ).toBe(first);
  });

  test('keeps the more precise first date when order is reversed', () => {
    const first = wrapper('2023-06');

    expect(
      mergeDateValues(first, wrapper('2023')).wrapper
    ).toBe(first);
  });

  test('returns conflict for incompatible dates', () => {
    expect(
      mergeDateValues(wrapper('2023-05'), wrapper('2023-06'))
    ).toEqual({
      status: 'conflict',
      wrapper: null
    });
  });

  test('keeps the non-null date', () => {
    const second = wrapper('2023-06');

    expect(
      mergeDateValues(wrapper(null), second).wrapper
    ).toBe(second);
  });

  test('returns the first wrapper when both dates are null', () => {
    const first = wrapper(null);

    expect(
      mergeDateValues(first, wrapper(null)).wrapper
    ).toBe(first);
  });

});

describe('mergeDuplicateItems', () => {
  const createWrapper = (value, confidence = 0.9) => ({
    value,
    confidence: value === null ? null : confidence,
    evidence: value === null ? null : `Evidence for ${value}`
  });

  const createItem = (sourceIndex, fields) => ({
    sourceIndex,
    fields
  });

  test('should merge duplicate work experience records', () => {
    const first = createItem(0, {
      company_name: createWrapper('Google'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01'),
      description: createWrapper('Backend development')
    });

    const second = createItem(1, {
      company_name: createWrapper('Google'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01'),
      description: createWrapper('Backend development')
    });

    const result = mergeDuplicateItems(
      'work_experience',
      first,
      second
    );

    expect(result.sourceIndexes).toEqual([0, 1]);
    expect(result.fields.description).toEqual(
      first.fields.description
    );
    expect(result.reviewFields).toEqual({});
    expect(result.deduplicationKey).toBe(
      buildDeduplicationKey('work_experience', first.fields)
    );
  });

  test('should resolve company names with legal suffix differences', () => {
    const first = createItem(0, {
      company_name: createWrapper('Google'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01')
    });

    const second = createItem(1, {
      company_name: createWrapper('Google Inc.'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01')
    });

    const result = mergeDuplicateItems(
      'work_experience',
      first,
      second
    );

    expect(result.fields.company_name).toEqual(
      first.fields.company_name
    );
    expect(result.reviewFields).toEqual({});
  });

  test('should put conflicting non-key fields in reviewFields', () => {
    const first = createItem(0, {
      company_name: createWrapper('Google'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01'),
      description: createWrapper('Backend development')
    });

    const second = createItem(1, {
      company_name: createWrapper('Google'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01'),
      description: createWrapper('Frontend development')
    });

    const result = mergeDuplicateItems(
      'work_experience',
      first,
      second
    );

    expect(result.fields).not.toHaveProperty('description');
    expect(result.reviewFields.description.values).toEqual([
        {
            wrapper: first.fields.description,
            sourceIndex: 0
        },
        {
            wrapper: second.fields.description,
            sourceIndex: 1
        }
    ]);
  });

  test('should keep a non-null value when the other value is null', () => {
    const first = createItem(0, {
      institution_name: createWrapper('An-Najah National University'),
      degree_level: createWrapper('Bachelor'),
      field_of_study: createWrapper('Computer Engineering'),
      graduation_date: createWrapper(null)
    });

    const second = createItem(1, {
      institution_name: createWrapper('An-Najah National University'),
      degree_level: createWrapper('Bachelor'),
      field_of_study: createWrapper('Computer Engineering'),
      graduation_date: createWrapper('2024')
    });

    const result = mergeDuplicateItems('education', first, second);

    expect(result.fields.graduation_date).toEqual(
      second.fields.graduation_date
    );
    expect(result.reviewFields).toEqual({});
  });

  test('should keep the more precise date', () => {
    const first = createItem(0, {
      institution_name: createWrapper('An-Najah National University'),
      degree_level: createWrapper('Bachelor'),
      field_of_study: createWrapper('Computer Engineering'),
      graduation_date: createWrapper('2024')
    });

    const second = createItem(1, {
      institution_name: createWrapper('An-Najah National University'),
      degree_level: createWrapper('Bachelor'),
      field_of_study: createWrapper('Computer Engineering'),
      graduation_date: createWrapper('2024-06')
    });

    const result = mergeDuplicateItems('education', first, second);

    expect(result.fields.graduation_date).toEqual(
      second.fields.graduation_date
    );
    expect(result.reviewFields).toEqual({});
  });

  test('should put incompatible dates in reviewFields', () => {
    const first = createItem(0, {
      institution_name: createWrapper('An-Najah National University'),
      degree_level: createWrapper('Bachelor'),
      field_of_study: createWrapper('Computer Engineering'),
      graduation_date: createWrapper('2024-05')
    });

    const second = createItem(1, {
      institution_name: createWrapper('An-Najah National University'),
      degree_level: createWrapper('Bachelor'),
      field_of_study: createWrapper('Computer Engineering'),
      graduation_date: createWrapper('2024-08')
    });

    const result = mergeDuplicateItems('education', first, second);

    expect(result.reviewFields.graduation_date.values).toEqual([
       {
        wrapper: first.fields.graduation_date,
        sourceIndex: 0
       },
       {
        wrapper: second.fields.graduation_date,
        sourceIndex: 1
       }
    ]);
    expect(result.fields).not.toHaveProperty('graduation_date');
  });

  test('should merge URLs that differ only in casing and trailing slash', () => {
    const first = createItem(0, {
      url: createWrapper('https://github.com/deema/')
    });

    const second = createItem(1, {
      url: createWrapper('https://github.com/deema')
    });

    const result = mergeDuplicateItems('links', first, second);

    expect(result.fields.url).toEqual({
        ...first.fields.url,
        value: 'https://github.com/deema'
    });
    expect(result.reviewFields).toEqual({});
  });

  test('should throw when deduplication keys are different', () => {
    const first = createItem(0, {
      company_name: createWrapper('Google'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01')
    });

    const second = createItem(1, {
      company_name: createWrapper('Microsoft'),
      job_title: createWrapper('Software Engineer'),
      start_date: createWrapper('2022-01')
    });

    expect(() =>
      mergeDuplicateItems('work_experience', first, second)
    ).toThrow('Cannot merge items with different deduplication keys.');
  });

  test('should throw for invalid source indexes', () => {
    const first = createItem(-1, {
      language: createWrapper('English')
    });

    const second = createItem(1, {
      language: createWrapper('English')
    });

    expect(() =>
      mergeDuplicateItems('languages', first, second)
    ).toThrow('All items must have valid source indexes.');
  });

  test('should throw for unsupported item types', () => {
    expect(() =>
      mergeDuplicateItems('skills', createItem(0, {}), createItem(1, {}))
    ).toThrow('Unsupported item type: skills');
  });
  test('should merge three duplicate records and keep the most precise date', () => {
  const first = createItem(0, {
    institution_name: createWrapper('An-Najah University'),
    degree_level: createWrapper('Bachelor'),
    field_of_study: createWrapper('Computer Engineering'),
    graduation_date: createWrapper('2024')
  });

  const second = createItem(1, {
    institution_name: createWrapper('An-Najah University'),
    degree_level: createWrapper('Bachelor'),
    field_of_study: createWrapper('Computer Engineering'),
    graduation_date: createWrapper('2024-06')
  });

  const third = createItem(2, {
    institution_name: createWrapper('An-Najah University'),
    degree_level: createWrapper('Bachelor'),
    field_of_study: createWrapper('Computer Engineering'),
    graduation_date: createWrapper('2024-06-15')
  });

  const result = mergeDuplicateItems(
    'education',
    first,
    second,
    third
  );

  expect(result.sourceIndexes).toEqual([0, 1, 2]);
  expect(result.fields.graduation_date).toEqual(
    third.fields.graduation_date
  );
  expect(result.fieldSources.graduation_date).toBe(2);
  expect(result.reviewFields).toEqual({});
});
test('should select the earliest source regardless of argument order', () => {
  const earlier = createItem(0, {
    institution_name: createWrapper('An-Najah University'),
    degree_level: createWrapper('Bachelor'),
    field_of_study: createWrapper('Computer Engineering'),
    description: createWrapper('Earlier description')
  });

  const later = createItem(2, {
    institution_name: createWrapper('An-Najah University'),
    degree_level: createWrapper('Bachelor'),
    field_of_study: createWrapper('Computer Engineering'),
    description: createWrapper('Earlier description')
  });

  const result = mergeDuplicateItems(
    'education',
    later,
    earlier
  );

  expect(result.fields.description).toEqual(
    earlier.fields.description
  );
  expect(result.fieldSources.description).toBe(0);
  expect(result.sourceIndexes).toEqual([0, 2]);
});
test('should throw when source indexes are duplicated', () => {
  const first = createItem(0, {
    language: createWrapper('English')
  });

  const second = createItem(0, {
    language: createWrapper('English')
  });

  expect(() =>
    mergeDuplicateItems('languages', first, second)
  ).toThrow('Source indexes must be unique.');
});
});

});