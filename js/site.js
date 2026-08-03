(function () {
  'use strict';

  var topNav = document.getElementById('top-nav');
  var progressBar = document.getElementById('scroll-progress-bar');

  /* ----- Smooth scroll for [data-scroll] links (hash links only) ----- */
  document.querySelectorAll('a[data-scroll]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', href);
    });
  });

  /* ----- Nav scrolled state + progress bar ----- */
  function onScroll() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (topNav) topNav.classList.toggle('is-scrolled', scrollTop > 12);
    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = max > 0 ? (scrollTop / max) * 100 + '%' : '0%';
    }
    updateActiveLink();
  }

  /* ----- Active nav link based on section in view ----- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.top-nav-links a[data-scroll]'));
  var sections = navLinks
    .map(function (link) {
      var href = link.getAttribute('href');
      return href && href.charAt(0) === '#' ? document.querySelector(href) : null;
    })
    .filter(Boolean);

  function updateActiveLink() {
    var fromTop = window.scrollY + window.innerHeight * 0.35;
    var current = null;
    sections.forEach(function (section) {
      if (section.offsetTop <= fromTop) current = section;
    });
    navLinks.forEach(function (link) {
      link.classList.toggle('is-active', !!current && link.getAttribute('href') === '#' + current.id);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ----- Reveal on scroll ----- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) { observer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ----- About stats count-up on scroll ----- */
  var statsBlock = document.querySelector('.about-stats');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setStatValue(el, value) {
    var suffix = el.getAttribute('data-suffix') || '';
    el.textContent = String(value) + suffix;
  }

  function animateStat(el, duration, delay) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;

    if (reducedMotion) {
      setStatValue(el, target);
      return;
    }

    window.setTimeout(function () {
      var startTime = null;

      function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
      }

      function tick(now) {
        if (!startTime) startTime = now;
        var progress = Math.min((now - startTime) / duration, 1);
        var value = Math.round(easeOutCubic(progress) * target);
        setStatValue(el, value);
        if (progress < 1) requestAnimationFrame(tick);
        else setStatValue(el, target);
      }

      requestAnimationFrame(tick);
    }, delay || 0);
  }

  function runStatsCountUp() {
    if (!statsBlock || statsBlock.dataset.counted === 'true') return;
    statsBlock.dataset.counted = 'true';
    var nums = statsBlock.querySelectorAll('.about-stat-num[data-count]');
    nums.forEach(function (el, index) {
      animateStat(el, 1400, index * 140);
    });
  }

  if (statsBlock) {
    if ('IntersectionObserver' in window) {
      var statsObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runStatsCountUp();
          statsObserver.unobserve(entry.target);
        });
      }, { threshold: 0.4, rootMargin: '0px 0px -20px 0px' });

      statsObserver.observe(statsBlock);
    } else {
      runStatsCountUp();
    }
  }
})();
