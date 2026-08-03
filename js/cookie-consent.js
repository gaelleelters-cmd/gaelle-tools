(function () {
  'use strict';

  var STORAGE_KEY = 'ge_cookie_consent';
  var CONSENT_VERSION = 1;

  var banner = document.getElementById('cookie-banner');
  var acceptBtn = document.getElementById('cookie-accept');
  var rejectBtn = document.getElementById('cookie-reject');
  var settingsBtns = document.querySelectorAll('[data-cookie-settings]');

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.version !== CONSENT_VERSION) return null;
      if (data.status !== 'accepted' && data.status !== 'rejected') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeConsent(status) {
    var data = {
      version: CONSENT_VERSION,
      status: status,
      ts: Date.now()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* private mode / quota */ }
    return data;
  }

  function showBanner() {
    if (!banner) return;
    banner.hidden = false;
    banner.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-cookie-banner');
  }

  function hideBanner() {
    if (!banner) return;
    banner.hidden = true;
    banner.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-cookie-banner');
  }

  /**
   * Enable scripts marked for analytics consent.
   * Use: <script type="text/plain" data-consent="analytics" src="..."></script>
   * Cloudflare-managed beacons (if any) cannot be gated from site code.
   */
  function enableAnalyticsScripts() {
    var nodes = document.querySelectorAll('script[type="text/plain"][data-consent="analytics"]');
    nodes.forEach(function (node) {
      var script = document.createElement('script');
      if (node.src) {
        script.src = node.src;
      } else {
        script.textContent = node.textContent;
      }
      Array.prototype.forEach.call(node.attributes, function (attr) {
        if (attr.name === 'type' || attr.name === 'data-consent') return;
        if (attr.name === 'src') return;
        script.setAttribute(attr.name, attr.value);
      });
      node.parentNode.insertBefore(script, node);
      node.parentNode.removeChild(node);
    });
  }

  function applyConsent(data) {
    if (!data) return;
    if (data.status === 'accepted') {
      enableAnalyticsScripts();
      document.documentElement.setAttribute('data-consent', 'accepted');
    } else {
      document.documentElement.setAttribute('data-consent', 'rejected');
    }
    try {
      window.dispatchEvent(new CustomEvent('ge:consent', { detail: data }));
    } catch (e) { /* older browsers */ }
  }

  function choose(status) {
    var data = writeConsent(status);
    hideBanner();
    applyConsent(data);
  }

  function openSettings() {
    showBanner();
    if (acceptBtn) acceptBtn.focus();
  }

  window.GEConsent = {
    get: readConsent,
    open: openSettings,
    accept: function () { choose('accepted'); },
    reject: function () { choose('rejected'); }
  };

  if (acceptBtn) {
    acceptBtn.addEventListener('click', function () { choose('accepted'); });
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', function () { choose('rejected'); });
  }
  settingsBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openSettings();
    });
  });

  var existing = readConsent();
  if (existing) {
    hideBanner();
    applyConsent(existing);
  } else {
    showBanner();
  }
})();
