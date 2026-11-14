const fs = require('fs');
const { getDocumentProxy, getResolvedPDFJS } = require('unpdf');

(async () => {
  await getResolvedPDFJS();
  const pdf = await getDocumentProxy(
    new Uint8Array(fs.readFileSync(process.argv[2])),
    {
      isEvalSupported: false,
      verbosity: 0
    }
  );
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    console.log('--- page', p, 'text items (x, y, text)');
    for (const item of content.items) {
      console.log(
        Math.round(item.transform[4]),
        Math.round(item.transform[5]),
        JSON.stringify(item.str)
      );
    }
    console.log('--- annotations (type, url, rect)');
    for (const a of await page.getAnnotations()) {
      console.log(a.subtype, a.url, a.rect);
    }
  }
  await pdf.loadingTask.destroy();
})();
