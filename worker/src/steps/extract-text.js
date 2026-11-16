const fs = require('fs');
const { extract } = require('shared/src/extraction/extract');
const { TextExtractionError } = require('shared/src/extraction/text-extractor');
const { createLocalStorage } = require('shared/src/upload/storage');
const { readUploadConfig } = require('shared/src/upload/upload.config');
const { MIME_TYPES } = require('shared/src/upload/file-types');
const { PermanentError, TemporaryError } = require('shared/src/errors');

const SUPPORTED_MIME_TYPES = [
  MIME_TYPES.pdf,
  MIME_TYPES.docx,
  MIME_TYPES.markdown,
  MIME_TYPES.json // Simera file (US-22): same path as the other sources
];

let defaultStorage = null;

function getDefaultStorage() {
  if (!defaultStorage) {
    defaultStorage = createLocalStorage({
      directory: readUploadConfig().storageDir
    });
  }
  return defaultStorage;
}

/**
 * Creates the worker step 1: extract text and links from uploaded file.
 *
 * @param {object} options
 * @param {object} options.db
 * @param {function} [options.getStorage]
 * @param {number} [options.minTextChars]
 * @param {function} [options.extractFn]
 * @returns {function(object): Promise<object>}
 */
function createExtractTextStep({
  db,
  getStorage,
  minTextChars,
  extractFn = extract
} = {}) {
  return async function extractText(ctx) {
    const { rows } = await db.query(
      'SELECT storage_location, mime_type FROM uploaded_files WHERE id = $1',
      [ctx.fileId]
    );

    if (!rows || rows.length === 0) {
      throw new PermanentError('Uploaded file not found');
    }

    const { storage_location, mime_type } = rows[0];

    if (!SUPPORTED_MIME_TYPES.includes(mime_type)) {
      throw new PermanentError('Unsupported file type');
    }

    const storage = getStorage ? getStorage() : getDefaultStorage();
    const effectiveMinTextChars =
      minTextChars !== undefined
        ? minTextChars
        : readUploadConfig().minExtractedTextChars;

    let fileBuffer;
    try {
      const filePath = storage.resolvePath(storage_location);
      fileBuffer = await fs.promises.readFile(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new PermanentError('The uploaded file is missing');
      }
      throw new TemporaryError('The uploaded file could not be opened');
    }

    let extraction;
    try {
      extraction = await extractFn(fileBuffer, mime_type, {
        minTextChars: effectiveMinTextChars
      });
    } catch (err) {
      if (
        err instanceof TextExtractionError ||
        err.name === 'TextExtractionError'
      ) {
        throw new PermanentError('The file could not be read');
      }
      throw err;
    }

    if (extraction.isEmpty) {
      throw new PermanentError('Extracted text is empty');
    }

    ctx.text = extraction.text;
    ctx.links = extraction.links;

    return ctx;
  };
}

module.exports = { createExtractTextStep };
