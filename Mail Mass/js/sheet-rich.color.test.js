/**
 * Tests for Excel rich-text color → HTML (rgb + theme).
 * Open in browser: sheet-rich.test.html
 */
'use strict';

(function () {
  var out = [];
  var failed = 0;
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assert failed');
  }
  function test(name, fn) {
    try {
      fn();
      out.push('ok - ' + name);
    } catch (err) {
      failed++;
      out.push('FAIL - ' + name + '\n' + (err && err.stack ? err.stack : err));
    }
  }

  var rich = window.MailMassSheetRich;
  assert(rich, 'MailMassSheetRich missing');

  test('richXmlToHtml keeps rgb colors', function () {
    var xml =
      '<r><rPr><rFont val="Calibri"/><sz val="11"/></rPr><t xml:space="preserve">Hello </t></r>' +
      '<r><rPr><b/><color rgb="FFFF0000"/><sz val="11"/></rPr><t>RED</t></r>' +
      '<r><rPr><i/><color rgb="FF0070C0"/><sz val="11"/></rPr><t>BLUE</t></r>';
    var html = rich.richXmlToHtml(xml, rich.DEFAULT_THEME);
    assert(html.indexOf('color:#FF0000') !== -1 || html.indexOf('color:#ff0000') !== -1, 'red missing: ' + html);
    assert(html.indexOf('color:#0070C0') !== -1 || html.indexOf('color:#0070c0') !== -1, 'blue missing: ' + html);
    assert(html.indexOf('font-weight:bold') !== -1 || html.indexOf('<b>') !== -1, 'bold missing');
  });

  test('richXmlToHtml resolves theme colors', function () {
    var xml =
      '<r><rPr><b/><color theme="4"/><sz val="11"/></rPr><t>ACCENT</t></r>';
    var html = rich.richXmlToHtml(xml, rich.DEFAULT_THEME);
    assert(/color:#4F81BD/i.test(html), 'theme accent1 missing: ' + html);
  });

  test('richXmlToHtml applies tint on theme color', function () {
    var xml =
      '<r><rPr><color theme="4" tint="0.5"/><sz val="11"/></rPr><t>LIGHT</t></r>';
    var html = rich.richXmlToHtml(xml, rich.DEFAULT_THEME);
    assert(/color:#[0-9A-Fa-f]{6}/.test(html), 'tinted color missing: ' + html);
    assert(!/color:#4F81BD/i.test(html), 'tint should change base accent');
  });

  test('cellDisplayValue prefers rebuilt HTML with colors over SheetJS h', function () {
    var cell = {
      t: 's',
      v: 'Hello RED',
      h: '<span style="font-size:11pt;">Hello </span><span style="font-size:11pt;"><b>RED</b></span>',
      r:
        '<r><rPr><sz val="11"/></rPr><t xml:space="preserve">Hello </t></r>' +
        '<r><rPr><b/><color rgb="FFFF0000"/><sz val="11"/></rPr><t>RED</t></r>'
    };
    var val = rich.cellDisplayValue(cell, rich.DEFAULT_THEME);
    assert(/color:#FF0000/i.test(val), 'expected rgb from r: ' + val);
  });

  window.__TEST_OUT__ = out.join('\n') + '\n' + (failed ? 'FAILED: ' + failed : 'All tests passed');
  document.title = failed ? 'FAIL' : 'PASS';
  var el = document.getElementById('out');
  if (el) el.textContent = window.__TEST_OUT__;
})();
