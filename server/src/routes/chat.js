const { Router } = require('express');
const multer = require('multer');
const dialogflow = require('../services/dialogflow');
const { extractText } = require('../services/fileExtract');
const store = require('../storage/store');

const router = Router();

// Memory storage — files never written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    // Support both JSON body and multipart form fields
    const message   = req.body.message;
    const sessionId = req.body.sessionId;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message and sessionId are required' });
    }

    // ── File handling ──────────────────────────────────────────────
    let fileContext = null;
    let fileName    = null;
    let isImage     = false;

    if (req.file) {
      fileName = req.file.originalname;
      const mime = req.file.mimetype;
      isImage = mime.startsWith('image/');

      if (!isImage) {
        const { text, truncated } = await extractText(req.file.buffer, mime, fileName);
        if (text) {
          fileContext = text;
          if (truncated) {
            fileContext += '\n\n[Note: document was truncated to fit context limits.]';
          }
        }
      }
    }

    // ── Build the message sent to Dialogflow ───────────────────────
    let fullMessage = message;
    if (fileContext) {
      // IMPORTANT: use exact phrases that match the Orchestrator's intake gate code:
      // "Document name:" and "Document content:" are the trigger markers in check_intake_gate
      // and classify_sensitivity actions. This ensures Route A (document audit) is selected.
      const userRequest = message || 'Please analyze this document for compliance gaps, risks, and regulatory requirements.';
      const combined =
        `Document name: ${fileName}\n` +
        `Document content:\n${fileContext}\n\n` +
        `User request: ${userRequest}`;
      // Hard cap at 4800 chars to stay under Dialogflow CX's query limit
      fullMessage = combined.slice(0, 4800);
    } else if (isImage) {
      fullMessage = `[User uploaded an image: ${fileName}]\n${message}`;
    }

    // Save user message
    store.saveMessage(sessionId, 'user', message, { fileName: fileName || null });

    const response = await dialogflow.detectIntent(sessionId, fullMessage);
    const queryResult = response.queryResult || {};
    const responseMessages = queryResult.responseMessages || [];
    const texts = responseMessages
      .filter((m) => m.text)
      .map((m) => m.text.text.join('\n'));

    // Extract intent info and confidence
    const intentName = queryResult.match?.intent?.displayName || null;
    const confidence = typeof queryResult.match?.confidence === 'number'
      ? queryResult.match.confidence
      : null;

    // ── Agentic RAG: extract sources from Data Store connection signals ──
    const signals = queryResult.dataStoreConnectionSignals || {};
    console.log('[RAG] dataStoreConnectionSignals:', JSON.stringify(signals, null, 2));
    if (queryResult.traceBlocks?.length) {
      console.log('[RAG] traceBlocks (first):', JSON.stringify(queryResult.traceBlocks[0], null, 2));
    }

    // Dialogflow CX Data Store response shape has evolved. We probe all known locations:
    // 1. signals.citedSnippets[]  — current shape (chunkInfo + documentMetadata)
    // 2. signals.searchSnippets[] — older shape
    // 3. signals.answerParts[]    — alternative answer parts with citations
    let rawSources = [];

    if (signals.citedSnippets && signals.citedSnippets.length > 0) {
      rawSources = signals.citedSnippets.map((s) => {
        const meta = s.chunkInfo?.documentMetadata || {};
        return {
          title:   meta.title || meta.documentTitle || null,
          uri:     meta.uri   || meta.documentUri   || null,
          snippet: s.chunkInfo?.content || s.text   || null,
        };
      });
    } else if (signals.searchSnippets && signals.searchSnippets.length > 0) {
      rawSources = signals.searchSnippets.map((s) => ({
        title:   s.documentTitle || s.document_title || null,
        uri:     s.documentUri   || s.document_uri   || null,
        snippet: s.text || null,
      }));
    } else if (signals.answerParts && signals.answerParts.length > 0) {
      rawSources = signals.answerParts.flatMap((part) =>
        (part.citations || []).map((c) => ({
          title:   c.title || null,
          uri:     c.uri   || null,
          snippet: part.text || null,
        }))
      );
    }

    if (rawSources.length === 0) {
      console.log('[RAG] No sources found. signals keys:', Object.keys(signals));
    }

    const uniqueSources = rawSources.filter(
      (s, i, arr) => s.uri && arr.findIndex((x) => x.uri === s.uri) === i
    );

    // If Dialogflow returns nothing useful (NOT_ENOUGH_INFORMATION), build a fallback
    let replyText = texts.join('\n\n');
    if (!replyText && fileContext) {
      replyText =
        `I've reviewed **${fileName}**. Here's a summary of what I found:\n\n` +
        `The document contains ${fileContext.length} characters of content. ` +
        `However, I wasn't able to generate a detailed compliance analysis from my knowledge base for this specific document. ` +
        `Please try asking a specific question about the document, for example:\n` +
        `- "What GDPR obligations does this document mention?"`  + `\n` +
        `- "Are there any data retention requirements?"`  + `\n` +
        `- "What are the key risks identified?"`;
    } else if (!replyText) {
      replyText = 'No response from agent.';
    }

    // Save bot message with metadata
    store.saveMessage(sessionId, 'bot', replyText, {
      intentName,
      confidence,
      sourceCount: uniqueSources.length,
    });

    res.json({
      reply: replyText,
      intentName,
      confidence,
      sources: uniqueSources,
      sourceCount: uniqueSources.length,
      raw: queryResult,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
