(function attachCvLogic(globalScope) {
  'use strict';

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
    minimum:1, least:1, plus:1, etcetera:1, description:1, summary:1, equal:1,
    employer:1, join:1, joins:1, we:1, us:1, be:1, been:1, being:1, do:1, does:1, did:1, done:1,
    make:1, makes:1, made:1, get:1, gets:1, help:1, helps:1, need:1, needs:1, like:1, likes:1,
    should:1, would:1, could:1, shall:1, onto:1, upon:1, per:1, via:1, both:1, each:1, every:1,
    new:1, current:1, full:1, time:1, part:1, type:1, level:1, company:1, organization:1,
    organisation:1, office:1, location:1, successful:1, success:1, excellent:1, proven:1, track:1,
    record:1, demonstrate:1, demonstrated:1, demonstrating:1, knowledge:1, understanding:1,
    capacity:1, willing:1, willingness:1, committed:1, commitment:1, passion:1,
    passionate:1, ideal:1, strategy:1, strategies:1,
    programme:1, programmes:1, program:1, programs:1, officer:1, officers:1,
    needed:1, requires:1
  };

  var KNOWN_PHRASES = [
    'media relations', 'content writing', 'stakeholder engagement', 'crisis communications',
    'donor reporting', 'social media', 'public speaking', 'project management', 'data analysis',
    'data visualization', 'needs assessment', 'partner coordination', 'field monitoring',
    'protection principles', 'monitoring and evaluation', 'monitoring & evaluation',
    'communications officer', 'programme associate', 'power bi', 'microsoft excel',
    'humanitarian programmes', 'humanitarian programs', 'report writing', 'strategic communications',
    'brand storytelling', 'press releases', 'community engagement', 'capacity building'
  ];

  function mixAccent(hex, ratio) {
    var h = String(hex || '#2f6f8f').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#1a455c';
    return 'rgb(' + Math.round(r * ratio) + ',' + Math.round(g * ratio) + ',' + Math.round(b * ratio) + ')';
  }

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

  function scoreAts(data) {
    var score = 0;
    var tips = [];
    var name = String(data.fullName || '').trim();
    var role = String(data.jobTitle || '').trim();
    var email = String(data.email || '').trim();
    var phone = String(data.phone || '').trim();
    var summary = String(data.summary || '').trim();
    var skills = Array.isArray(data.skills) ? data.skills.filter(Boolean) : [];
    var exp = Array.isArray(data.exp) ? data.exp : [];
    var edu = Array.isArray(data.edu) ? data.edu : [];
    var bullets = exp.reduce(function (n, e) {
      return n + (Array.isArray(e.bullets) ? e.bullets.length : 0);
    }, 0);
    var quantified = exp.some(function (e) {
      return (e.bullets || []).some(function (b) { return /\d/.test(b); });
    });
    var template = data.template || 'classic';

    if (!name && !role && !summary && !exp.length && !skills.length) {
      return { score: 0, tips: ['Add your name and target role — we’ll guide you from there.'] };
    }

    if (name) score += 10; else tips.push('Add your full name.');
    if (role) score += 10; else tips.push('Pick a clear target role.');
    if (email) score += 8; else tips.push('Add a professional email.');
    if (phone) score += 5;
    if (String(data.location || '').trim()) score += 4;
    if (summary.length > 40) score += 12; else tips.push('Write a summary (40+ characters).');
    if (summary.length > 0 && summary.split(/\s+/).length <= 70) score += 5;
    if (exp.length) score += 12; else tips.push('Add at least one work experience.');
    if (bullets >= 3) score += 10; else tips.push('Add 3+ achievement bullets.');
    if (quantified) score += 10; else tips.push('Quantify impact with numbers (%, #, time).');
    if (edu.length) score += 8; else tips.push('Add education or a certificate.');
    if (skills.length >= 5) score += 8; else tips.push('List at least 5 skills.');
    if (String(data.languages || '').trim()) score += 4;
    if (name && (template === 'compact' || template === 'classic' || template === 'minimal')) score += 4;

    return { score: Math.min(100, score), tips: tips };
  }

  function matchJob(jobDescription, resumeBlob) {
    var keys = extractKeywords(jobDescription);
    var blob = String(resumeBlob || '').toLowerCase();
    var hits = [];
    var miss = [];
    keys.forEach(function (k) {
      if (blob.indexOf(k) !== -1) hits.push(k);
      else miss.push(k);
    });
    var percent = keys.length ? Math.round((hits.length / keys.length) * 100) : 0;
    return { keys: keys, hits: hits, miss: miss, percent: percent };
  }

  var api = {
    mixAccent: mixAccent,
    extractKeywords: extractKeywords,
    scoreAts: scoreAts,
    matchJob: matchJob
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CvLogic: api };
  }
  globalScope.CvLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
