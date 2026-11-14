const fs = require('fs');
const path = require('path');
const { extract } = require('../src/extraction/extract');
const { MIME_TYPES } = require('../src/upload/file-types');

const MIME = {
  '.pdf': MIME_TYPES.pdf,
  '.docx': MIME_TYPES.docx,
  '.md': MIME_TYPES.markdown
};

(async () => {
  const file = process.argv[2];
  const result = await extract(
    fs.readFileSync(file),
    MIME[path.extname(file).toLowerCase()]
  );
  fs.writeFileSync(
    'extract-output.txt',
    `${result.text}\n\nLINKS:\n${JSON.stringify(result.links, null, 2)}`,
    'utf8'
  );
  console.log(
    'chars:',
    result.text.length,
    'links:',
    result.links.length,
    'isEmpty:',
    result.isEmpty
  );
})();
