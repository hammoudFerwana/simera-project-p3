const mammoth = require('mammoth');
const {
  extractText: extractPdfText,
  getDocumentProxy,
  getResolvedPDFJS
} = require('unpdf');
const { MIME_TYPES, decodeUtf8Text } = require('../upload/file-types');

/** The file can't be opened or read (corrupted, encrypted, wrong content). */
class TextExtractionError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'TextExtractionError';
  }
}

async function extractFromPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), {
    // No JavaScript evaluation from the file, and no console noise.
    isEvalSupported: false,
    verbosity: 0
  });
  try {
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  } finally {
    // Frees the document's memory (the proxy itself has no destroy()).
    await pdf.loadingTask.destroy();
  }
}

async function extractFromDocx(buffer) {
  // Raw text only: no HTML conversion, and macros are never run.
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

function extractFromMarkdown(buffer) {
  // Kept as plain text; markdown is never rendered as HTML.
  const text = decodeUtf8Text(buffer);
  if (text === null) {
    throw new Error('Markdown file is not valid UTF-8 text');
  }
  return text;
}

/**
 * Extracts the plain text of an uploaded file. Used by the upload service
 * (integrity check and text hash) and again by the worker, since the text is
 * not stored.
 *
 * @param {{ mimeType: string, buffer: Buffer }} file
 * @returns {Promise<string>} the text as extracted (not normalized)
 * @throws {TextExtractionError} when the file can't be opened or read
 */
async function extractText({ mimeType, buffer }) {
  if (mimeType === MIME_TYPES.pdf) {
    // Loads pdf.js first, outside the try below, so a broken install is a
    // server error and not reported as a corrupted file.
    await getResolvedPDFJS();
  }

  try {
    switch (mimeType) {
      case MIME_TYPES.pdf:
        return await extractFromPdf(buffer);
      case MIME_TYPES.docx:
        return await extractFromDocx(buffer);
      case MIME_TYPES.markdown:
        return extractFromMarkdown(buffer);
      default:
        throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
  } catch (error) {
    throw new TextExtractionError('Text could not be extracted', error);
  }
}

/** Trims and collapses every whitespace run to one space. */
function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

module.exports = { TextExtractionError, extractText, normalizeText };
