const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel
} = require('docx');

const OUT = path.resolve(__dirname, '../test/fixtures');
fs.mkdirSync(OUT, { recursive: true });

function savePdf(name, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(path.join(OUT, name));
    doc.pipe(stream);
    draw(doc);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// Two columns. Not supported: the text is kept, the columns are mixed line by line.
function twoColumns(doc) {
  const sidebar = [
    'CONTACT',
    'jane.doe@example.com',
    'SKILLS',
    'Node.js',
    'PostgreSQL',
    'React'
  ];
  const main = [
    'Jane Doe - Software Engineer',
    'EXPERIENCE',
    'Acme Corp, Backend Developer, 2019-05 to present',
    'Built the queue and the worker',
    'EDUCATION',
    'BSc Computer Science, 2018'
  ];
  doc.fontSize(11);
  sidebar.forEach((line, i) => doc.text(line, 50, 60 + i * 24, { width: 150 }));
  main.forEach((line, i) => doc.text(line, 240, 60 + i * 24, { width: 300 }));
}

function withLink(doc) {
  doc.fontSize(12);
  doc.text('Jane Doe - Software Engineer', 50, 60);
  doc.text('My Portfolio', 50, 90, {
    link: 'https://janedoe.dev/portfolio',
    underline: true
  });
  doc.text('LinkedIn profile', 50, 120, {
    link: 'https://www.linkedin.com/in/janedoe',
    underline: true
  });
  doc.text('Skills: Node.js, PostgreSQL, React', 50, 150);
}

function withRatings(doc) {
  doc.fontSize(12);
  doc.text('Jane Doe - Software Engineer', 50, 60);
  doc.text(
    'Experience: Acme Corp, Backend Developer, 2019-05 to present',
    50,
    90
  );
  [
    ['Node.js', 4],
    ['PostgreSQL', 5],
    ['React', 3]
  ].forEach(([skill, stars], i) => {
    const y = 130 + i * 24;
    doc.text(skill, 50, y);
    for (let s = 0; s < 5; s += 1) {
      doc.circle(160 + s * 16, y + 6, 5);
      if (s < stars) doc.fillAndStroke('black', 'black');
      else doc.stroke('black');
    }
    doc.fillColor('black');
  });
  doc.text('English 90%', 50, 220);
}

// One column with the dates aligned to the right: a table, not two columns.
function datesOnTheRight(doc) {
  doc.fontSize(10);
  const rows = [
    ['Acme Corp - Backend Developer', '2019 - 2024'],
    ['Beta Ltd - Developer', '2016 - 2019'],
    ['Gamma Inc - Intern', '2015 - 2016'],
    ['Delta - Junior Developer', '2014 - 2015']
  ];
  doc.text('EXPERIENCE', 50, 60);
  rows.forEach(([left, right], i) => {
    doc.text(left, 50, 90 + i * 20, { width: 300 });
    doc.text(right, 450, 90 + i * 20, { width: 100, align: 'right' });
  });
}

// A page with only a drawing: no text, like a scan.
function noText(doc) {
  doc.rect(50, 50, 200, 200).stroke();
}

// An email address that wraps onto two lines. The link rectangles are taller
// than a line, so each one also covers part of the next line.
function wrappedLink(doc) {
  doc.fontSize(10);
  doc.text('Jane Doe', 50, 60, { lineBreak: false });
  doc.text('jane.doe@exam', 50, 100, { lineBreak: false });
  doc.text('ple.com', 50, 114, { lineBreak: false });
  doc.text('My Website', 50, 128, { lineBreak: false });
  doc.text('Contact page', 50, 150, { lineBreak: false });
  doc.link(50, 98, 80, 26, 'mailto:jane.doe@example.com');
  doc.link(50, 112, 80, 26, 'mailto:jane.doe@example.com');
  doc.link(50, 126, 80, 12, 'https://janedoe.dev/');
  // a mailto link that points to a web page, not to an address
  doc.link(50, 148, 80, 12, 'mailto:https:/mail.google.com/');
}

async function makeDocx() {
  const link = (text, url) =>
    new ExternalHyperlink({
      link: url,
      children: [new TextRun({ text, style: 'Hyperlink' })]
    });
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Jane Doe - Software Engineer',
            heading: HeadingLevel.HEADING_1
          }),
          new Paragraph({
            children: [link('My Portfolio', 'https://janedoe.dev/portfolio')]
          }),
          new Paragraph({
            children: [
              link('LinkedIn profile', 'https://www.linkedin.com/in/janedoe')
            ]
          }),
          new Paragraph(
            'Experience: Acme Corp, Backend Developer, 2019-05 to present'
          ),
          new Paragraph('Skills: Node.js, PostgreSQL, React')
        ]
      }
    ]
  });
  fs.writeFileSync(path.join(OUT, 'cv-links.docx'), await Packer.toBuffer(doc));
}

function makeMarkdown() {
  const text = [
    '# Jane Doe',
    '',
    '**Software Engineer** at Acme Corp',
    '',
    '[My Portfolio](https://janedoe.dev/portfolio)',
    '',
    '## Experience',
    '',
    '- Backend Developer, Acme Corp (May 2019 - Present)',
    '',
    '## Skills',
    '',
    'Node.js, PostgreSQL, React',
    '',
    '<script>alert("not executed")</script>',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'linkedin-links.md'), text, 'utf8');
}

async function main() {
  await savePdf('cv-two-columns.pdf', twoColumns);
  await savePdf('cv-links.pdf', withLink);
  await savePdf('cv-ratings.pdf', withRatings);
  await savePdf('cv-dates-right.pdf', datesOnTheRight);
  await savePdf('cv-wrapped-link.pdf', wrappedLink);
  await savePdf('scanned-empty.pdf', noText);
  fs.writeFileSync(
    path.join(OUT, 'corrupted.pdf'),
    '%PDF-1.4 this is not a real pdf'
  );
  await makeDocx();
  makeMarkdown();
  console.log('fixtures written to', OUT);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
