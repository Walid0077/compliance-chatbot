const _pdfParseModule = require('pdf-parse');
const pdfParse = typeof _pdfParseModule === 'function' ? _pdfParseModule : _pdfParseModule.default;
const mammoth = require('mammoth');

const MAX_CHARS = 3500; // Dialogflow CX query limit is ~5000 chars; leave room for prompt wrapper

/**
 * Extract plain text from an uploaded file buffer.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} originalname
 * @returns {Promise<{ text: string, truncated: boolean }>}
 */
async function extractText(buffer, mimetype, originalname) {
  let text = '';

  try {
    if (mimetype === 'application/pdf') {
      const result = await pdfParse(buffer);
      text = result.text || '';

    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname?.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';

    } else if (mimetype === 'text/plain' || originalname?.endsWith('.txt')) {
      text = buffer.toString('utf-8');

    } else {
      // Image or unsupported type — no text extraction
      return { text: null, truncated: false };
    }
  } catch (err) {
    console.error('[fileExtract] extraction error for', originalname, ':', err.message);
    return { text: null, truncated: false, error: err.message };
  }

  // Normalise whitespace
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);

  return { text, truncated };
}

module.exports = { extractText };
