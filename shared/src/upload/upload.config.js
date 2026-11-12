const path = require('path');

// Fixed by the requirements (3.3), not a setting.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const DEFAULT_MIN_EXTRACTED_TEXT_CHARS = 50;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_STORAGE_DIR = path.join(REPO_ROOT, 'storage/uploads');

/**
 * Reads the upload settings from the environment. Both are optional:
 * - UPLOAD_STORAGE_DIR: private folder for the raw files (default
 *   <repo>/storage/uploads). A relative path is resolved from the repository
 *   root, since each workspace runs from its own folder.
 * - MIN_EXTRACTED_TEXT_CHARS: a file whose extracted text (after collapsing
 *   whitespace) is shorter than this is rejected as "no readable text"
 *   (default 50).
 *
 * @throws {Error} when MIN_EXTRACTED_TEXT_CHARS is not a positive integer
 */
function readUploadConfig(env = process.env) {
  const rawMin = env.MIN_EXTRACTED_TEXT_CHARS;
  const minExtractedTextChars =
    rawMin === undefined || String(rawMin).trim() === ''
      ? DEFAULT_MIN_EXTRACTED_TEXT_CHARS
      : Number(rawMin);
  if (!Number.isInteger(minExtractedTextChars) || minExtractedTextChars < 1) {
    throw new Error('MIN_EXTRACTED_TEXT_CHARS must be a positive integer');
  }

  const rawDir = env.UPLOAD_STORAGE_DIR;
  const storageDir =
    rawDir === undefined || String(rawDir).trim() === ''
      ? DEFAULT_STORAGE_DIR
      : path.resolve(REPO_ROOT, String(rawDir).trim());

  return { minExtractedTextChars, storageDir };
}

module.exports = { MAX_FILE_SIZE_BYTES, readUploadConfig };
