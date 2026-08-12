(function () {
  'use strict';

  var CONTACT_EMAIL = 'info@gaelleelters.com';
  var CONTACT_API = '/api/contact';

  var FAQ = {
    start: {
      bot: 'Hi! I can answer quick questions about the tools here. Pick a topic or type your question below.',
      options: [
        { id: 'tools', label: 'How do the tools work?' },
        { id: 'privacy', label: 'Is my data stored anywhere?' },
        { id: 'mailmass', label: 'Help with Mail Mass' },
        { id: 'cv', label: 'Help with the CV generator' },
        { id: 'custom', label: 'Something else' }
      ]
    },
    tools: {
      bot: 'Open Projects from the menu, pick a tool, and launch it. Everything runs in your browser. No account needed. Your files stay on your device.',
      options: [
        { id: 'start', label: 'Ask something else' },
        { id: 'email', label: 'Email Gaelle instead' }
      ]
    },
    privacy: {
      bot: 'Your files are processed locally in your browser. Nothing is uploaded to a server unless a tool explicitly asks you to sign in (for example Mail Mass with your own Outlook).',
      options: [
        { id: 'start', label: 'Ask something else' },
        { id: 'email', label: 'Email Gaelle instead' }
      ]
    },
    mailmass: {
      bot: "Mail Mass runs on each person's own computer. They click Connect Outlook, open the small connector file, then send — mail leaves from THEIR Outlook only. No shared mailbox.",
      options: [
        { id: 'start', label: 'Ask something else' },
        { id: 'email', label: 'Email Gaelle instead' }
      ]
    },
    cv: {
      bot: 'The CV generator walks you through templates step by step. Fill in your details, preview live, then download as PDF, free and with no paywall.',
      options: [
        { id: 'start', label: 'Ask something else' },
        { id: 'email', label: 'Email Gaelle instead' }
      ]
    },
    custom: {
      bot: 'For anything specific, like a new tool idea, a bug, or a partnership, email is best and I read every message.',
      options: [
        { id: 'email', label: 'Open email to ' + CONTACT_EMAIL },
        { id: 'start', label: 'Back to questions' }
      ]
    }
  };

  var botRoot = document.getElementById('help-bot');
  var toggleBtn = document.getElementById('help-bot-toggle');
  var closeBtn = document.getElementById('help-bot-close');
  var backdrop = document.getElementById('help-bot-backdrop');
  var panel = document.getElementById('help-bot-panel');
  var messagesEl = document.getElementById('help-bot-messages');
  var optionsEl = document.getElementById('help-bot-options');
  var form = document.getElementById('help-bot-form');
  var input = document.getElementById('help-bot-input');
  var replyEmailInput = document.getElementById('help-bot-reply-email');
  var honeypotInput = document.getElementById('help-bot-website');
  var sendBtn = document.getElementById('help-bot-send');

  if (!botRoot || !toggleBtn || !panel || !messagesEl || !optionsEl || !form || !input) return;

  var isOpen = false;
  var isSending = false;

  function scrollMessages() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(text, role) {
    var bubble = document.createElement('div');
    bubble.className = 'help-bot-msg help-bot-msg--' + role;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    scrollMessages();
  }

  function renderOptions(options) {
    optionsEl.innerHTML = '';
    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'help-bot-option' + (opt.id === 'email' ? ' help-bot-option--mail' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleOption(opt);
      });
      optionsEl.appendChild(btn);
    });
  }

  function showStep(stepId, userLabel) {
    if (userLabel) addMessage(userLabel, 'user');
    var step = FAQ[stepId];
    if (!step) return;
    addMessage(step.bot, 'bot');
    renderOptions(step.options);
  }

  function resetChat() {
    messagesEl.innerHTML = '';
    showStep('start');
  }

  function matchFaqTopic(lower) {
    if (/mail mass|outlook|merge/.test(lower)) return 'mailmass';
    if (/cv|resume|curriculum/.test(lower)) return 'cv';
    if (/data|privacy|upload|store|safe/.test(lower)) return 'privacy';
    if (/tool|how|work|whatsapp|excel/.test(lower)) return 'tools';
    return null;
  }

  function setSending(sending) {
    isSending = sending;
    if (sendBtn) sendBtn.disabled = sending;
    if (input) input.disabled = sending;
    if (replyEmailInput) replyEmailInput.disabled = sending;
  }

  function forwardQuestion(question, replyEmail) {
    return fetch(CONTACT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        replyEmail: replyEmail || '',
        page: window.location.href,
        website: honeypotInput ? honeypotInput.value : ''
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
    });
  }

  function handleOption(opt) {
    if (opt.id === 'email') {
      addMessage(opt.label, 'user');
      addMessage('Opening your email app…', 'bot');
      window.location.href = 'mailto:' + CONTACT_EMAIL;
      renderOptions(FAQ.custom.options);
      return;
    }
    if (opt.id === 'start') {
      resetChat();
      return;
    }
    showStep(opt.id, opt.label);
  }

  function handleTypedQuestion(text) {
    var question = text.trim();
    if (!question || isSending) return;

    var replyEmail = replyEmailInput ? replyEmailInput.value.trim() : '';
    var faqTopic = matchFaqTopic(question.toLowerCase());

    addMessage(question, 'user');
    input.value = '';
    setSending(true);

    var sendingBubble = document.createElement('div');
    sendingBubble.className = 'help-bot-msg help-bot-msg--bot';
    sendingBubble.textContent = 'Sending your question…';
    messagesEl.appendChild(sendingBubble);
    scrollMessages();

    function clearSendingBubble() {
      if (sendingBubble.parentNode) {
        sendingBubble.parentNode.removeChild(sendingBubble);
      }
    }

    forwardQuestion(question, replyEmail).then(function () {
      clearSendingBubble();

      if (faqTopic) {
        addMessage(FAQ[faqTopic].bot, 'bot');
        addMessage('Your question was also sent to Gaelle.', 'bot');
        renderOptions(FAQ[faqTopic].options);
        return;
      }

      addMessage('Thanks! Your question was sent to Gaelle. She\'ll reply by email if you left your address.', 'bot');
      renderOptions(FAQ.custom.options);
    }).catch(function (err) {
      clearSendingBubble();

      if (faqTopic) {
        addMessage(FAQ[faqTopic].bot, 'bot');
        addMessage('I couldn\'t forward this to email right now. Use the email button below if you need a reply.', 'bot');
        renderOptions(FAQ[faqTopic].options);
        return;
      }

      addMessage('Couldn\'t send your question right now. Try the email button below.', 'bot');
      renderOptions(FAQ.custom.options);
    }).finally(function () {
      setSending(false);
    });
  }

  function openBot() {
    isOpen = true;
    panel.classList.remove('is-hidden');
    if (backdrop) {
      backdrop.classList.remove('is-hidden');
      backdrop.classList.add('is-visible');
      backdrop.setAttribute('aria-hidden', 'false');
    }
    toggleBtn.setAttribute('aria-expanded', 'true');
    if (messagesEl.childElementCount === 0) {
      resetChat();
    }
    input.focus();
  }

  function closeBot() {
    isOpen = false;
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

  closeBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    closeBot();
  });

  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      e.stopPropagation();
      closeBot();
    });
  }

  panel.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopPropagation();
    handleTypedQuestion(input.value);
  });

  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
  });

  if (replyEmailInput) {
    replyEmailInput.addEventListener('keydown', function (e) {
      e.stopPropagation();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      e.stopPropagation();
      closeBot();
    }
  });

  window.openHelpBot = openBot;
})();
