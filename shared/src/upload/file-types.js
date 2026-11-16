const path = require('path');

const MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  markdown: 'text/markdown',
  json: 'application/json'
};

// Accepted formats per source type (requirements 3.3). simera_profile is
// uploaded by the dev team only (US-22), never by the candidate.
const SOURCE_FORMATS = {
  cv: {
    label: 'the CV',
    formats: [
      { extension: '.pdf', name: 'PDF', mimeType: MIME_TYPES.pdf },
      { extension: '.docx', name: 'DOCX', mimeType: MIME_TYPES.docx }
    ]
  },
  linkedin: {
    label: 'LinkedIn',
    formats: [{ extension: '.md', name: 'MD', mimeType: MIME_TYPES.markdown }]
  },
  simera_profile: {
    label: 'the Simera file',
    formats: [{ extension: '.json', name: 'JSON', mimeType: MIME_TYPES.json }]
  }
};

const PDF_SIGNATURE = Buffer.from('%PDF-');
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// File names are stored uncompressed in a ZIP, so a real Word document
// contains this entry name in its bytes.
const DOCX_MAIN_PART = Buffer.from('word/document.xml');

/** @returns {boolean} whether the upload service supports this source type */
function isSupportedSourceType(sourceType) {
  return Object.prototype.hasOwnProperty.call(SOURCE_FORMATS, sourceType);
}

/** @returns {string[]} format names for messages, e.g. ['PDF', 'DOCX'] */
function acceptedFormatNames(sourceType) {
  return SOURCE_FORMATS[sourceType].formats.map((format) => format.name);
}

/**
 * Finds the accepted format matching the file name's extension.
 *
 * @returns {{ extension: string, name: string, mimeType: string } | null}
 */
function findFormatByFilename(sourceType, filename) {
  const extension = path.extname(String(filename || '')).toLowerCase();
  return (
    SOURCE_FORMATS[sourceType].formats.find(
      (format) => format.extension === extension
    ) || null
  );
}

/** Decodes strict UTF-8 text, or returns null when the bytes aren't text. */
function decodeUtf8Text(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
  // NUL never appears in a text file; it marks binary content.
  if (text.includes('\u0000')) {
    return null;
  }
  return text.startsWith('﻿') ? text.slice(1) : text;
}

/**
 * Parses strict UTF-8 JSON text, or returns undefined when the bytes are not
 * valid JSON. Never evaluates anything: JSON.parse only.
 */
function parseJsonText(buffer) {
  const text = decodeUtf8Text(buffer);
  if (text === null) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Checks the real content against the expected type (magic bytes, valid
 * UTF-8 text for markdown, or UTF-8 text that parses as JSON). Never trusts
 * the extension or the client's Content-Type.
 */
function contentMatchesMimeType(mimeType, buffer) {
  switch (mimeType) {
    case MIME_TYPES.pdf:
      return buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
    case MIME_TYPES.docx:
      return (
        buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE) &&
        buffer.includes(DOCX_MAIN_PART)
      );
    case MIME_TYPES.markdown:
      return decodeUtf8Text(buffer) !== null;
    case MIME_TYPES.json:
      return parseJsonText(buffer) !== undefined;
    default:
      return false;
  }
}

module.exports = {
  MIME_TYPES,
  SOURCE_FORMATS,
  acceptedFormatNames,
  contentMatchesMimeType,
  decodeUtf8Text,
  findFormatByFilename,
  isSupportedSourceType,
  parseJsonText
};
