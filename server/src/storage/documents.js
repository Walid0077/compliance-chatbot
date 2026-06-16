const fs = require('fs');
const path = require('path');
const config = require('../config');

// Documents live as sibling to data/sessions. The local stub backs the
// demo when no GCS bucket is configured. To use GCS, set the env var
// GCS_DOCUMENTS_BUCKET and `npm install @google-cloud/storage` --
// the require below is lazy so missing the dependency is not fatal.
const documentsDir = path.resolve(config.dataDir, '../documents');
const manifestFile = path.join(documentsDir, '_manifest.json');

function ensureDir() {
  if (!fs.existsSync(documentsDir)) {
    fs.mkdirSync(documentsDir, { recursive: true });
  }
}

function readManifest() {
  if (!fs.existsSync(manifestFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    return {};
  }
}

// Default metadata when a file exists on disk but the manifest has no
// entry for it. Lets the dashboard render dropped-in files immediately.
function defaultMetaFor(filename, stats) {
  return {
    uploaded_by: null,
    upload_date: stats.mtime.toISOString(),
    source: 'local',
    effective_date: null,
    expiry_date: null,
    regulatory_domain: null,
    version: null,
    status: 'active',
  };
}

function listLocal() {
  ensureDir();
  const manifest = readManifest();
  const entries = fs.readdirSync(documentsDir).filter((f) => f !== '_manifest.json');

  return entries
    .map((filename) => {
      try {
        const full = path.join(documentsDir, filename);
        const stats = fs.statSync(full);
        if (!stats.isFile()) return null;
        const meta = manifest[filename] || defaultMetaFor(filename, stats);
        return {
          filename,
          size: stats.size,
          contentType: contentTypeForExt(filename),
          ...meta,
          url: `/api/documents/${encodeURIComponent(filename)}`,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.upload_date || '').localeCompare(a.upload_date || ''));
}

function contentTypeForExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.json': 'application/json',
    '.csv': 'text/csv',
  };
  return map[ext] || 'application/octet-stream';
}

function getLocalFilePath(filename) {
  // Reject path traversal attempts. Only the bare filename is allowed.
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const full = path.join(documentsDir, filename);
  if (!full.startsWith(documentsDir)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

// ── GCS path (optional) ───────────────────────────────────────────────

// Accept any of these shapes for GCS_DOCUMENTS_BUCKET and tease them
// apart into { bucket, prefix }:
//   "my-bucket"                              → bucket only
//   "gs://my-bucket"                         → bucket only (URI form)
//   "gs://my-bucket/sub/folder"              → bucket + folder prefix
//   "my-bucket/sub/folder"                   → bucket + folder prefix
//   "my-bucket/sub/folder/"                  → trailing slash tolerated
// Spaces in folder names are preserved (the Storage API quotes them).
function parseGcsTarget(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (s.startsWith('gs://')) s = s.slice(5);
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!s) return null;
  const slashIdx = s.indexOf('/');
  if (slashIdx === -1) return { bucket: s, prefix: '' };
  return { bucket: s.slice(0, slashIdx), prefix: s.slice(slashIdx + 1) };
}

// Given a path relative to the configured prefix, derive
// (domain, leafFilename) where domain is the first sub-folder
// and leaf is the filename only. Loose objects with no sub-folder
// get domain = null and keep their full relative path as the leaf.
//   "GDPR/article_5.pdf"               → { domain: "GDPR", leaf: "article_5.pdf" }
//   "EU AI Act/annex/iii.pdf"          → { domain: "EU AI Act", leaf: "iii.pdf" }
//   "loose_file.pdf"                   → { domain: null, leaf: "loose_file.pdf" }
function splitDomainAndLeaf(relativePath) {
  if (!relativePath) return { domain: null, leaf: '' };
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length < 2) return { domain: null, leaf: relativePath };
  const domain = parts[0];
  const leaf = parts[parts.length - 1];
  return { domain, leaf };
}

async function listGcs(input) {
  const target = parseGcsTarget(input);
  if (!target?.bucket) {
    throw new Error(`Could not parse a bucket name from "${input}".`);
  }
  const { bucket: bucketName, prefix } = target;

  let Storage;
  try {
    ({ Storage } = require('@google-cloud/storage'));
  } catch {
    throw new Error(
      'GCS_DOCUMENTS_BUCKET is set but @google-cloud/storage is not installed. ' +
      'Run `npm install @google-cloud/storage` in server/.'
    );
  }

  const storage = new Storage();
  const bucketRef = storage.bucket(bucketName);
  const listOpts = prefix ? { prefix: prefix.endsWith('/') ? prefix : prefix + '/' } : {};
  const [files] = await bucketRef.getFiles(listOpts);

  // Generate a signed URL per file so the dashboard "Open ↗" link works
  // without requiring public bucket access. 1-hour validity is enough
  // for browsing; users can refresh the panel for fresh links.
  const out = await Promise.all(files
    .filter((f) => !f.name.endsWith('/')) // skip directory-placeholder objects
    .map(async (file) => {
      const meta = file.metadata.metadata || {};
      // Relative path = the part after the configured prefix.
      // Splits into domain (first sub-folder) + leaf (filename).
      const relativePath = prefix && file.name.startsWith(prefix + '/')
        ? file.name.slice(prefix.length + 1)
        : (prefix && file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name);
      const { domain: derivedDomain, leaf } = splitDomainAndLeaf(relativePath);

      let signedUrl;
      try {
        [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000,
          version: 'v4',
        });
      } catch (err) {
        // Sign failures fall back to the public URL (works if uniform
        // access + public read is configured); otherwise the link
        // simply 403s, which is at worst a no-op for the user.
        console.warn(`[documents] sign failed for ${file.name}: ${err.message}`);
        signedUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(file.name)}`;
      }
      return {
        filename: leaf,
        relativePath,
        gcsObjectName: file.name,
        size: parseInt(file.metadata.size, 10) || 0,
        contentType: file.metadata.contentType || contentTypeForExt(file.name),
        uploaded_by: meta.uploaded_by || null,
        upload_date: file.metadata.timeCreated,
        source: meta.source || 'gcs',
        effective_date: meta.effective_date || null,
        expiry_date: meta.expiry_date || null,
        // Explicit object metadata wins over the folder-derived domain
        // so admins can override per-file when needed.
        regulatory_domain: meta.regulatory_domain || derivedDomain || null,
        version: meta.version || null,
        status: meta.status || 'active',
        url: signedUrl,
      };
    }));

  // Sort by domain then by leaf filename so similar docs cluster
  // visually in the dashboard table.
  out.sort((a, b) => {
    const ad = (a.regulatory_domain || '￿'); // nulls last
    const bd = (b.regulatory_domain || '￿');
    if (ad !== bd) return ad.localeCompare(bd);
    return (a.filename || '').localeCompare(b.filename || '');
  });

  return out;
}

// Most recent listing failure, so the UI can surface it instead of
// silently falling back to local docs. Set whenever GCS listing fails
// for a non-config reason (auth, permissions, network).
let _lastGcsError = null;

function getLastGcsError() {
  return _lastGcsError;
}

async function listDocuments() {
  const bucket = process.env.GCS_DOCUMENTS_BUCKET;
  if (bucket) {
    try {
      const items = await listGcs(bucket);
      _lastGcsError = null;
      return items;
    } catch (err) {
      _lastGcsError = { message: err.message, at: new Date().toISOString() };
      console.error('[documents] GCS listing failed, falling back to local:', err.message);
    }
  } else {
    _lastGcsError = null;
  }
  return listLocal();
}

module.exports = {
  listDocuments,
  getLocalFilePath,
  documentsDir,
  parseGcsTarget,
  splitDomainAndLeaf,
  getLastGcsError,
};
