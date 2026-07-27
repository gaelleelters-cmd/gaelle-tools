(function () {
  'use strict';
  if (window.location.search.indexOf('embed=1') >= 0 || window.self !== window.top) {
    document.documentElement.classList.add('is-embed');
  }
})();
