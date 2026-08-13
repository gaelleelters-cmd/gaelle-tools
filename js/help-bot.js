(function () {
  'use strict';

  var CONTACT_API = '/api/contact';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var botRoot = document.getElementById('help-bot');
  var toggleBtn = document.getElementById('help-bot-toggle');
  var closeBtn = document.getElementById('help-bot-close');
  var backdrop = document.getElementById('help-bot-backdrop');
  var panel = document.getElementById('help-bot-panel');
  var form = document.getElementById('ask-form');
  var fieldsWrap = document.getElementById('ask-form-fields');
  var nameInput = document.getElementById('ask-name');
  var emailInput = document.getElementById('ask-email');
  var messageInput = document.getElementById('ask-message');
  var honeypotInput = document.getElementById('ask-website');
  var startedInput = document.getElementById('ask-started');
  var submitBtn = document.getElementById('ask-submit');
  var statusEl = document.getElementById('ask-form-status');

  if (!botRoot || !toggleBtn || !panel) return;

  var isOpen = false;
  var startedAt = Date.now();
  var isSending = false;
  var isSent = false;

  if (startedInput) startedInput.value = String(startedAt);

  function openBot() {
    isOpen = true;
    botRoot.classList.add('is-open');
    panel.classList.remove('is-hidden');
    if (backdrop) {
      backdrop.classList.remove('is-hidden');
      backdrop.classList.add('is-visible');
      backdrop.setAttribute('aria-hidden', 'false');
    }
    toggleBtn.setAttribute('aria-expanded', 'true');
    if (closeBtn) closeBtn.focus();
  }

  function closeBot() {
    isOpen = false;
    botRoot.classList.remove('is-open');
    panel.classList.add('is-hidden');
    if (backdrop) {
      backdrop.classList.add('is-hidden');
      backdrop.classList.remove('is-visible');
      backdrop.setAttribute('aria-hidden', 'true');
    }
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) closeBot();
    else openBot();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeBot();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      e.stopPropagation();
      closeBot();
    });
  }

  panel.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      e.stopPropagation();
      closeBot();
    }
  });

  window.openHelpBot = openBot;

  document.querySelectorAll('.ask-item').forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      document.querySelectorAll('.ask-item[open]').forEach(function (openItem) {
        if (openItem !== item) openItem.removeAttribute('open');
      });
    });
  });

  if (!form) return;

  function setFieldError(input, message) {
    var field = input.closest('.ask-field');
    var errorId = input.id + '-error';
    var errorEl = document.getElementById(errorId);
    if (field) field.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (errorEl) {
      errorEl.hidden = !message;
      errorEl.textContent = message || '';
    }
  }

  function showStatus(type, message) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.className = 'ask-form-status' + (type ? ' is-' + type : '');
    statusEl.textContent = message || '';
  }

  function setSending(sending) {
    isSending = sending;
    if (submitBtn) {
      submitBtn.disabled = sending || isSent;
      submitBtn.setAttribute('aria-busy', sending ? 'true' : 'false');
      if (!isSent) submitBtn.textContent = sending ? 'Sending…' : 'Send Question';
    }
    [nameInput, emailInput, messageInput].forEach(function (el) {
      if (el) el.disabled = sending || isSent;
    });
  }

  function validate() {
    var valid = true;
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var question = messageInput.value.trim();

    if (!name) {
      setFieldError(nameInput, 'Please enter your name.');
      valid = false;
    } else if (name.length < 2) {
      setFieldError(nameInput, 'Please enter your full name.');
      valid = false;
    } else {
      setFieldError(nameInput, '');
    }

    if (!email) {
      setFieldError(emailInput, 'Please enter your email address.');
      valid = false;
    } else if (!EMAIL_RE.test(email)) {
      setFieldError(emailInput, 'Please enter a valid email address.');
      valid = false;
    } else {
      setFieldError(emailInput, '');
    }

    if (!question) {
      setFieldError(messageInput, 'Please enter your question or message.');
      valid = false;
    } else if (question.length < 10) {
      setFieldError(messageInput, 'Please add a little more detail so I can reply usefully.');
      valid = false;
    } else {
      setFieldError(messageInput, '');
    }

    return valid;
  }

  [nameInput, emailInput, messageInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      if (el.getAttribute('aria-invalid') === 'true') setFieldError(el, '');
      if (statusEl && statusEl.classList.contains('is-error')) showStatus('', '');
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (isSending || isSent) return;
    showStatus('', '');
    if (!validate()) {
      var firstInvalid = form.querySelector('.ask-field.is-invalid input, .ask-field.is-invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    setSending(true);

    fetch(CONTACT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        question: messageInput.value.trim(),
        page: window.location.href,
        website: honeypotInput ? honeypotInput.value : '',
        startedAt: startedInput ? startedInput.value : String(startedAt)
      })
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: 'Unexpected server response.' };
      }).then(function (data) {
        if (!res.ok || !data.ok) {
          var err = new Error((data && data.error) || 'Could not send your question.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }).then(function () {
      isSent = true;
      if (fieldsWrap) fieldsWrap.hidden = true;
      showStatus('success', 'Thank you. Your question has been sent. I will get back to you by email.');
      setSending(false);
      if (statusEl) statusEl.scrollIntoView({ block: 'nearest' });
    }).catch(function (err) {
      var tooMany = err && err.status === 429;
      var failedFetch = err && (err.name === 'TypeError' || /failed to fetch|networkerror|unexpected server/i.test(String(err.message || '')));
      showStatus(
        'error',
        tooMany
          ? 'Too many questions were sent just now. Please wait a few minutes and try again.'
          : failedFetch
            ? 'Could not send your question right now. Please try again, or email info@gaelleelters.com.'
            : (err && err.message) || 'Could not send your question. Please try again, or email info@gaelleelters.com.'
      );
      setSending(false);
      if (statusEl) statusEl.scrollIntoView({ block: 'nearest' });
    });
  });
})();
