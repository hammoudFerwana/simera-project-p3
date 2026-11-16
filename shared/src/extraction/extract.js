const mammoth = require('mammoth');
const { getDocumentProxy, getResolvedPDFJS } = require('unpdf');
const {
  MIME_TYPES,
  decodeUtf8Text,
  parseJsonText
} = require('../upload/file-types');
const { TextExtractionError, normalizeText } = require('./text-extractor');

// A text shorter than this (after collapsing whitespace) counts as empty.
const DEFAULT_MIN_TEXT_CHARS = 50;

// Only these link types are kept; javascript:, file: and the like are dropped.
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// PDF layout settings, in PDF points (1/72 inch).
const PARAGRAPH_GAP_FACTOR = 1.8; // a gap of 1.8 lines or more is a blank line
const WRAPPED_LINK_GAP = 12; // annotations of one link, one per line, are this close

// ---------- shared helpers ----------

function cleanUrl(raw) {
  const url = String(raw || '').trim();
  try {
    const { protocol } = new URL(url);
    return ALLOWED_LINK_PROTOCOLS.includes(protocol) ? url : null;
  } catch {
    return null;
  }
}

function cleanLabel(label) {
  return String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Adds { label, url } once. A link without visible text uses its URL as label. */
function addLink(links, seen, label, rawUrl) {
  const url = cleanUrl(rawUrl);
  if (!url) return;
  const finalLabel = cleanLabel(label) || url;
  const key = `${finalLabel}\u0000${url}`;
  if (seen.has(key)) return;
  seen.add(key);
  links.push({ label: finalLabel, url });
}

/** Same text in, same text out: fixed line endings, no trailing spaces. */
function tidyText(text) {
  return String(text)
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- PDF ----------

function toItem(raw) {
  const height = raw.height > 0 ? raw.height : 10;
  return {
    str: raw.str,
    x: raw.transform[4],
    y: raw.transform[5],
    w: raw.width > 0 ? raw.width : 0,
    h: height
  };
}

const byReadingOrder = (a, b) => b.y - a.y || a.x - b.x;

/** Groups items that sit on the same baseline into lines, top to bottom. */
function buildLines(items) {
  const sorted = [...items].sort(byReadingOrder);
  const groups = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.y - item.y) <= Math.max(2, item.h * 0.4)) {
      last.items.push(item);
    } else {
      groups.push({ y: item.y, items: [item] });
    }
  }
  return groups.map((group) => {
    const items = group.items.sort((a, b) => a.x - b.x);
    let text = '';
    let previousEnd = null;
    for (const item of items) {
      if (previousEnd !== null) {
        const gap = item.x - previousEnd;
        if (
          gap > item.h * 0.15 &&
          !text.endsWith(' ') &&
          !item.str.startsWith(' ')
        ) {
          text += ' ';
        }
      }
      text += item.str;
      previousEnd = item.x + item.w;
    }
    return {
      y: group.y,
      h: Math.max(...items.map((item) => item.h)),
      text
    };
  });
}

/** Lines to text; a big vertical gap becomes a blank line. */
function linesToText(lines) {
  const out = [];
  let previous = null;
  for (const line of lines) {
    if (previous && previous.y - line.y > previous.h * PARAGRAPH_GAP_FACTOR) {
      out.push('');
    }
    out.push(line.text);
    previous = line;
  }
  return out.join('\n');
}

/**
 * Page text, line by line from top to bottom, left to right on each line.
 * Made for a single-column CV. A two-column CV keeps all its text, but the
 * two columns are mixed line by line (two-column reading order is not built).
 */
function pageToText(items) {
  return linesToText(buildLines(items));
}

function normalizeRect(rect) {
  return {
    x1: Math.min(rect[0], rect[2]),
    y1: Math.min(rect[1], rect[3]),
    x2: Math.max(rect[0], rect[2]),
    y2: Math.max(rect[1], rect[3])
  };
}

const rectArea = (rect) => (rect.x2 - rect.x1) * (rect.y2 - rect.y1);

function rectContainsCenter(rect, item) {
  const centerX = item.x + item.w / 2;
  const centerY = item.y + item.h / 2;
  return (
    centerX >= rect.x1 - 1 &&
    centerX <= rect.x2 + 1 &&
    centerY >= rect.y1 - 1 &&
    centerY <= rect.y2 + 1
  );
}

/** A mailto: link must hold an address; the CV may point it somewhere else. */
function isUsableLink(url) {
  if (!url.toLowerCase().startsWith('mailto:')) return true;
  return /^mailto:[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+/i.test(url);
}

/** A broken address or URL is joined without the space the line break added. */
function joinLabelLines(lines) {
  const joined = lines.join(' ');
  const compact = lines.join('');
  if (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(compact) ||
    /^https?:\/\/\S+$/.test(compact)
  ) {
    return compact;
  }
  return joined;
}

/**
 * One link per link in the page. A link that wraps onto two lines has one
 * annotation per line, so annotations with the same address that touch each
 * other are one link. Each text item belongs to the smallest annotation
 * rectangle that holds it, so a tall rectangle does not take the next line.
 *
 * @returns {{ label: string, url: string }[]}
 */
function pageLinks(annotations, items) {
  const links = annotations
    .map((annotation) => ({
      url: annotation.url || annotation.unsafeUrl,
      rect: normalizeRect(annotation.rect),
      items: []
    }))
    .sort((a, b) => b.rect.y2 - a.rect.y2 || a.rect.x1 - b.rect.x1);

  for (const item of items) {
    const holders = links.filter((link) => rectContainsCenter(link.rect, item));
    if (holders.length === 0) continue;
    holders.sort((a, b) => rectArea(a.rect) - rectArea(b.rect));
    holders[0].items.push(item);
  }

  // Merge annotations with the same address that touch (a wrapped link).
  const groups = [];
  for (const link of links) {
    const group = groups.find(
      (candidate) =>
        candidate.url === link.url &&
        candidate.rect.y1 - link.rect.y2 <= WRAPPED_LINK_GAP &&
        link.rect.y1 - candidate.rect.y2 <= WRAPPED_LINK_GAP
    );
    if (group) {
      group.items.push(...link.items);
      group.rect = {
        x1: Math.min(group.rect.x1, link.rect.x1),
        y1: Math.min(group.rect.y1, link.rect.y1),
        x2: Math.max(group.rect.x2, link.rect.x2),
        y2: Math.max(group.rect.y2, link.rect.y2)
      };
    } else {
      groups.push({ url: link.url, rect: link.rect, items: [...link.items] });
    }
  }

  return groups.map((group) => ({
    url: group.url,
    label: joinLabelLines(buildLines(group.items).map((line) => line.text))
  }));
}

async function extractFromPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), {
    // No JavaScript evaluation from the file, and no console noise.
    isEvalSupported: false,
    verbosity: 0
  });
  try {
    const pages = [];
    const links = [];
    const seen = new Set();
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items = content.items
        .filter((raw) => typeof raw.str === 'string' && raw.str.trim() !== '')
        .map(toItem);
      pages.push(pageToText(items));

      const annotations = await page.getAnnotations();
      const linkAnnotations = annotations.filter(
        (a) => a.subtype === 'Link' && (a.url || a.unsafeUrl)
      );
      for (const link of pageLinks(linkAnnotations, items)) {
        if (isUsableLink(link.url)) addLink(links, seen, link.label, link.url);
      }
    }
    return { text: pages.filter(Boolean).join('\n\n'), links };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

// ---------- DOCX ----------

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Reads <a href> pairs from mammoth's HTML as plain text. The HTML is never rendered. */
function linksFromHtml(html) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*?\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match = pattern.exec(html);
  while (match) {
    const label = decodeEntities(match[2].replace(/<[^>]*>/g, ''));
    addLink(links, seen, label, decodeEntities(match[1]));
    match = pattern.exec(html);
  }
  return links;
}

async function extractFromDocx(buffer) {
  // Raw text: no macros run. The HTML is read only to find the links.
  const raw = await mammoth.extractRawText({ buffer });
  const html = await mammoth.convertToHtml({ buffer });
  return { text: raw.value, links: linksFromHtml(html.value) };
}

// ---------- Markdown ----------

function extractFromMarkdown(buffer) {
  // Kept as text; markdown is never rendered as HTML.
  const text = decodeUtf8Text(buffer);
  if (text === null) {
    throw new Error('Markdown file is not valid UTF-8 text');
  }

  const links = [];
  const seen = new Set();
  let rest = text;

  // [label](url "title"), but not images ![alt](url)
  const inline = /(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  rest = rest.replace(inline, (whole, label, url) => {
    addLink(links, seen, label, url);
    return ' '.repeat(whole.length);
  });

  // Images are not links: blank them out before looking for bare addresses.
  rest = rest.replace(/!\[[^\]]*\]\([^)]*\)/g, (whole) =>
    ' '.repeat(whole.length)
  );

  addBareLinks(links, seen, rest);
  return { text, links };
}

/** Adds <https://...> and bare https://... or mailto: addresses. */
function addBareLinks(links, seen, text) {
  const bare = /<?(https?:\/\/[^\s<>)\]]+|mailto:[^\s<>)\]]+)>?/g;
  let match = bare.exec(text);
  while (match) {
    addLink(links, seen, '', match[1].replace(/[.,;:!?]+$/, ''));
    match = bare.exec(text);
  }
}

// ---------- JSON (Simera file, US-22) ----------

function extractFromJson(buffer) {
  // The raw JSON text is the file text, kept as written. It is only parsed
  // to check it, never evaluated.
  if (parseJsonText(buffer) === undefined) {
    throw new Error('JSON file is not valid UTF-8 JSON');
  }
  const text = decodeUtf8Text(buffer);

  const links = [];
  const seen = new Set();
  // A JSON string ends with a quote, so it is not part of an address.
  addBareLinks(links, seen, text.replace(/"/g, ' '));
  return { text, links };
}

// ---------- the one function ----------

/**
 * Extracts the text and the links of a CV, LinkedIn or Simera (JSON) file,
 * with code only.
 * Used by the upload check (US-04) and by the worker (step 1 of US-05).
 *
 * The same file always gives the same text, so the text can be hashed.
 * Nothing is rendered or executed: not HTML, not macros, not PDF scripts.
 *
 * @param {Buffer} fileBuffer
 * @param {string} mimeType one of MIME_TYPES (pdf, docx, markdown, json)
 * @param {{ minTextChars?: number }} [options] text shorter than this (after
 *   collapsing whitespace) is reported as empty
 * @returns {Promise<{ text: string, links: { label: string, url: string }[], isEmpty: boolean }>}
 *   isEmpty is true when the text is empty or almost empty; the caller decides
 *   (US-04 rejects the file, the worker throws PermanentError)
 * @throws {TextExtractionError} when the file can't be opened or read
 */
async function extract(
  fileBuffer,
  mimeType,
  { minTextChars = DEFAULT_MIN_TEXT_CHARS } = {}
) {
  if (mimeType === MIME_TYPES.pdf) {
    // Loads pdf.js first, outside the try below, so a broken install is a
    // server error and not reported as a corrupted file.
    await getResolvedPDFJS();
  }

  let result;
  try {
    switch (mimeType) {
      case MIME_TYPES.pdf:
        result = await extractFromPdf(fileBuffer);
        break;
      case MIME_TYPES.docx:
        result = await extractFromDocx(fileBuffer);
        break;
      case MIME_TYPES.markdown:
        result = extractFromMarkdown(fileBuffer);
        break;
      case MIME_TYPES.json:
        result = extractFromJson(fileBuffer);
        break;
      default:
        throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
  } catch (error) {
    throw new TextExtractionError('Text could not be extracted', error);
  }

  const text = tidyText(result.text);
  return {
    text,
    links: result.links,
    isEmpty: normalizeText(text).length < minTextChars
  };
}

module.exports = { extract, DEFAULT_MIN_TEXT_CHARS };
