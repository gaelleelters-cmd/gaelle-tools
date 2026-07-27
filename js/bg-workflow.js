(function () {
  'use strict';

  var canvas = document.getElementById('workflow-canvas');
  if (!canvas) return;

  var workspace = document.getElementById('workspace');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var nodes = [];
  var edges = [];
  var pulses = [];
  var sparks = [];

  var SEA = '47, 111, 143';
  var GOLD = '184, 149, 108';

  var running = !reducedMotion;
  var rafId = null;
  var width = 0;
  var height = 0;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function edgeKey(a, b) {
    return a < b ? a + '-' + b : b + '-' + a;
  }

  function buildGraph(w, h) {
    nodes = [];
    edges = [];
    pulses = [];
    sparks = [];

    var count = w < 640 ? 11 : w < 1024 ? 17 : 23;
    var padding = Math.min(44, w * 0.07);
    var minDist = w < 640 ? 60 : 78;
    var maxLink = Math.min(w, h) * 0.38;
    var attempts = 0;

    while (nodes.length < count && attempts < count * 50) {
      attempts += 1;
      var x = rand(padding, w - padding);
      var y = rand(padding, h - padding);
      var ok = nodes.every(function (n) {
        var dx = n.x - x;
        var dy = n.y - y;
        return dx * dx + dy * dy > minDist * minDist;
      });
      if (ok) nodes.push({ x: x, y: y });
    }

    nodes.forEach(function (node, i) {
      var neighbors = nodes
        .map(function (other, j) {
          if (i === j) return null;
          var dx = other.x - node.x;
          var dy = other.y - node.y;
          return { j: j, d: Math.sqrt(dx * dx + dy * dy) };
        })
        .filter(Boolean)
        .sort(function (a, b) { return a.d - b.d; });

      var linked = 0;
      for (var n = 0; n < neighbors.length && linked < 3; n += 1) {
        var nb = neighbors[n];
        if (nb.d > maxLink) continue;
        var key = edgeKey(i, nb.j);
        if (edges.some(function (e) { return e.key === key; })) continue;

        var a = nodes[i];
        var b = nodes[nb.j];
        var mx = (a.x + b.x) / 2;
        var my = (a.y + b.y) / 2;
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var bend = rand(-32, 32);

        edges.push({
          key: key,
          a: i,
          b: nb.j,
          cx: mx + (-dy / len) * bend,
          cy: my + (dx / len) * bend,
        });
        linked += 1;
      }
    });

    var seed = reducedMotion ? 0 : Math.min(5, edges.length);
    for (var p = 0; p < seed; p += 1) {
      spawnPulse(Math.floor(Math.random() * edges.length));
    }
  }

  function pointOnEdge(edge, t) {
    var a = nodes[edge.a];
    var b = nodes[edge.b];
    var u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * edge.cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * edge.cy + t * t * b.y,
    };
  }

  function spawnPulse(edgeIndex) {
    if (!edges.length) return;
    pulses.push({
      edgeIndex: edgeIndex,
      t: rand(0, 0.3),
      speed: rand(0.0013, 0.0022),
      color: Math.random() > 0.45 ? 'sea' : 'gold',
    });
  }

  function spawnSpark(x, y, small) {
    sparks.push({
      x: x,
      y: y,
      life: 0,
      maxLife: small ? rand(14, 22) : rand(20, 34),
      small: !!small,
    });
  }

  function drawEdgePath(edge) {
    var a = nodes[edge.a];
    var b = nodes[edge.b];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(edge.cx, edge.cy, b.x, b.y);
  }

  function drawEdgesAndNodes() {
    edges.forEach(function (edge) {
      drawEdgePath(edge);
      ctx.strokeStyle = 'rgba(' + SEA + ', 0.2)';
      ctx.lineWidth = 1.15;
      ctx.stroke();
    });

    nodes.forEach(function (node) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + SEA + ', 0.07)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + SEA + ', 0.4)';
      ctx.fill();
    });
  }

  function drawPulseTrail(edge, t, rgb) {
    var trailLen = 0.1;
    var start = Math.max(0, t - trailLen);
    var steps = 6;
    for (var i = 0; i < steps; i += 1) {
      var localT = start + ((t - start) * i) / (steps - 1);
      var pt = pointOnEdge(edge, localT);
      var fade = (i + 1) / steps;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.5 + fade * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rgb + ', ' + (fade * 0.22) + ')';
      ctx.fill();
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);
    drawEdgesAndNodes();
  }

  function isPaused() {
    return reducedMotion
      || document.hidden
      || (workspace && !workspace.classList.contains('is-hidden'));
  }

  function frame() {
    if (!running) return;

    if (isPaused()) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    ctx.clearRect(0, 0, width, height);
    drawEdgesAndNodes();

    pulses = pulses.filter(function (pulse) {
      pulse.t += pulse.speed;
      if (pulse.t >= 1) {
        var edge = edges[pulse.edgeIndex];
        if (edge) {
          var end = nodes[edge.b];
          spawnSpark(end.x, end.y, false);
          if (Math.random() < 0.55) spawnPulse(Math.floor(Math.random() * edges.length));
        }
        return false;
      }

      var activeEdge = edges[pulse.edgeIndex];
      if (!activeEdge) return false;

      var pt = pointOnEdge(activeEdge, pulse.t);
      var rgb = pulse.color === 'gold' ? GOLD : SEA;

      drawPulseTrail(activeEdge, pulse.t, rgb);

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rgb + ', 0.85)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rgb + ', 0.14)';
      ctx.fill();

      return true;
    });

    if (pulses.length < 6 && edges.length && Math.random() < 0.028) {
      spawnPulse(Math.floor(Math.random() * edges.length));
    }

    sparks = sparks.filter(function (spark) {
      spark.life += 1;
      if (spark.life > spark.maxLife) return false;

      var progress = spark.life / spark.maxLife;
      var alpha = (1 - progress) * (spark.small ? 0.5 : 0.85);
      var radius = (spark.small ? 2.5 : 4) + progress * (spark.small ? 7 : 12);

      ctx.beginPath();
      ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + GOLD + ', ' + (alpha * 0.6) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!spark.small && progress < 0.3) {
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, 2.5 * (1 - progress / 0.3), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + SEA + ', ' + ((1 - progress / 0.3) * 0.75) + ')';
        ctx.fill();
      }

      return true;
    });

    if (nodes.length && Math.random() < 0.004) {
      var node = nodes[Math.floor(Math.random() * nodes.length)];
      spawnSpark(node.x, node.y, true);
    }

    rafId = requestAnimationFrame(frame);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGraph(width, height);
    if (reducedMotion) drawStatic();
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !reducedMotion && !rafId) frame();
  });

  resize();
  if (!reducedMotion) frame();
})();
