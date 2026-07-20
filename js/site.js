(function () {
  'use strict';

  var home = document.getElementById('home');
  var workspace = document.getElementById('workspace');
  var frame = document.getElementById('app-frame');
  var title = document.getElementById('stage-title');
  var openNew = document.getElementById('open-new');
  var backBtn = document.getElementById('back-home');

  function showHome() {
    home.classList.remove('is-hidden');
    workspace.classList.add('is-hidden');
    workspace.setAttribute('aria-hidden', 'true');
    frame.src = 'about:blank';
    document.body.style.overflow = '';
    history.replaceState({ view: 'home' }, '', '#');
  }

  function openTool(src, label) {
    title.textContent = label;
    openNew.href = src;
    frame.title = label;
    frame.src = src;
    home.classList.add('is-hidden');
    workspace.classList.remove('is-hidden');
    workspace.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    history.replaceState({ view: 'tool', src: src, label: label }, '', '#' + encodeURIComponent(label));
    if (label === 'Mail Mass') {
      try {
        var wake = document.createElement('iframe');
        wake.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
        wake.src = 'mailmass://start';
        document.body.appendChild(wake);
        setTimeout(function () { try { wake.remove(); } catch (e) {} }, 3000);
      } catch (e) {}
    }
  }

  document.querySelectorAll('.tool-panel').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openTool(btn.getAttribute('data-src'), btn.getAttribute('data-label'));
    });
  });

  backBtn.addEventListener('click', showHome);

  var hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (hash && hash !== 'tools') {
    var match = Array.prototype.find.call(document.querySelectorAll('.tool-panel'), function (btn) {
      return btn.getAttribute('data-label') === hash;
    });
    if (match) {
      openTool(match.getAttribute('data-src'), match.getAttribute('data-label'));
    }
  }
})();
