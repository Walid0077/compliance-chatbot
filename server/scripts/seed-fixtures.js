#!/usr/bin/env node
/**
 * Seed demo fixtures for the dashboard.
 *
 *   node scripts/seed-fixtures.js              # escalations only (default)
 *   node scripts/seed-fixtures.js --force      # overwrite existing fixtures
 *   node scripts/seed-fixtures.js --with-docs  # also seed local document stubs
 *   node scripts/seed-fixtures.js --unseed     # remove all local seed fixtures
 *
 * Escalation tickets are useful for showing the queue without doing
 * live chats. Document seeding is opt-in because real deployments
 * usually point at a GCS bucket; the local stubs were clutter.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const serverRoot = path.resolve(__dirname, '..');
const dataRoot = path.resolve(serverRoot, '../data');
const escalationsDir = path.join(dataRoot, 'escalations');
const documentsDir = path.join(dataRoot, 'documents');

const force = process.argv.includes('--force');
const withDocs = process.argv.includes('--with-docs');
const unseed = process.argv.includes('--unseed');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function isoOffset(daysAgo = 0, hour = 9, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

// ────────────────────────────────────────────────────────────────────────
// Escalation fixtures

const escalationFixtures = [
  {
    id: 'esc_seed_breach_01',
    sessionId: 'seed-session-aurora',
    decision: 'emergency',
    trigger: 'data breach',
    status: 'open',
    source: 'auto',
    userQuery:
      'Our customer support DB was compromised last night and ~12k EU records may have been exfiltrated. What do I do?',
    destinations: ['legal', 'dpo', 'hr'],
    createdAt: isoOffset(0, 8, 14),
  },
  {
    id: 'esc_seed_ransom_02',
    sessionId: 'seed-session-borealis',
    decision: 'emergency',
    trigger: 'ransomware',
    status: 'in_review',
    source: 'auto',
    userQuery:
      'Finance team got hit with ransomware on a shared drive. Do we need to notify regulators within 72 hours?',
    destinations: ['legal', 'dpo'],
    createdAt: isoOffset(1, 14, 22),
    notes: [
      {
        at: isoOffset(1, 16, 5),
        by: 'oversight',
        text: 'Confirmed scope with IT. Triage handed to DPO.',
      },
    ],
  },
  {
    id: 'esc_seed_invest_03',
    sessionId: 'seed-session-cassini',
    decision: 'emergency',
    trigger: 'regulatory investigation',
    status: 'closed',
    source: 'auto',
    userQuery:
      'Got a letter from the Spanish DPA opening a regulatory investigation into our employee monitoring tooling.',
    destinations: ['legal', 'dpo'],
    createdAt: isoOffset(4, 11, 0),
    closedAt: isoOffset(2, 10, 30),
    closedBy: 'oversight',
    resolution: 'Outside counsel engaged. Response submitted on 2026-06-12; no further action pending.',
    notes: [
      {
        at: isoOffset(3, 9, 15),
        by: 'oversight',
        text: 'Counsel briefed. Drafting position statement.',
      },
      {
        at: isoOffset(2, 10, 30),
        by: 'oversight',
        text: 'Submission filed.',
      },
    ],
  },
  {
    id: 'esc_seed_manual_04',
    sessionId: null,
    decision: null,
    trigger: null,
    status: 'open',
    source: 'manual',
    userQuery:
      'Vendor onboarding request flagged by procurement — sub-processor in a non-adequate jurisdiction without an SCC in place.',
    destinations: ['legal', 'dpo'],
    createdAt: isoOffset(0, 12, 5),
  },
  {
    id: 'esc_seed_termination_05',
    sessionId: 'seed-session-deimos',
    decision: 'emergency',
    trigger: 'wrongful termination',
    status: 'in_review',
    source: 'auto',
    userQuery:
      'A manager is asking whether they can use our HR analytics dashboard to justify firing two team members.',
    destinations: ['legal', 'hr'],
    createdAt: isoOffset(2, 16, 40),
  },
];

function buildEscalationRecord(fx) {
  const now = new Date().toISOString();
  return {
    id: fx.id,
    sessionId: fx.sessionId ?? null,
    createdAt: fx.createdAt || now,
    updatedAt: fx.notes?.length
      ? fx.notes[fx.notes.length - 1].at
      : fx.closedAt || fx.createdAt || now,
    status: fx.status || 'open',
    source: fx.source || 'manual',
    decision: fx.decision ?? null,
    trigger: fx.trigger ?? null,
    userQuery: fx.userQuery || '',
    agentResponse: fx.decision === 'emergency'
      ? 'URGENT ESCALATION: This query involves a high-liability incident. Please contact the Legal Department, the DPO, or HR immediately. Do not take further action on this matter without human review.'
      : '',
    destinations: fx.destinations || ['legal', 'dpo'],
    notes: fx.notes || [],
    closedBy: fx.closedBy ?? null,
    closedAt: fx.closedAt ?? null,
    resolution: fx.resolution ?? null,
  };
}

function seedEscalations() {
  ensureDir(escalationsDir);
  let written = 0;
  let skipped = 0;
  for (const fx of escalationFixtures) {
    const file = path.join(escalationsDir, `${fx.id}.json`);
    if (fs.existsSync(file) && !force) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, JSON.stringify(buildEscalationRecord(fx), null, 2), 'utf8');
    written++;
  }
  console.log(`escalations: ${written} written, ${skipped} skipped (use --force to overwrite)`);
}

// ────────────────────────────────────────────────────────────────────────
// Document fixtures

const documentFixtures = [
  {
    filename: 'GDPR_Article_5_principles.txt',
    contents:
      'GDPR Article 5 — Principles relating to processing of personal data.\n\n' +
      '1. Personal data shall be:\n' +
      '   (a) processed lawfully, fairly and in a transparent manner ("lawfulness, fairness and transparency");\n' +
      '   (b) collected for specified, explicit and legitimate purposes ("purpose limitation");\n' +
      '   (c) adequate, relevant and limited to what is necessary ("data minimisation");\n' +
      '   (d) accurate and, where necessary, kept up to date ("accuracy");\n' +
      '   (e) kept in a form which permits identification of data subjects for no longer than is necessary ("storage limitation");\n' +
      '   (f) processed in a manner that ensures appropriate security ("integrity and confidentiality").\n',
    meta: {
      uploaded_by: 'gabriel@dinova.example',
      source: 'regulation',
      regulatory_domain: 'GDPR',
      version: '2016/679',
      effective_date: '2018-05-25',
      expiry_date: null,
      status: 'active',
    },
  },
  {
    filename: 'EU_AI_Act_high_risk_systems_overview.txt',
    contents:
      'EU AI Act — High-Risk System Classification (Annex III summary).\n\n' +
      'Systems classified as high-risk include those used in: critical infrastructure, ' +
      'education and vocational training, employment and worker management, access to ' +
      'essential private and public services, law enforcement, migration and border control, ' +
      'and administration of justice. Providers must complete a conformity assessment ' +
      'before placing the system on the market.\n',
    meta: {
      uploaded_by: 'alec@dinova.example',
      source: 'regulation',
      regulatory_domain: 'EU AI Act',
      version: '2024/1689',
      effective_date: '2026-08-02',
      expiry_date: null,
      status: 'active',
    },
  },
  {
    filename: 'Internal_DPIA_template_v3.txt',
    contents:
      'Internal Data Protection Impact Assessment — Template v3.\n\n' +
      'Section 1: System description\nSection 2: Necessity and proportionality\n' +
      'Section 3: Identification of risks to rights and freedoms\n' +
      'Section 4: Measures to address the risks\nSection 5: DPO consultation record\n',
    meta: {
      uploaded_by: 'walid@dinova.example',
      source: 'internal',
      regulatory_domain: 'GDPR',
      version: '3.0',
      effective_date: '2026-01-15',
      expiry_date: null,
      status: 'active',
    },
  },
  {
    filename: 'Vendor_SCC_addendum_2021.txt',
    contents:
      'Standard Contractual Clauses Addendum — 2021 module reference copy.\n\n' +
      'This is a controlled reference copy. Do not modify. See legal@ for execution.\n',
    meta: {
      uploaded_by: 'brian@dinova.example',
      source: 'internal',
      regulatory_domain: 'Cross-border transfers',
      version: '2021/914',
      effective_date: '2021-06-27',
      expiry_date: null,
      status: 'active',
    },
  },
  {
    filename: 'Legacy_employee_monitoring_policy_v1.txt',
    contents:
      'Legacy employee monitoring policy (v1).\n\n' +
      'SUPERSEDED — see Employee_monitoring_policy_v2.\n',
    meta: {
      uploaded_by: 'walid@dinova.example',
      source: 'internal',
      regulatory_domain: 'GDPR',
      version: '1.0',
      effective_date: '2023-03-01',
      expiry_date: '2025-12-31',
      status: 'superseded',
    },
  },
];

function seedDocuments() {
  ensureDir(documentsDir);
  const manifestFile = path.join(documentsDir, '_manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { manifest = {}; }
  }

  let written = 0;
  let skipped = 0;
  for (const doc of documentFixtures) {
    const file = path.join(documentsDir, doc.filename);
    if (fs.existsSync(file) && !force) {
      skipped++;
    } else {
      fs.writeFileSync(file, doc.contents, 'utf8');
      written++;
    }
    if (!manifest[doc.filename] || force) {
      manifest[doc.filename] = {
        upload_date: doc.meta.effective_date
          ? new Date(doc.meta.effective_date).toISOString()
          : new Date().toISOString(),
        ...doc.meta,
      };
    }
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`documents: ${written} written, ${skipped} skipped (manifest at ${path.relative(serverRoot, manifestFile)})`);
}

// ────────────────────────────────────────────────────────────────────────
// Unseed (cleanup)

function unseedAll() {
  // Delete only files we recognise as seeds (prefixed esc_seed_) and
  // every file in data/documents/ that matches a fixture filename plus
  // the manifest. Sessions are left alone.
  let removed = 0;

  if (fs.existsSync(escalationsDir)) {
    for (const f of fs.readdirSync(escalationsDir)) {
      if (f.startsWith('esc_seed_') && f.endsWith('.json')) {
        fs.unlinkSync(path.join(escalationsDir, f));
        removed++;
      }
    }
  }
  console.log(`escalations: removed ${removed} seeded ticket(s)`);

  let docsRemoved = 0;
  if (fs.existsSync(documentsDir)) {
    const knownFixtureNames = new Set(documentFixtures.map((d) => d.filename));
    for (const f of fs.readdirSync(documentsDir)) {
      if (knownFixtureNames.has(f)) {
        fs.unlinkSync(path.join(documentsDir, f));
        docsRemoved++;
      }
    }
    const manifestFile = path.join(documentsDir, '_manifest.json');
    if (fs.existsSync(manifestFile)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        let changed = false;
        for (const name of knownFixtureNames) {
          if (manifest[name]) { delete manifest[name]; changed = true; }
        }
        if (Object.keys(manifest).length === 0) {
          fs.unlinkSync(manifestFile);
        } else if (changed) {
          fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
        }
      } catch {
        // ignore manifest parse errors during cleanup
      }
    }
  }
  console.log(`documents: removed ${docsRemoved} seeded file(s)`);
}

// ────────────────────────────────────────────────────────────────────────

function main() {
  if (unseed) {
    console.log('Unseeding fixtures…');
    unseedAll();
    console.log('Done.');
    return;
  }
  console.log(force ? 'Seeding fixtures (force mode)…' : 'Seeding fixtures (skip-if-exists)…');
  seedEscalations();
  if (withDocs) {
    seedDocuments();
  } else {
    console.log('documents: skipped (pass --with-docs to seed local document stubs)');
  }
  console.log('Done.');
}

main();
