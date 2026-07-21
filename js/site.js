(function () {
  'use strict';

  var home = document.getElementById('home');
  var workspace = document.getElementById('workspace');
  var frame = document.getElementById('app-frame');
  var title = document.getElementById('stage-title');
  var openNew = document.getElementById('open-new');
  var backBtn = document.getElementById('back-home');
  var menu = document.getElementById('work-menu');
  var menuBtn = document.getElementById('work-menu-btn');
  var menuPanel = document.getElementById('work-menu-panel');
  var workTools = document.getElementById('work-tools');
  var generator = document.getElementById('generator');

  function hidePanels() {
    if (workTools) workTools.classList.add('is-hidden');
    if (generator) generator.classList.add('is-hidden');
  }

  function showHome() {
    home.classList.remove('is-hidden');
    workspace.classList.add('is-hidden');
    workspace.setAttribute('aria-hidden', 'true');
    frame.src = 'about:blank';
    document.body.style.overflow = '';
    hidePanels();
    closeMenu();
    history.replaceState({ view: 'home' }, '', location.pathname + location.search);
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

  function closeMenu() {
    if (!menuBtn || !menuPanel) return;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuPanel.hidden = true;
  }

  function openMenu() {
    if (!menuBtn || !menuPanel) return;
    menuBtn.setAttribute('aria-expanded', 'true');
    menuPanel.hidden = false;
  }

  function toggleMenu() {
    if (!menuPanel) return;
    if (menuPanel.hidden) openMenu();
    else closeMenu();
  }

  function showPanel(panelId) {
    hidePanels();
    var target = document.getElementById(panelId);
    if (!target) return;
    target.classList.remove('is-hidden');
    closeMenu();
    history.replaceState({ view: 'home', panel: panelId }, '', '#' + panelId);
    setTimeout(function () {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });
  }

  if (menuPanel) {
    menuPanel.querySelectorAll('[data-panel]').forEach(function (item) {
      item.addEventListener('click', function () {
        showPanel(item.getAttribute('data-panel'));
      });
    });
  }

  document.addEventListener('click', function (e) {
    if (!menu) return;
    if (!menu.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  document.querySelectorAll('.tool-panel').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openTool(btn.getAttribute('data-src'), btn.getAttribute('data-label'));
    });
  });

  backBtn.addEventListener('click', showHome);

  // Landing page starts clean — tools only after menu choice (not from old URL hash)
  hidePanels();
  if (location.hash === '#work-tools' || location.hash === '#generator') {
    history.replaceState({ view: 'home' }, '', location.pathname + location.search);
  }
})();
