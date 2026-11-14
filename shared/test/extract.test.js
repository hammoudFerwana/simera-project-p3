const fs = require('fs');
const path = require('path');
const { extract } = require('../src/extraction/extract');
const { TextExtractionError } = require('../src/extraction/text-extractor');
const { MIME_TYPES } = require('../src/upload/file-types');

const FIXTURES = path.join(__dirname, 'fixtures');

function read(name) {
  return fs.readFileSync(path.join(FIXTURES, name));
}

/** Every expected text is in the output, in this order. */
function expectInOrder(text, parts) {
  let from = 0;
  for (const part of parts) {
    const index = text.indexOf(part, from);
    expect({ part, found: index >= 0 }).toEqual({ part, found: true });
    from = index + part.length;
  }
}

const ALL_FILES = [
  ['cv-links.pdf', MIME_TYPES.pdf],
  ['cv-two-columns.pdf', MIME_TYPES.pdf],
  ['cv-dates-right.pdf', MIME_TYPES.pdf],
  ['cv-ratings.pdf', MIME_TYPES.pdf],
  ['cv-wrapped-link.pdf', MIME_TYPES.pdf],
  ['cv-links.docx', MIME_TYPES.docx],
  ['linkedin-links.md', MIME_TYPES.markdown]
];

describe('extract: PDF', () => {
  it('returns the full text of a standard PDF in reading order', async () => {
    const { text, isEmpty } = await extract(
      read('cv-links.pdf'),
      MIME_TYPES.pdf
    );
    expect(isEmpty).toBe(false);
    expectInOrder(text, [
      'Jane Doe - Software Engineer',
      'My Portfolio',
      'LinkedIn profile',
      'Skills: Node.js, PostgreSQL, React'
    ]);
  });

  it('keeps a date on the same line as its job', async () => {
    const { text } = await extract(read('cv-dates-right.pdf'), MIME_TYPES.pdf);
    expect(text).toContain('Acme Corp - Backend Developer 2019 - 2024');
    expect(text).toContain('Delta - Junior Developer 2014 - 2015');
  });

  it('extracts the real URL behind a label', async () => {
    const { links } = await extract(read('cv-links.pdf'), MIME_TYPES.pdf);
    expect(links).toEqual([
      { label: 'My Portfolio', url: 'https://janedoe.dev/portfolio' },
      { label: 'LinkedIn profile', url: 'https://www.linkedin.com/in/janedoe' }
    ]);
  });

  it('gives one link for an address on two lines, with the whole label', async () => {
    const { links } = await extract(
      read('cv-wrapped-link.pdf'),
      MIME_TYPES.pdf
    );
    expect(links).toContainEqual({
      label: 'jane.doe@example.com',
      url: 'mailto:jane.doe@example.com'
    });
    expect(links).toContainEqual({
      label: 'My Website',
      url: 'https://janedoe.dev/'
    });
  });

  it('drops a mailto link that holds no address', async () => {
    const { links } = await extract(
      read('cv-wrapped-link.pdf'),
      MIME_TYPES.pdf
    );
    expect(links).toHaveLength(2);
    expect(links.some((link) => link.url.includes('mail.google.com'))).toBe(
      false
    );
  });

  it('keeps going and extracts the rest of the text when there are ratings', async () => {
    const { text, isEmpty } = await extract(
      read('cv-ratings.pdf'),
      MIME_TYPES.pdf
    );
    expect(isEmpty).toBe(false);
    expectInOrder(text, [
      'Jane Doe - Software Engineer',
      'Experience: Acme Corp, Backend Developer, 2019-05 to present',
      'Node.js',
      'PostgreSQL',
      'React',
      'English 90%'
    ]);
  });

  it('keeps all the text of a two-column PDF (the columns are not separated)', async () => {
    const { text } = await extract(read('cv-two-columns.pdf'), MIME_TYPES.pdf);
    for (const part of [
      'CONTACT',
      'jane.doe@example.com',
      'SKILLS',
      'Node.js',
      'PostgreSQL',
      'React',
      'Jane Doe - Software Engineer',
      'EXPERIENCE',
      'Acme Corp, Backend Developer, 2019-05 to present',
      'Built the queue and the worker',
      'EDUCATION',
      'BSc Computer Science, 2018'
    ]) {
      expect(text).toContain(part);
    }
  });

  it('reports empty text for a PDF with no text (scan)', async () => {
    const result = await extract(read('scanned-empty.pdf'), MIME_TYPES.pdf);
    expect(result.isEmpty).toBe(true);
    expect(result.text).toBe('');
    expect(result.links).toEqual([]);
  });

  it('throws TextExtractionError for a corrupted PDF', async () => {
    await expect(
      extract(read('corrupted.pdf'), MIME_TYPES.pdf)
    ).rejects.toBeInstanceOf(TextExtractionError);
  });
});

describe('extract: DOCX', () => {
  it('extracts text and links', async () => {
    const { text, links } = await extract(
      read('cv-links.docx'),
      MIME_TYPES.docx
    );
    expectInOrder(text, [
      'Jane Doe - Software Engineer',
      'My Portfolio',
      'Experience: Acme Corp, Backend Developer, 2019-05 to present',
      'Skills: Node.js, PostgreSQL, React'
    ]);
    expect(links).toEqual([
      { label: 'My Portfolio', url: 'https://janedoe.dev/portfolio' },
      { label: 'LinkedIn profile', url: 'https://www.linkedin.com/in/janedoe' }
    ]);
  });

  it('throws TextExtractionError for a file that is not a DOCX', async () => {
    await expect(
      extract(Buffer.from('not a zip'), MIME_TYPES.docx)
    ).rejects.toBeInstanceOf(TextExtractionError);
  });
});

describe('extract: Markdown', () => {
  it('keeps the sections and the links, and leaves HTML as plain text', async () => {
    const { text, links } = await extract(
      read('linkedin-links.md'),
      MIME_TYPES.markdown
    );
    expectInOrder(text, ['# Jane Doe', '## Experience', '## Skills']);
    // the script tag is only text: nothing is rendered or run
    expect(text).toContain('<script>alert("not executed")</script>');
    expect(links).toEqual([
      { label: 'My Portfolio', url: 'https://janedoe.dev/portfolio' }
    ]);
  });

  it('finds bare addresses and drops unsafe ones and images', async () => {
    const md = [
      'See https://example.com/a, and [bad](javascript:alert(1)) and ![pic](https://example.com/p.png)',
      '<mailto:jane@example.com>'
    ].join('\n');
    const { links } = await extract(
      Buffer.from(md, 'utf8'),
      MIME_TYPES.markdown
    );
    const urls = links.map((link) => link.url);
    expect(urls).toContain('https://example.com/a');
    expect(urls).toContain('mailto:jane@example.com');
    expect(urls.some((url) => url.startsWith('javascript:'))).toBe(false);
    expect(urls).not.toContain('https://example.com/p.png');
  });

  it('throws TextExtractionError for bytes that are not UTF-8 text', async () => {
    await expect(
      extract(Buffer.from([0xff, 0xfe, 0x00, 0x00]), MIME_TYPES.markdown)
    ).rejects.toBeInstanceOf(TextExtractionError);
  });
});

describe('extract: general', () => {
  it.each(ALL_FILES)(
    'gives identical output for %s twice',
    async (name, mimeType) => {
      const first = await extract(read(name), mimeType);
      const second = await extract(read(name), mimeType);
      expect(second).toEqual(first);
    }
  );

  it('uses the threshold to decide what is almost empty', async () => {
    const buffer = read('cv-links.pdf');
    expect((await extract(buffer, MIME_TYPES.pdf)).isEmpty).toBe(false);
    expect(
      (await extract(buffer, MIME_TYPES.pdf, { minTextChars: 10000 })).isEmpty
    ).toBe(true);
  });

  it('rejects an unsupported MIME type', async () => {
    await expect(extract(Buffer.from('x'), 'image/png')).rejects.toBeInstanceOf(
      TextExtractionError
    );
  });
});
