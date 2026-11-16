const { generateMarkdownReport } = require('../lib/report');

describe('report: markdown report generation', () => {
  test('generates formatted markdown with all required sections', () => {
    const sampleData = {
      timestamp: '2026-11-16T12:00:00.000Z',
      entryResults: [
        {
          id: '01-standard-cv-pdf',
          file: 'files/01-standard-cv.pdf',
          sourceType: 'cv',
          expectedStatus: 'stored',
          actualStatus: 'stored',
          jobStatus: 'completed'
        },
        {
          id: '11-corrupted-pdf',
          file: 'files/11-corrupted.pdf',
          sourceType: 'cv',
          expectedStatus: 'rejected',
          actualStatus: 'rejected',
          rejectReason: 'The file is corrupted, please upload a valid file'
        }
      ],
      overallAccuracy: { compared: 20, matched: 18 },
      sectionAccuracy: {
        candidate: { compared: 5, matched: 5 },
        work_experience: { compared: 15, matched: 13 }
      },
      dateAccuracy: { compared: 4, matched: 4 },
      experienceResults: [
        { id: '03-cv-v2-docx', expected: 92, actual: 92, matches: true }
      ],
      conflictsSplit: { automaticCount: 4, reviewCount: 2 },
      plantedResults: [
        {
          case: 'B1',
          section: 'work_experience',
          field: 'end_date',
          expected: 'B1',
          actual: 'B1',
          available: true
        },
        {
          case: 'C1',
          section: 'work_experience',
          field: 'is_current',
          expected: 'C1',
          actual: null,
          available: false,
          status:
            'not available yet: resolution rule step not wired yet (US-15/US-16/US-17/US-21)'
        }
      ]
    };

    const report = generateMarkdownReport(sampleData);

    expect(report).toContain('# Golden Dataset Accuracy Report');
    expect(report).toContain('## 1. Executive Summary');
    expect(report).toContain('## 2. Per-Entry Breakdown');
    expect(report).toContain('## 3. Field Accuracy');
    expect(report).toContain('## 4. Date Exact-Match Rate');
    expect(report).toContain('## 5. Experience Months Verification');
    expect(report).toContain('## 6. Automatic Resolution vs Human Review');
    expect(report).toContain('## 7. Planted Cases & Decisions');
    expect(report).toContain('## 8. Expected Failures');

    // Field accuracy rates
    expect(report).toContain('18 / 20 (90%)');
    expect(report).toContain('4 / 4 (100%)');

    // Experience months match
    expect(report).toContain('92 | 92 | YES');

    // Automatic vs review
    expect(report).toContain('4 (66.67%)');
    expect(report).toContain('2 (33.33%)');

    // Planted cases
    expect(report).toContain('| B1 | work_experience | end_date | B1 | B1 |');
    expect(report).toContain('not available yet');
  });
});
