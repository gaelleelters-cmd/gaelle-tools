(function () {
  'use strict';

  var STORAGE_KEY = 'gaelle-cv-studio-v2';
  var step = 1;
  var total = 6;
  var photoData = '';
  var saveTimer = null;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var SKILL_PACKS = {
    comms: ['Media relations', 'Content writing', 'Social media', 'Stakeholder engagement', 'Public speaking', 'Brand storytelling', 'Crisis communications'],
    data: ['Excel', 'Power BI', 'SQL', 'Data visualization', 'Survey design', 'Statistics', 'Dashboarding'],
    ops: ['Scheduling', 'Travel logistics', 'Document management', 'Procurement support', 'Meeting coordination', 'Filing systems'],
    tech: ['JavaScript', 'HTML/CSS', 'Python', 'Git', 'UI prototyping', 'Automation'],
    humanitarian: ['Protection principles', 'Needs assessment', 'Partner coordination', 'Donor reporting', 'Field monitoring', 'Accountability to affected people']
  };

  var BULLET_PACKS = {
    comms: [
      'Drafted and published weekly updates reaching 5,000+ stakeholders',
      'Led media outreach that secured coverage in 8 national outlets',
      'Created social content calendars that grew engagement by 35%',
      'Coordinated events for 100+ participants with partners and donors',
      'Built crisis communications talking points used across senior leadership'
    ],
    programme: [
      'Supported delivery of programme activities across multiple field sites',
      'Improved reporting accuracy by standardizing monthly data collection',
      'Coordinated with 12 partner organizations on joint workplans',
      'Tracked indicators and flagged risks early to leadership'
    ],
    data: [
      'Built dashboards that cut manual reporting time by 40%',
      'Cleaned and merged datasets from 5 sources into one trusted sheet',
      'Analyzed survey results and presented actionable findings to managers',
      'Automated recurring Excel workflows with formulas and validation'
    ],
    ops: [
      'Managed calendars, travel, and logistics for a team of 15+',
      'Processed documentation with zero missed deadlines over 6 months',
      'Streamlined filing systems that reduced retrieval time significantly',
      'Supported procurement follow-up and vendor coordination'
    ],
    tech: [
      'Shipped user-facing features used by dozens of colleagues weekly',
      'Reduced repetitive tasks through scripts and lightweight tools',
      'Documented workflows so new team members could onboard faster',
      'Improved page performance and accessibility on key screens'
    ]
  };

  var STOP = {
    the:1, and:1, for:1, with:1, that:1, this:1, from:1, your:1, you:1, our:1, are:1, was:1, were:1,
    will:1, have:1, has:1, had:1, not:1, but:1, all:1, any:1, can:1, may:1, into:1, about:1, their:1,
    they:1, them:1, who:1, what:1, when:1, where:1, which:1, while:1, than:1, then:1, also:1, such:1,
    other:1, more:1, most:1, some:1, only:1, over:1, under:1, between:1, through:1, using:1, use:1,
    used:1, work:1, role:1, team:1, job:1, experience:1, including:1, across:1, within:1, able:1,
    ensure:1, strong:1, good:1, well:1, etc:1, seek:1, seeks:1, seeking:1, must:1, speak:1, speaking:1,
    preferred:1, looking:1, hiring:1, vacancy:1, position:1, opportunity:1, candidate:1, candidates:1,
    applicant:1, applicants:1, requirements:1, responsibilities:1, duties:1, ability:1, skills:1,
    years:1, year:1, please:1, apply:1, based:1, related:1, relevant:1, required:1, require:1,
    provides:1, provide:1, supporting:1, support:1, working:1, works:1, highly:1, ideally:1,
    minimum:1, least:1, plus:1, etcetera:1, description:1, summary:1, equal:1, opportunity:1,
    employer:1, join:1, joins:1, we:1, us:1, be:1, been:1, being:1, do:1, does:1, did:1, done:1,
    make:1, makes:1, made:1, get:1, gets:1, help:1, helps:1, need:1, needs:1, like:1, likes:1,
    should:1, would:1, could:1, shall:1, onto:1, upon:1, per:1, via:1, both:1, each:1, every:1,
    new:1, current:1, full:1, time:1, part:1, type:1, level:1, company:1, organization:1,
    organisation:1, office:1, location:1, successful:1, success:1, excellent:1, proven:1, track:1,
    record:1, demonstrate:1, demonstrated:1, demonstrating:1, knowledge:1, understanding:1,
    ability:1, capacity:1, willing:1, willingness:1, committed:1, commitment:1, passion:1,
    passionate:1, ideal:1, ideally:1, least:1, strategy:1, strategies:1,
    programme:1, programmes:1, program:1, programs:1, officer:1, officers:1,
    needed:1, needs:1, require:1, requires:1, required:1
  };

  function template() {
    var el = $('input[name="template"]:checked');
    return el ? el.value : 'classic';
  }

  function accent() {
    var el = $('input[name="accent"]:checked');
    return el ? el.value : '#2f6f8f';
  }

  function mixAccent(hex, ratio) {
    var h = String(hex || '#2f6f8f').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#1a455c';
    return 'rgb(' + Math.round(r * ratio) + ',' + Math.round(g * ratio) + ',' + Math.round(b * ratio) + ')';
  }

  function applyAccent() {
    var col = accent();
    var deep = mixAccent(col, 0.76);
    var app = $('.app');
    var cv = $('#cv-preview');
    if (app) {
      app.style.setProperty('--cv-accent', col);
    }
    if (cv) {
      cv.style.setProperty('--cv-accent', col);
      cv.style.setProperty('--cv-deep', deep);
    }
  }

  function jobTitle() {
    return ($('#job-title').value || '').trim();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function collectExp() {
    return $$('#exp-list .entry-card').map(function (card) {
      return {
        title: card.querySelector('.exp-title').value.trim(),
        company: card.querySelector('.exp-company').value.trim(),
        start: card.querySelector('.exp-start').value.trim(),
        end: card.querySelector('.exp-end').value.trim(),
        bullets: card.querySelector('.exp-bullets').value.split(/\n+/).map(function (b) { return b.trim(); }).filter(Boolean)
      };
    }).filter(function (e) { return e.title || e.company; });
  }

  function collectEdu() {
    return $$('#edu-list .entry-card').map(function (card) {
      return {
        degree: card.querySelector('.edu-degree').value.trim(),
        school: card.querySelector('.edu-school').value.trim(),
        year: card.querySelector('.edu-year').value.trim(),
        detail: card.querySelector('.edu-detail').value.trim()
      };
    }).filter(function (e) { return e.degree || e.school; });
  }

  function resumeTextBlob() {
    var parts = [
      $('#full-name').value, jobTitle(), $('#summary').value, $('#skills').value, $('#languages').value,
      collectExp().map(function (e) { return [e.title, e.company, e.bullets.join(' ')].join(' '); }).join(' '),
      collectEdu().map(function (e) { return [e.degree, e.school, e.detail].join(' '); }).join(' ')
    ];
    return parts.join(' ').toLowerCase();
  }

  var KNOWN_PHRASES = [
    'media relations', 'content writing', 'stakeholder engagement', 'crisis communications',
    'donor reporting', 'social media', 'public speaking', 'project management', 'data analysis',
    'data visualization', 'needs assessment', 'partner coordination', 'field monitoring',
    'protection principles', 'monitoring and evaluation', 'monitoring & evaluation',
    'communications officer', 'programme associate', 'power bi', 'microsoft excel',
    'humanitarian programmes', 'humanitarian programs', 'report writing', 'strategic communications',
    'brand storytelling', 'press releases', 'community engagement', 'capacity building'
  ];

  function isUsefulToken(w) {
    return w && w.length >= 4 && !STOP[w] && !/^\d+$/.test(w);
  }

  function extractKeywords(text) {
    var raw = String(text || '').toLowerCase().replace(/[^a-z0-9\s\-+/&]/g, ' ').replace(/\s+/g, ' ').trim();
    var freq = {};
    var covered = ' ' + raw + ' ';

    function bump(term, weight) {
      if (!term) return;
      freq[term] = (freq[term] || 0) + weight;
    }

    KNOWN_PHRASES.forEach(function (phrase) {
      if (raw.indexOf(phrase) !== -1) {
        bump(phrase, 5);
        covered = covered.split(phrase).join(' ');
      }
    });

    var words = covered.match(/[a-z][a-z0-9\-]{3,}/g) || [];
    words.forEach(function (w) {
      if (isUsefulToken(w)) bump(w, 1);
    });

    return Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a] || b.length - a.length; })
      .filter(function (k, idx, arr) {
        if (k.indexOf(' ') === -1) {
          return !arr.some(function (p) {
            return p !== k && p.indexOf(k) !== -1;
          });
        }
        return true;
      })
      .slice(0, 14);
  }

  function addSkillTerm(term) {
    var clean = String(term || '').trim();
    if (!clean) return;
    clean = clean.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    var list = $('#skills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var lower = list.map(function (s) { return s.toLowerCase(); });
    if (lower.indexOf(clean.toLowerCase()) === -1) list.push(clean);
    $('#skills').value = list.join(', ');
    scheduleSave();
  }

  function setRing(id, pct) {
    var el = $(id);
    if (!el) return;
    el.style.setProperty('--p', String(Math.max(0, Math.min(100, pct || 0))));
  }

  function updateJobMatch() {
    var desc = $('#job-desc').value.trim();
    var box = $('#match-box');
    var matchEl = $('#match-score');
    if (!desc) {
      matchEl.textContent = '—';
      setRing('#match-ring', 0);
      box.innerHTML = '<p class="match-empty">Paste a job description to see matched and missing keywords.</p>';
      return;
    }
    var keys = extractKeywords(desc);
    var blob = resumeTextBlob();
    var hits = [];
    var miss = [];
    keys.forEach(function (k) {
      if (blob.indexOf(k) !== -1) hits.push(k);
      else miss.push(k);
    });
    var pct = keys.length ? Math.round((hits.length / keys.length) * 100) : 0;
    matchEl.textContent = pct + '%';
    setRing('#match-ring', pct);
    box.innerHTML =
      '<p><strong>' + hits.length + '</strong> matched · <strong>' + miss.length + '</strong> missing from top keywords</p>' +
      '<div class="match-tags">' +
        hits.slice(0, 10).map(function (k) { return '<span class="tag-hit">' + esc(k) + '</span>'; }).join('') +
        miss.slice(0, 10).map(function (k) {
          return '<button type="button" class="tag-miss" data-add="' + esc(k) + '" title="Add to skills">+ ' + esc(k) + '</button>';
        }).join('') +
      '</div>' +
      (miss[0]
        ? '<p class="match-tip">Tip: click a missing tag to add it to Skills — only if it is true for you.</p>'
        : '<p class="match-tip match-tip--good">Nice coverage — your CV language aligns with this vacancy.</p>');
  }

  function updateAts() {
    var score = 0;
    var tips = [];
    var name = $('#full-name').value.trim();
    var role = jobTitle();
    var email = $('#email').value.trim();
    var phone = $('#phone').value.trim();
    var summary = $('#summary').value.trim();
    var skills = $('#skills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var exp = collectExp();
    var edu = collectEdu();
    var bullets = exp.reduce(function (n, e) { return n + e.bullets.length; }, 0);
    var quantified = exp.some(function (e) {
      return e.bullets.some(function (b) { return /\d/.test(b); });
    });

    if (!name && !role && !summary && !exp.length && !skills.length) {
      $('#ats-score').textContent = '0';
      setRing('#ats-ring', 0);
      $('#score-tip').textContent = 'Add your name and target role — we’ll guide you from there.';
      updateJobMatch();
      return;
    }

    if (name) score += 10; else tips.push('Add your full name.');
    if (role) score += 10; else tips.push('Pick a clear target role.');
    if (email) score += 8; else tips.push('Add a professional email.');
    if (phone) score += 5;
    if ($('#location').value.trim()) score += 4;
    if (summary.length > 40) score += 12; else tips.push('Write a summary (40+ characters).');
    if (summary.length > 0 && summary.split(/\s+/).length <= 70) score += 5;
    if (exp.length) score += 12; else tips.push('Add at least one work experience.');
    if (bullets >= 3) score += 10; else tips.push('Add 3+ achievement bullets.');
    if (quantified) score += 10; else tips.push('Quantify impact with numbers (%, #, time).');
    if (edu.length) score += 8; else tips.push('Add education or a certificate.');
    if (skills.length >= 5) score += 8; else tips.push('List at least 5 skills.');
    if ($('#languages').value.trim()) score += 4;
    if (name && (template() === 'compact' || template() === 'classic' || template() === 'minimal')) score += 4;

    score = Math.min(100, score);
    $('#ats-score').textContent = String(score);
    setRing('#ats-ring', score);
    $('#score-tip').textContent = tips[0] || (score >= 85
      ? 'Looking great — download when the preview feels right.'
      : 'Nice progress — a few more details will lift your score.');
    updateJobMatch();
  }

  function placeholderCv(tpl) {
    var ghost =
      '<div class="cv-header"><div><div class="cv-name cv-ghost">Your Name</div>' +
      '<div class="cv-role cv-ghost">Target role appears here</div>' +
      '<div class="cv-meta cv-ghost"><span>email@example.com</span><span>City, Country</span></div></div></div>' +
      '<section class="cv-section"><h3>Summary</h3><p class="cv-ghost">A short professional summary will show here as you type.</p></section>' +
      '<section class="cv-section"><h3>Experience</h3><div class="cv-job"><div class="cv-job-top"><div><div class="cv-job-title cv-ghost">Role title</div><div class="cv-job-org cv-ghost">Organization</div></div><div class="cv-job-dates cv-ghost">Dates</div></div><ul><li class="cv-ghost">Achievement with a number or result</li><li class="cv-ghost">Another concrete win</li></ul></div></section>' +
      '<section class="cv-section"><h3>Education</h3><p class="cv-ghost">Degree · School · Year</p></section>' +
      '<section class="cv-section"><h3>Skills</h3><p class="cv-ghost">Skill one · Skill two · Skill three</p></section>';

    if (tpl === 'sidebar') {
      return '<aside class="cv-side"><div class="cv-header"><div><div class="cv-name cv-ghost">Your Name</div><div class="cv-role cv-ghost">Target role</div><div class="cv-meta cv-ghost"><span>email@example.com</span></div></div></div>' +
        '<section class="cv-section"><h3>Skills</h3><p class="cv-ghost">Skill one · Skill two</p></section></aside>' +
        '<div class="cv-main"><section class="cv-section"><h3>Summary</h3><p class="cv-ghost">Your summary appears here.</p></section>' +
        '<section class="cv-section"><h3>Experience</h3><p class="cv-ghost">Add a role to fill this column.</p></section></div>';
    }
    return ghost;
  }

  function renderPreview() {
    applyAccent();
    var tpl = template();
    var nameRaw = $('#full-name').value.trim();
    var name = nameRaw || 'Your Name';
    var role = jobTitle();
    var meta = [$('#email').value, $('#phone').value, $('#location').value, $('#linkedin').value]
      .map(function (v) { return v.trim(); }).filter(Boolean).map(esc);
    var summary = $('#summary').value.trim();
    var skills = $('#skills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var languages = $('#languages').value.trim();
    var exp = collectExp();
    var edu = collectEdu();
    var photoHtml = photoData ? '<img class="cv-photo" src="' + photoData + '" alt="">' : '';
    var empty = !nameRaw && !role && !summary && !exp.length && !edu.length && !skills.length && !languages && !photoData;

    var root = $('#cv-preview');
    root.className = 'cv cv--' + tpl + (empty ? ' cv--empty' : '');

    if (empty) {
      root.innerHTML = placeholderCv(tpl);
      updateAts();
      return;
    }

    var expHtml = exp.map(function (e) {
      return '<div class="cv-job"><div class="cv-job-top"><div><div class="cv-job-title">' + esc(e.title) + '</div><div class="cv-job-org">' + esc(e.company) + '</div></div><div class="cv-job-dates">' + esc([e.start, e.end].filter(Boolean).join(' – ')) + '</div></div>' +
        (e.bullets.length ? '<ul>' + e.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }).join('');

    var eduHtml = edu.map(function (e) {
      return '<div class="cv-job"><div class="cv-job-top"><div><div class="cv-job-title">' + esc(e.degree) + '</div><div class="cv-job-org">' + esc(e.school) + (e.detail ? ' · ' + esc(e.detail) : '') + '</div></div><div class="cv-job-dates">' + esc(e.year) + '</div></div></div>';
    }).join('');

    var summaryBlock = summary ? '<section class="cv-section"><h3>Summary</h3><p>' + esc(summary) + '</p></section>' : '';
    var expBlock = expHtml ? '<section class="cv-section"><h3>Experience</h3>' + expHtml + '</section>' : '';
    var eduBlock = eduHtml ? '<section class="cv-section"><h3>Education</h3>' + eduHtml + '</section>' : '';
    var skillsBlock = skills.length ? '<section class="cv-section"><h3>Skills</h3><p>' + skills.map(esc).join(' · ') + '</p></section>' : '';
    var langBlock = languages ? '<section class="cv-section"><h3>Languages</h3><p>' + esc(languages) + '</p></section>' : '';
    var headerCore = photoHtml + '<div><div class="cv-name">' + esc(name) + '</div>' + (role ? '<div class="cv-role">' + esc(role) + '</div>' : '') + '<div class="cv-meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div></div>';

    if (tpl === 'sidebar') {
      root.innerHTML = '<aside class="cv-side"><div class="cv-header">' + headerCore + '</div>' + skillsBlock + langBlock + '</aside><div class="cv-main">' + summaryBlock + expBlock + eduBlock + '</div>';
    } else if (tpl === 'compact') {
      root.innerHTML = '<div class="cv-header">' + headerCore + '</div>' + summaryBlock + expBlock + eduBlock +
        (skills.length || languages
          ? '<section class="cv-section"><h3>Skills &amp; languages</h3><p>' +
            [skills.map(esc).join(' · '), languages ? esc(languages) : ''].filter(Boolean).join(' · ') +
            '</p></section>'
          : '');
    } else {
      root.innerHTML = '<div class="cv-header">' + headerCore + '</div>' + summaryBlock + expBlock + eduBlock + skillsBlock + langBlock;
    }
    updateAts();
  }

  function showStep(n) {
    step = n;
    $$('.panel').forEach(function (p) {
      var id = Number(p.getAttribute('data-step'));
      p.hidden = id !== step;
      p.classList.toggle('is-active', id === step);
    });
    $$('.step-tab').forEach(function (t) {
      t.classList.toggle('is-active', Number(t.getAttribute('data-go')) === step);
    });
    $('#btn-back').hidden = step === 1;
    $('#btn-next').textContent = step === total ? 'Done ✓' : 'Continue →';
    if (step !== total) {
      $('#btn-print').classList.remove('is-pulse');
      var pp = $('#btn-print-preview');
      if (pp) pp.classList.remove('is-pulse');
    }
    var bar = $('#steps-bar');
    if (bar) bar.style.width = Math.round((step / total) * 100) + '%';
    renderPreview();
  }

  function bindEntry(card, kind) {
    var select = card.querySelector(kind === 'exp' ? '.exp-title-select' : '.edu-degree-select');
    var input = card.querySelector(kind === 'exp' ? '.exp-title' : '.edu-degree');
    select.addEventListener('change', function () {
      if (select.value && select.value !== 'Custom…') input.value = select.value;
      scheduleSave();
    });
    card.querySelector('.entry-remove').addEventListener('click', function () {
      var list = kind === 'exp' ? '#exp-list' : '#edu-list';
      if ($$(list + ' .entry-card').length > 1) {
        card.remove();
        scheduleSave();
      }
    });
    $$('input, textarea, select', card).forEach(function (el) {
      el.addEventListener('input', scheduleSave);
      el.addEventListener('change', scheduleSave);
    });
  }

  function addExp(data) {
    var node = $('#tpl-exp').content.cloneNode(true);
    var card = node.querySelector('.entry-card');
    bindEntry(card, 'exp');
    if (data) {
      card.querySelector('.exp-title').value = data.title || '';
      card.querySelector('.exp-company').value = data.company || '';
      card.querySelector('.exp-start').value = data.start || '';
      card.querySelector('.exp-end').value = data.end || '';
      card.querySelector('.exp-bullets').value = (data.bullets || []).join('\n');
    }
    $('#exp-list').appendChild(node);
  }

  function addEdu(data) {
    var node = $('#tpl-edu').content.cloneNode(true);
    var card = node.querySelector('.entry-card');
    bindEntry(card, 'edu');
    if (data) {
      card.querySelector('.edu-degree').value = data.degree || '';
      card.querySelector('.edu-school').value = data.school || '';
      card.querySelector('.edu-year').value = data.year || '';
      card.querySelector('.edu-detail').value = data.detail || '';
    }
    $('#edu-list').appendChild(node);
  }

  function refreshBulletChips() {
    var pack = BULLET_PACKS[$('#bullet-pack').value] || [];
    var row = $('#bullet-suggestions');
    row.innerHTML = '';
    pack.forEach(function (text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = text.length > 54 ? text.slice(0, 54) + '…' : text;
      btn.title = text;
      btn.addEventListener('click', function () {
        var first = $('#exp-list .entry-card .exp-bullets');
        if (!first) return;
        var cur = first.value.trim();
        if (cur.split(/\n+/).map(function (l) { return l.trim(); }).indexOf(text) !== -1) return;
        first.value = cur ? (cur + '\n' + text) : text;
        scheduleSave();
      });
      row.appendChild(btn);
    });
  }

  function suggestSummary() {
    var first = ($('#full-name').value || 'Professional').trim().split(/\s+/)[0];
    var role = jobTitle() || 'specialist';
    var tone = $('#summary-tone').value;
    var map = {
      impact: first + ' is a results-driven ' + role + ' who turns complex work into clear progress. Trusted to deliver measurable outcomes, align partners, and keep teams focused on priorities that matter.',
      warm: first + ' is a collaborative ' + role + ' who brings people together around shared goals. Strong at listening, clarifying next steps, and building practical solutions teams actually use.',
      technical: first + ' is a detail-oriented ' + role + ' with a track record of structuring information, improving workflows, and delivering reliable outputs under tight timelines.',
      leadership: first + ' is a strategic ' + role + ' who aligns people, process, and priorities. Experienced guiding initiatives from idea to delivery while coaching others along the way.'
    };
    $('#summary').value = map[tone] || map.impact;
    scheduleSave();
  }

  function draftCover() {
    var name = ($('#full-name').value || 'Candidate').trim();
    var role = jobTitle() || 'the role';
    var summary = ($('#summary').value || '').trim();
    var skills = $('#skills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
    $('#cover').value =
      'Dear Hiring Manager,\n\n' +
      'I am writing to express my interest in the ' + role + ' opportunity. ' +
      (summary ? summary + ' ' : '') +
      (skills.length ? 'I bring strengths in ' + skills.join(', ').toLowerCase() + '. ' : '') +
      'I would welcome the chance to contribute to your team and bring practical, reliable delivery to the work ahead.\n\n' +
      'Thank you for your consideration.\n\n' +
      'Kind regards,\n' + name;
    scheduleSave();
  }

  function serialize() {
    return {
      template: template(),
      accent: accent(),
      photoData: photoData && photoData.length < 450000 ? photoData : '',
      fullName: $('#full-name').value,
      jobTitle: jobTitle(),
      email: $('#email').value,
      phone: $('#phone').value,
      location: $('#location').value,
      linkedin: $('#linkedin').value,
      summaryTone: $('#summary-tone').value,
      summary: $('#summary').value,
      skills: $('#skills').value,
      languages: $('#languages').value,
      jobDesc: $('#job-desc').value,
      cover: $('#cover').value,
      bulletPack: $('#bullet-pack').value,
      exp: collectExp(),
      edu: collectEdu()
    };
  }

  function applyData(data) {
    if (!data) return;
    var radio = $('input[name="template"][value="' + (data.template || 'classic') + '"]');
    if (radio) radio.checked = true;
    var accRadio = $('input[name="accent"][value="' + (data.accent || '#2f6f8f') + '"]');
    if (accRadio) accRadio.checked = true;
    photoData = data.photoData || '';
    var img = $('#photo-preview');
    if (photoData) {
      img.src = photoData;
      img.classList.remove('is-empty');
      $('#photo-clear').hidden = false;
    } else {
      img.removeAttribute('src');
      img.classList.add('is-empty');
      $('#photo-clear').hidden = true;
    }
    $('#full-name').value = data.fullName || '';
    var savedTitle = data.jobTitle || '';
    if (savedTitle === 'Other (type below)' && data.jobTitleCustom) savedTitle = data.jobTitleCustom;
    $('#job-title').value = savedTitle;
    $('#email').value = data.email || '';
    $('#phone').value = data.phone || '';
    $('#location').value = data.location || '';
    $('#linkedin').value = data.linkedin || '';
    $('#summary-tone').value = data.summaryTone || 'impact';
    $('#summary').value = data.summary || '';
    $('#skills').value = data.skills || '';
    $('#languages').value = data.languages || '';
    $('#job-desc').value = data.jobDesc || '';
    $('#cover').value = data.cover || '';
    if (data.bulletPack) $('#bullet-pack').value = data.bulletPack;
    $('#exp-list').innerHTML = '';
    $('#edu-list').innerHTML = '';
    (data.exp && data.exp.length ? data.exp : [{}]).forEach(addExp);
    (data.edu && data.edu.length ? data.edu : [{}]).forEach(addEdu);
    refreshBulletChips();
    renderPreview();
  }

  function scheduleSave() {
    renderPreview();
    $('#autosave').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
        $('#autosave').textContent = 'Saved on this device';
      } catch (e) {
        try {
          var slim = serialize();
          slim.photoData = '';
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
          $('#autosave').textContent = 'Saved (photo too large for storage)';
        } catch (e2) {
          $('#autosave').textContent = 'Preview only';
        }
      }
    }, 280);
  }

  function loadExample() {
    applyData({
      template: 'modern',
      accent: '#0f766e',
      fullName: 'Gaelle El Ters',
      jobTitle: 'Communications Officer',
      email: 'gaelle@example.com',
      phone: '+961 00 000 000',
      location: 'Beirut, Lebanon',
      linkedin: 'https://linkedin.com/in/example',
      summaryTone: 'impact',
      summary: 'Gaelle is a results-driven Communications Officer who turns complex work into clear progress. Trusted to deliver measurable outcomes, align partners, and keep teams focused on priorities that matter.',
      skills: 'Media relations, Content writing, Stakeholder engagement, Social media, Crisis communications, Excel',
      languages: 'Arabic (native), English (fluent), French (intermediate)',
      exp: [{
        title: 'Communications Officer',
        company: 'Humanitarian organization',
        start: 'Jan 2022',
        end: 'Present',
        bullets: [
          'Drafted and published weekly updates reaching 5,000+ stakeholders',
          'Led media outreach that secured coverage in 8 national outlets',
          'Created social content calendars that grew engagement by 35%'
        ]
      }],
      edu: [{
        degree: 'Bachelor of Arts',
        school: 'Example University',
        year: '2019',
        detail: 'Communications'
      }]
    });
  }

  // Events
  $$('.step-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { showStep(Number(tab.getAttribute('data-go'))); });
  });
  function downloadPdf(btn) {
    if (btn) btn.classList.remove('is-pulse');
    var cv = $('#cv-preview');
    var savedZoom = cv ? cv.style.zoom : '';
    renderPreview();
    applyAccent();
    if (cv) cv.style.zoom = '1';
    document.documentElement.classList.add('is-printing');
    function restore() {
      document.documentElement.classList.remove('is-printing');
      if (cv) cv.style.zoom = savedZoom || String(ZOOMS[zoomIdx]);
      window.removeEventListener('afterprint', restore);
    }
    window.addEventListener('afterprint', restore);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { window.print(); });
    });
  }

  $$('input[name="template"], input[name="accent"]').forEach(function (el) {
    el.addEventListener('change', scheduleSave);
    el.addEventListener('input', scheduleSave);
  });

  $('#btn-back').addEventListener('click', function () { if (step > 1) showStep(step - 1); });
  $('#btn-next').addEventListener('click', function () {
    if (step < total) {
      showStep(step + 1);
      return;
    }
    $('#btn-print').classList.add('is-pulse');
    var ppDone = $('#btn-print-preview');
    if (ppDone) ppDone.classList.add('is-pulse');
    $('#score-tip').textContent = 'Ready — click Download PDF, then choose “Save as PDF” in the print dialog.';
    $('#btn-print').focus();
  });
  $('#btn-print').addEventListener('click', function () { downloadPdf(this); });
  var printPreview = $('#btn-print-preview');
  if (printPreview) printPreview.addEventListener('click', function () { downloadPdf(this); });
  $('#btn-suggest-summary').addEventListener('click', suggestSummary);
  $('#btn-cover').addEventListener('click', draftCover);
  $('#btn-add-exp').addEventListener('click', function () { addExp(); scheduleSave(); });
  $('#btn-add-edu').addEventListener('click', function () { addEdu(); scheduleSave(); });
  $('#bullet-pack').addEventListener('change', refreshBulletChips);

  $('#match-box').addEventListener('click', function (e) {
    var btn = e.target.closest('.tag-miss');
    if (!btn) return;
    addSkillTerm(btn.getAttribute('data-add'));
  });

  $('#photo-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var raw = String(reader.result || '');
      // Keep preview usable even for large images; storage may drop photo later
      photoData = raw;
      $('#photo-preview').src = photoData;
      $('#photo-preview').classList.remove('is-empty');
      $('#photo-clear').hidden = false;
      scheduleSave();
    };
    reader.readAsDataURL(file);
  });
  $('#photo-clear').addEventListener('click', function () {
    photoData = '';
    $('#photo-preview').removeAttribute('src');
    $('#photo-preview').classList.add('is-empty');
    $('#photo-input').value = '';
    this.hidden = true;
    scheduleSave();
  });

  $('#skill-pack').addEventListener('change', function () {
    var pack = SKILL_PACKS[this.value] || [];
    var row = $('#skill-suggestions');
    row.innerHTML = '';
    pack.forEach(function (skill) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = '+ ' + skill;
      btn.addEventListener('click', function () {
        addSkillTerm(skill);
      });
      row.appendChild(btn);
    });
  });

  document.addEventListener('input', function (e) {
    if (e.target.closest('.editor')) scheduleSave();
  });
  document.addEventListener('change', function (e) {
    if (e.target.closest('.editor')) scheduleSave();
  });

  // Preview zoom
  var ZOOMS = [0.55, 0.65, 0.75, 0.9, 1, 1.15, 1.3];
  var zoomIdx = 1;
  function applyZoom() {
    var cv = $('#cv-preview');
    if (cv) cv.style.zoom = String(ZOOMS[zoomIdx]);
    var label = $('#zoom-level');
    if (label) label.textContent = Math.round(ZOOMS[zoomIdx] * 100) + '%';
  }
  var zoomOut = $('#zoom-out');
  var zoomIn = $('#zoom-in');
  if (zoomOut) zoomOut.addEventListener('click', function () {
    if (zoomIdx > 0) { zoomIdx--; applyZoom(); }
  });
  if (zoomIn) zoomIn.addEventListener('click', function () {
    if (zoomIdx < ZOOMS.length - 1) { zoomIdx++; applyZoom(); }
  });

  // Mobile edit/preview switch
  $$('.view-switch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var showPreview = btn.getAttribute('data-view') === 'preview';
      $('#studio').classList.toggle('is-preview', showPreview);
      $$('.view-switch button').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
    });
  });

  // Init
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) applyData(saved);
    else {
      addExp();
      addEdu();
      refreshBulletChips();
      renderPreview();
    }
  } catch (e) {
    addExp();
    addEdu();
    refreshBulletChips();
    renderPreview();
  }
  showStep(1);
  applyZoom();
})();
