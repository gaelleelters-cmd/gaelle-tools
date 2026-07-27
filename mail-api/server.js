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

function buildContactHtml(question, replyEmail, meta) {
  const rows = [
    ['Question', question],
    ['Reply email', replyEmail || '(not provided)'],
    ['Page', meta.page || '(unknown)'],
    ['Time (UTC)', meta.time || '(unknown)']
  ];
  const body = rows.map(function (row) {
    return `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;vertical-align:top;">${htmlEsc(row[0])}</td>`
      + `<td style="padding:8px 12px;border:1px solid #e5e7eb;white-space:pre-wrap;">${htmlEsc(row[1])}</td></tr>`;
  }).join('');
  return `<div style="font-family:Calibri,sans-serif;font-size:11pt;">`
    + `<p style="margin:0 0 12px 0;">New question from the site help bot:</p>`
    + `<table style="border-collapse:collapse;width:100%;max-width:640px;">${body}</table></div>`;
}

function buildContactText(question, replyEmail, meta) {
  return [
    'New question from the site help bot:',
    '',
    'Question:',
    question,
    '',
    'Reply email: ' + (replyEmail || '(not provided)'),
    'Page: ' + (meta.page || '(unknown)'),
    'Time (UTC): ' + (meta.time || '(unknown)')
  ].join('\n');
}

function matchFaqTopic(lower) {
  if (/mail mass|outlook|merge/.test(lower)) return 'mailmass';
  if (/cv|resume|curriculum/.test(lower)) return 'cv';
  if (/data|privacy|upload|store|safe/.test(lower)) return 'privacy';
  if (/tool|how|work|whatsapp|excel/.test(lower)) return 'tools';
  return null;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'mail-mass-api',
    smtpConfigured: smtpConfigured(),
    from: smtpConfigured() ? SMTP_FROM : null
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

    const question = String(req.body.question || '').trim();
    const replyEmail = String(req.body.replyEmail || '').trim();

    if (!question || question.length < 3) {
      return res.status(400).json({ ok: false, error: 'Please enter a question.' });
    }
    if (question.length > 2000) {
      return res.status(400).json({ ok: false, error: 'Question is too long.' });
    }
    if (replyEmail && !isValidEmail(replyEmail)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }

    if (!smtpConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Question forwarding is not configured on the server yet.'
      });
    }

    const faqTopic = matchFaqTopic(question.toLowerCase());
    const meta = {
      page: String(req.body.page || req.get('referer') || '').trim(),
      time: new Date().toISOString()
    };
    const subjectPrefix = faqTopic ? '[Help bot · auto-answered]' : '[Help bot · needs reply]';
    const subject = `${subjectPrefix} ${question.slice(0, 72)}${question.length > 72 ? '…' : ''}`;

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE || SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: CONTACT_TO,
      replyTo: replyEmail || undefined,
      subject,
      text: buildContactText(question, replyEmail, meta),
      html: buildContactHtml(question, replyEmail, meta)
    });

    return res.json({ ok: true, forwarded: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Could not send your question.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`mail-mass-api on :${PORT} smtp=${smtpConfigured()}`);
});
