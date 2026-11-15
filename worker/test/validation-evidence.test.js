const {
  normalizeForMatch,
  buildHaystack,
  findMissingEvidence
} = require('../src/validation/evidence');

describe('normalizeForMatch', () => {
  test.each([
    ['John Doe', 'john doe'],
    ['  Alice   Smith  ', 'alice smith'],
    ['Line\nBreak\tand\r\nTabs', 'line break and tabs'],
    ['\uFB01nancial', 'financial'], // NFKC ligature fi
    ['', ''],
    [null, ''],
    [undefined, ''],
    [123, '']
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeForMatch(input)).toBe(expected);
  });
});

describe('buildHaystack', () => {
  test('joins normalized text with link labels and URLs using newlines', () => {
    const text = 'Software Engineer at Acme Corp';
    const links = [
      { label: 'GitHub Profile', url: 'https://github.com/user' },
      { label: '', url: 'https://portfolio.me' }
    ];

    const haystack = buildHaystack(text, links);
    expect(haystack).toBe(
      'software engineer at acme corp\ngithub profile\nhttps://github.com/user\nhttps://portfolio.me'
    );
  });

  test('handles empty text and links gracefully', () => {
    expect(buildHaystack('', [])).toBe('');
    expect(buildHaystack(null, null)).toBe('');
  });
});

describe('findMissingEvidence', () => {
  const v = (value, evidence) => ({
    value,
    confidence: 0.9,
    evidence
  });
  const empty = () => ({ value: null, confidence: null, evidence: null });

  test('passes when evidence is found with different case and extra spaces', () => {
    const haystack = buildHaystack('Acme   Corporation Software Engineer', []);
    const extraction = {
      meta: { document_language: 'en', extraction_warnings: [] },
      candidate: {
        first_name: empty()
      },
      work_experience: [
        {
          company_name: v('Acme Corporation', 'ACME  CORPORATION')
        }
      ]
    };

    const failed = findMissingEvidence(extraction, haystack);
    expect(failed).toEqual([]);
  });

  test('passes when evidence is found only in a link url', () => {
    const haystack = buildHaystack('Jane Doe CV', [
      { label: 'GitHub', url: 'https://github.com/janedoe' }
    ]);
    const extraction = {
      meta: { document_language: 'en', extraction_warnings: [] },
      candidate: {
        first_name: v('Jane', 'Jane')
      },
      links: [
        {
          url: v('https://github.com/janedoe', 'https://github.com/janedoe')
        }
      ]
    };

    const failed = findMissingEvidence(extraction, haystack);
    expect(failed).toEqual([]);
  });

  test('reports evidence_not_found for candidate field when evidence is missing', () => {
    const haystack = buildHaystack('Resume text without name', []);
    const extraction = {
      meta: { document_language: 'en', extraction_warnings: [] },
      candidate: {
        first_name: v('Jane', 'Jane Doe')
      }
    };

    const failed = findMissingEvidence(extraction, haystack);
    expect(failed).toEqual([
      {
        section: 'candidate',
        index: null,
        field: 'first_name',
        reason: 'evidence_not_found'
      }
    ]);
  });

  test('reports evidence_not_found for list section field when evidence is missing', () => {
    const haystack = buildHaystack('Software developer at XYZ', []);
    const extraction = {
      meta: { document_language: 'en', extraction_warnings: [] },
      candidate: {},
      work_experience: [
        {
          job_title: v('CTO', 'Chief Technology Officer')
        }
      ]
    };

    const failed = findMissingEvidence(extraction, haystack);
    expect(failed).toEqual([
      {
        section: 'work_experience',
        index: 0,
        field: 'job_title',
        reason: 'evidence_not_found'
      }
    ]);
  });

  test('skips null value wrappers and meta section', () => {
    const haystack = buildHaystack('Plain text', []);
    const extraction = {
      meta: {
        document_language: 'ar',
        extraction_warnings: ['some warning']
      },
      candidate: {
        headline: empty(),
        summary: empty()
      },
      skills: [
        {
          proficiency_level: empty()
        }
      ]
    };

    const failed = findMissingEvidence(extraction, haystack);
    expect(failed).toEqual([]);
  });
});
