'use strict';

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT || 3000);
const MAX_BATCH = Number(process.env.MAIL_MAX_BATCH || 100);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const CONTACT_TO = process.env.CONTACT_TO || 'info@gaelleelters.com';
const CONTACT_MX_HOST = process.env.CONTACT_MX_HOST || 'route3.mx.cloudflare.net';
const CONTACT_MX_PORT = Number(process.env.CONTACT_MX_PORT || 25);
const CONTACT_FROM = process.env.CONTACT_FROM || 'Ask me <noreply@gaelleelters.com>';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
});

app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.use('/send', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many send requests. Try again in a few minutes.' }
}));

app.use('/contact', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many questions. Try again in a few minutes.' }
}));

function smtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function createSmtpTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

function formSubmitSuccess(data) {
  return data && (data.success === true || data.success === 'true');
}

async function sendViaFormSubmit(to, payload, meta, subject) {
  const res = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://gaelleelters.com',
      Referer: 'https://gaelleelters.com/',
      'User-Agent': 'Mozilla/5.0 (compatible; GaelleElTersContact/1.0)'
    },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      _replyto: payload.email,
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      message: buildContactText(payload, meta)
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !formSubmitSuccess(data)) {
    const err = new Error(data.message || data.error || ('Mail relay HTTP ' + res.status));
    err.relay = data;
    throw err;
  }
  return data;
}

async function sendContactEmail(payload, meta, subject) {
  if (smtpConfigured()) {
    await createSmtpTransport().sendMail({
      from: SMTP_FROM,
      to: CONTACT_TO,
      replyTo: `${payload.name} <${payload.email}>`,
      subject,
      text: buildContactText(payload, meta),
      html: buildContactHtml(payload, meta)
    });
    return 'smtp';
  }
  await sendViaFormSubmit(CONTACT_TO, payload, meta, subject);
  return 'relay';
}

function htmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBodyHtml(greeting, firstName, message) {
  const open = greeting
    ? `${htmlEsc(greeting)} ${htmlEsc(firstName)},`
    : `${htmlEsc(firstName)},`;
  let html = `<div style="font-family:Calibri,sans-serif;font-size:11pt;font-weight:normal;"><p style="margin:0 0 8pt 0;">${open}</p>`;
  const norm = String(message || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const para of norm.split(/\n\n/)) {
    const p = para.trim();
    if (!p) continue;
    html += `<p style="margin:0 0 8pt 0;">${htmlEsc(p).replace(/\n/g, '<br>')}</p>`;
  }
  return `${html}</div>`;
}

function splitAddrs(value) {
  if (!value) return [];
  return String(value).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function headerSafe(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
}

function formatSubmittedAt(date) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(date) + ' UTC';
  } catch (_err) {
    return date.toISOString();
  }
}

function buildContactHtml(payload, meta) {
  const email = payload.email || '';
  const rows = [
    ['Visitor name', payload.name || '(not provided)'],
    ['Visitor email', email || '(not provided)'],
    ['Submitted', meta.timeDisplay || meta.time || '(unknown)'],
    ['Page', meta.page || '(unknown)']
  ];
  const body = rows.map(function (row) {
    const value = row[0] === 'Visitor email' && email
      ? `<a href="mailto:${htmlEsc(email)}">${htmlEsc(email)}</a>`
      : htmlEsc(row[1]);
    return `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;vertical-align:top;width:160px;">${htmlEsc(row[0])}</td>`
      + `<td style="padding:8px 12px;border:1px solid #e5e7eb;white-space:pre-wrap;">${value}</td></tr>`;
  }).join('');
  return `<div style="font-family:Calibri,sans-serif;font-size:11pt;">`
    + `<p style="margin:0 0 12px 0;">New question from the Ask me form on gaelleelters.com.</p>`
    + `<p style="margin:0 0 12px 0;">Reply directly to this email to respond to the visitor.</p>`
    + `<table style="border-collapse:collapse;width:100%;max-width:640px;">${body}</table>`
    + `<p style="margin:16px 0 8px 0;font-weight:600;">Question / Message</p>`
    + `<p style="margin:0;white-space:pre-wrap;">${htmlEsc(payload.question)}</p>`
    + `</div>`;
}

function buildContactText(payload, meta) {
  return [
    'New question from the Ask me form on gaelleelters.com.',
    'Reply directly to this email to respond to the visitor.',
    '',
    'Visitor name: ' + (payload.name || '(not provided)'),
    'Visitor email: ' + (payload.email || '(not provided)'),
    'Submitted: ' + (meta.timeDisplay || meta.time || '(unknown)'),
    'Page: ' + (meta.page || '(unknown)'),
    '',
    'Question / Message:',
    payload.question
  ].join('\n');
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'mail-mass-api',
    smtpConfigured: smtpConfigured(),
    contactConfigured: true,
    contactDelivery: smtpConfigured() ? 'smtp' : 'relay',
    from: smtpConfigured() ? SMTP_FROM : CONTACT_FROM
  });
});

app.post('/send', upload.single('attachment'), async (req, res) => {
  try {
    if (!smtpConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Mail sending is not configured on the server yet. Ask the site owner to add SMTP settings.'
      });
    }

    let mails = [];
    if (req.is('multipart/form-data') || req.file || req.body.mails) {
      const raw = req.body.mails;
      mails = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    } else {
      mails = req.body.mails || [];
    }

    if (!Array.isArray(mails) || !mails.length) {
      return res.status(400).json({ ok: false, error: 'No emails to send.' });
    }
    if (mails.length > MAX_BATCH) {
      return res.status(400).json({
        ok: false,
        error: `Too many rows (max ${MAX_BATCH} per send).`
      });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE || SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    let processed = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < mails.length; i++) {
      const m = mails[i] || {};
      const to = String(m.email || '').trim();
      if (!to) {
        skipped += 1;
        continue;
      }

      const mailOpts = {
        from: SMTP_FROM,
        to,
        cc: splitAddrs(m.cc).join(', ') || undefined,
        bcc: splitAddrs(m.bcc).join(', ') || undefined,
        subject: String(m.subject || 'Document Attached').trim() || 'Document Attached',
        html: buildBodyHtml(m.greeting, m.first, m.message)
      };

      if (req.file) {
        mailOpts.attachments = [{
          filename: req.file.originalname,
          content: req.file.buffer,
          contentType: req.file.mimetype
        }];
      }

      try {
        await transporter.sendMail(mailOpts);
        processed += 1;
      } catch (err) {
        errors.push({ row: i + 1, to, error: err.message || 'Send failed' });
      }
    }

    return res.json({
      ok: errors.length === 0,
      processed,
      skipped,
      failed: errors.length,
      errors: errors.slice(0, 10),
      from: SMTP_FROM
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
});

app.post('/contact', async (req, res) => {
  try {
    if (req.body && req.body.website) {
      return res.json({ ok: true });
    }

    const name = headerSafe(req.body.name).slice(0, 120);
    const email = headerSafe(req.body.email || req.body.replyEmail).slice(0, 120);
    const question = String(req.body.question || req.body.message || '').trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, error: 'Please enter your name.' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }
    if (!question || question.length < 10) {
      return res.status(400).json({ ok: false, error: 'Please enter a question.' });
    }
    if (question.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Question is too long.' });
    }

    const submitted = new Date();
    const payload = { name, email, question };
    const meta = {
      page: headerSafe(req.body.page || req.get('referer') || '').slice(0, 500),
      time: submitted.toISOString(),
      timeDisplay: formatSubmittedAt(submitted)
    };
    const preview = question.slice(0, 64);
    const subject = headerSafe(`[Ask me] ${name} — ${preview}${question.length > 64 ? '…' : ''}`).slice(0, 180);

    await sendContactEmail(payload, meta, subject);
    return res.json({ ok: true, forwarded: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('contact send failed', err && err.message);
    return res.status(500).json({ ok: false, error: 'Could not send your question.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`mail-mass-api on :${PORT} smtp=${smtpConfigured()}`);
});
