const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');

const OUT = path.resolve(__dirname, 'files');

function ensureOutputDir() {
  fs.mkdirSync(OUT, { recursive: true });
}

function savePdf(filename, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(path.join(OUT, filename));
    doc.pipe(stream);
    draw(doc);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function makeFiles() {
  ensureOutputDir();

  // 01: Standard CV PDF (Person 1: Lina Haddad)
  await savePdf('01-standard-cv.pdf', (doc) => {
    doc.fontSize(20).text('Lina Haddad', { bold: true });
    doc.fontSize(12).text('Backend Developer');
    doc
      .fontSize(10)
      .text(
        'Email: lina.haddad@golden.example | Phone: +962791112233 | City: Amman, Jordan'
      );
    doc.moveDown();

    doc.fontSize(14).text('Summary');
    doc
      .fontSize(10)
      .text(
        'Experienced Backend Developer with expertise in building scalable APIs and distributed systems.'
      );
    doc.moveDown();

    doc.fontSize(14).text('Work Experience');
    doc.fontSize(11).text('Nova Labs - Backend Developer');
    doc.fontSize(10).text('March 2021 to Present | Amman, Jordan');
    doc.text(
      'Designed and maintained high-throughput REST APIs using Node.js and PostgreSQL.'
    );
    doc.moveDown(0.5);

    doc.fontSize(11).text('Apex Solutions - Junior Backend Developer');
    doc.fontSize(10).text('January 2018 to December 2020 | Amman, Jordan');
    doc.text('Developed backend microservices and optimized SQL queries.');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Byte Systems - Software Engineering Intern');
    doc.fontSize(10).text('June 2016 to December 2017 | Amman, Jordan');
    doc.text(
      'Assisted senior engineers with internal tools and automated unit tests.'
    );
    doc.moveDown();

    doc.fontSize(14).text('Education');
    doc.fontSize(11).text('University of Jordan');
    doc
      .fontSize(10)
      .text(
        'Bachelor of Science in Computer Science | September 2014 to June 2018'
      );
    doc.moveDown();

    doc.fontSize(14).text('Skills');
    doc
      .fontSize(10)
      .text('Node.js, PostgreSQL, Docker, TypeScript, Redis, Zorbex');
    doc.moveDown();

    doc.fontSize(14).text('Languages');
    doc.fontSize(10).text('English (Advanced), Arabic (Native)');
  });

  // 02: LinkedIn MD (Person 1: Lina Haddad)
  const md02 = [
    '# Lina Haddad',
    '',
    '**Senior Backend Developer**',
    '',
    'Contact: lina.haddad@golden.example',
    'Location: Amman, Jordan',
    '',
    '## About',
    '',
    'Experienced Backend Developer with expertise in building scalable APIs and distributed systems.',
    '',
    '## Experience',
    '',
    '### Nova Labs',
    '',
    'Senior Backend Developer',
    'March 2021 - Present',
    '',
    '### Apex Solutions',
    '',
    'Junior Backend Developer',
    '2018 - December 2020',
    '',
    '## Education',
    '',
    '### University of Jordan',
    '',
    'Bachelor of Science, Computer Science',
    '2014 - 2018',
    '',
    '## Skills',
    '',
    'Node.js, PostgreSQL, Docker, TypeScript, Redis',
    '',
    '## Languages',
    '',
    '- Arabic (Native)',
    '- English (Advanced)\n'
  ].join('\n');
  fs.writeFileSync(path.join(OUT, '02-linkedin.md'), md02, 'utf8');

  // 03: Standard CV DOCX v2 (Person 1: Lina Haddad)
  const doc03 = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Lina Haddad',
            heading: HeadingLevel.HEADING_1
          }),
          new Paragraph('Senior Backend Developer'),
          new Paragraph(
            'Email: lina.haddad@golden.example | Phone: +971501234567 | City: Dubai, UAE'
          ),
          new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }),
          new Paragraph(
            'Experienced Backend Developer with expertise in building scalable APIs and distributed systems.'
          ),
          new Paragraph({
            text: 'Work Experience',
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph('Nova Labs - Senior Backend Developer'),
          new Paragraph('March 2021 to March 2024 | Dubai, UAE'),
          new Paragraph(
            'Designed and maintained high-throughput REST APIs using Node.js and PostgreSQL.'
          ),
          new Paragraph('Apex Solutions - Junior Backend Developer'),
          new Paragraph('January 2018 to December 2020 | Amman, Jordan'),
          new Paragraph(
            'Developed backend microservices and optimized SQL queries.'
          ),
          new Paragraph('Byte Systems - Software Engineering Intern'),
          new Paragraph('June 2016 to December 2017 | Amman, Jordan'),
          new Paragraph(
            'Assisted senior engineers with internal tools and automated unit tests.'
          ),
          new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('University of Jordan'),
          new Paragraph(
            'Bachelor of Science in Computer Science | September 2014 to June 2018'
          ),
          new Paragraph({ text: 'Skills', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Node.js, PostgreSQL, Docker, TypeScript, Redis'),
          new Paragraph({ text: 'Languages', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('English (Advanced), Arabic (Native)')
        ]
      }
    ]
  });
  fs.writeFileSync(
    path.join(OUT, '03-cv-v2.docx'),
    await Packer.toBuffer(doc03)
  );

  // 04: CV PDF v3 (Person 1: Lina Haddad - C1: ended job written as present)
  await savePdf('04-cv-v3.pdf', (doc) => {
    doc.fontSize(20).text('Lina Haddad', { bold: true });
    doc.fontSize(12).text('Senior Backend Developer');
    doc
      .fontSize(10)
      .text('Email: lina.haddad@golden.example | City: Dubai, UAE');
    doc.moveDown();

    doc.fontSize(14).text('Work Experience');
    doc.fontSize(11).text('Nova Labs - Senior Backend Developer');
    doc.fontSize(10).text('March 2021 to March 2024 | Dubai, UAE');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Apex Solutions - Junior Backend Developer');
    doc.fontSize(10).text('January 2018 to Present | Amman, Jordan');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Byte Systems - Software Engineering Intern');
    doc.fontSize(10).text('June 2016 to December 2017 | Amman, Jordan');
    doc.moveDown();

    doc.fontSize(14).text('Education');
    doc.fontSize(11).text('University of Jordan');
    doc
      .fontSize(10)
      .text(
        'Bachelor of Science in Computer Science | September 2014 to June 2018'
      );
    doc.moveDown();

    doc.fontSize(14).text('Skills');
    doc.fontSize(10).text('Node.js, PostgreSQL, Docker, TypeScript, Redis');
  });

  // 05: CV PDF v4 (Person 1: Lina Haddad - C2: education start date changed by 3 months)
  await savePdf('05-cv-v4.pdf', (doc) => {
    doc.fontSize(20).text('Lina Haddad', { bold: true });
    doc.fontSize(12).text('Senior Backend Developer');
    doc
      .fontSize(10)
      .text('Email: lina.haddad@golden.example | City: Dubai, UAE');
    doc.moveDown();

    doc.fontSize(14).text('Work Experience');
    doc.fontSize(11).text('Nova Labs - Senior Backend Developer');
    doc.fontSize(10).text('March 2021 to March 2024 | Dubai, UAE');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Apex Solutions - Junior Backend Developer');
    doc.fontSize(10).text('January 2018 to December 2020 | Amman, Jordan');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Byte Systems - Software Engineering Intern');
    doc.fontSize(10).text('June 2016 to December 2017 | Amman, Jordan');
    doc.moveDown();

    doc.fontSize(14).text('Education');
    doc.fontSize(11).text('University of Jordan');
    doc
      .fontSize(10)
      .text('Bachelor of Science in Computer Science | June 2014 to June 2018');
    doc.moveDown();

    doc.fontSize(14).text('Skills');
    doc.fontSize(10).text('Node.js, PostgreSQL, Docker, TypeScript, Redis');
  });

  // 06: CV PDF v5 (Person 1: Lina Haddad - C3: same company Nova Labs with another title and overlapping period)
  await savePdf('06-cv-v5.pdf', (doc) => {
    doc.fontSize(20).text('Lina Haddad', { bold: true });
    doc.fontSize(12).text('Senior Backend Developer');
    doc
      .fontSize(10)
      .text('Email: lina.haddad@golden.example | City: Dubai, UAE');
    doc.moveDown();

    doc.fontSize(14).text('Work Experience');
    doc.fontSize(11).text('Nova Labs - Lead Systems Architect');
    doc.fontSize(10).text('January 2022 to December 2023 | Dubai, UAE');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Nova Labs - Senior Backend Developer');
    doc.fontSize(10).text('March 2021 to March 2024 | Dubai, UAE');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Apex Solutions - Junior Backend Developer');
    doc.fontSize(10).text('January 2018 to December 2020 | Amman, Jordan');
    doc.moveDown();

    doc.fontSize(14).text('Education');
    doc.fontSize(11).text('University of Jordan');
    doc
      .fontSize(10)
      .text(
        'Bachelor of Science in Computer Science | September 2014 to June 2018'
      );
    doc.moveDown();

    doc.fontSize(14).text('Skills');
    doc.fontSize(10).text('Node.js, PostgreSQL, Docker, TypeScript, Redis');
  });

  // 07: CV PDF v6 (Person 1: Lina Haddad - C6: vague headline)
  await savePdf('07-cv-v6.pdf', (doc) => {
    doc.fontSize(20).text('Lina Haddad', { bold: true });
    doc
      .fontSize(12)
      .text(
        'Experienced in various software engineering tasks across multiple platforms'
      );
    doc
      .fontSize(10)
      .text('Email: lina.haddad@golden.example | City: Dubai, UAE');
    doc.moveDown();

    doc.fontSize(14).text('Work Experience');
    doc.fontSize(11).text('Nova Labs - Senior Backend Developer');
    doc.fontSize(10).text('March 2021 to March 2024 | Dubai, UAE');
    doc.moveDown(0.5);

    doc.fontSize(11).text('Apex Solutions - Junior Backend Developer');
    doc.fontSize(10).text('January 2018 to December 2020 | Amman, Jordan');
    doc.moveDown();

    doc.fontSize(14).text('Education');
    doc.fontSize(11).text('University of Jordan');
    doc
      .fontSize(10)
      .text(
        'Bachelor of Science in Computer Science | September 2014 to June 2018'
      );
    doc.moveDown();

    doc.fontSize(14).text('Skills');
    doc.fontSize(10).text('Node.js, PostgreSQL, Docker, TypeScript, Redis');
  });

  // 08: Standard CV DOCX (Person 2: Omar Saleh)
  const doc08 = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Omar Saleh',
            heading: HeadingLevel.HEADING_1
          }),
          new Paragraph('Full Stack Engineer'),
          new Paragraph(
            'Email: omar.saleh@golden.example | Phone: +201011223344 | City: Cairo, Egypt'
          ),
          new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }),
          new Paragraph(
            'Full stack software engineer with solid background in Python, Django, and React.'
          ),
          new Paragraph({
            text: 'Work Experience',
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph('Pyramid Tech - Software Engineer'),
          new Paragraph('May 2020 to Present | Cairo, Egypt'),
          new Paragraph(
            'Built full stack web features with Django REST framework and React.'
          ),
          new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Cairo University'),
          new Paragraph(
            'Bachelor of Science in Computer Engineering | September 2016 to June 2020'
          ),
          new Paragraph({ text: 'Skills', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Python, Django, React, PostgreSQL'),
          new Paragraph({ text: 'Languages', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Arabic (Native), English (Advanced)')
        ]
      }
    ]
  });
  fs.writeFileSync(
    path.join(OUT, '08-standard-cv.docx'),
    await Packer.toBuffer(doc08)
  );

  // 09: LinkedIn MD (Person 2: Omar Saleh - A1: adds a project)
  const md09 = [
    '# Omar Saleh',
    '',
    '**Full Stack Engineer**',
    '',
    'Contact: omar.saleh@golden.example',
    'Location: Cairo, Egypt',
    '',
    '## About',
    '',
    'Full stack software engineer with solid background in Python, Django, and React.',
    '',
    '## Experience',
    '',
    '### Pyramid Tech',
    '',
    'Software Engineer',
    'May 2020 - Present',
    '',
    '## Education',
    '',
    '### Cairo University',
    '',
    'Bachelor of Science, Computer Engineering',
    '2016 - 2020',
    '',
    '## Projects',
    '',
    '### E-Commerce Gateway',
    '',
    'High-performance payment gateway service with React dashboard and Django REST API.',
    '',
    '## Skills',
    '',
    'Python, Django, React, PostgreSQL',
    '',
    '## Languages',
    '',
    '- Arabic (Native)',
    '- English (Advanced)\n'
  ].join('\n');
  fs.writeFileSync(path.join(OUT, '09-linkedin.md'), md09, 'utf8');

  // 10: CV PDF with wrong email (US-07 mismatch)
  await savePdf('10-cv-wrong-email.pdf', (doc) => {
    doc.fontSize(20).text('Tariq Nadim', { bold: true });
    doc.fontSize(12).text('Cloud Architect');
    doc
      .fontSize(10)
      .text(
        'Email: tariq.nadim@golden.example | Phone: +201099887766 | City: Cairo, Egypt'
      );
    doc.moveDown();

    doc.fontSize(14).text('Work Experience');
    doc.fontSize(11).text('Cloud Innovations - Cloud Engineer');
    doc.fontSize(10).text('January 2019 to Present | Cairo, Egypt');
    doc.moveDown();

    doc.fontSize(14).text('Education');
    doc.fontSize(11).text('Cairo University');
    doc
      .fontSize(10)
      .text(
        'Bachelor of Science in Computer Engineering | September 2015 to June 2019'
      );
    doc.moveDown();

    doc.fontSize(14).text('Skills');
    doc.fontSize(10).text('Python, Docker, PostgreSQL');
  });

  // 11: Corrupted PDF (bytes that are not a valid PDF)
  fs.writeFileSync(
    path.join(OUT, '11-corrupted.pdf'),
    '%PDF-1.4 corrupt data not valid pdf\x00\xff',
    'utf8'
  );

  // 12: Scanned-like PDF (valid PDF structure but no readable text)
  await savePdf('12-scanned.pdf', (doc) => {
    doc.rect(50, 50, 400, 400).stroke();
  });

  console.log('Golden files generated in', OUT);
}

if (require.main === module) {
  makeFiles().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { makeFiles };
