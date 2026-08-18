const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const APP_DIR = path.resolve(__dirname, '..');
const LIB_DIR = path.join(os.tmpdir(), 'certgen-libs');
const LIBS = {
  'xlsx.full.min.js': 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'jszip.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
};

async function ensureLib(name, url) {
  fs.mkdirSync(LIB_DIR, { recursive: true });
  const dest = path.join(LIB_DIR, name);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
    const res = await fetch(url);
    assert.equal(res.ok, true, 'failed to download ' + url);
    fs.writeFileSync(dest, await res.text());
  }
  return fs.readFileSync(dest, 'utf8');
}

async function loadBrowserModules() {
  const context = {
    console,
    Buffer,
    Uint8Array,
    ArrayBuffer,
    Blob,
    File,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    Promise,
    DataView,
    Int8Array,
    Uint16Array,
    Uint32Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
  };
  context.window = context;
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(await ensureLib('xlsx.full.min.js', LIBS['xlsx.full.min.js']), context, { filename: 'xlsx.full.min.js' });
  vm.runInContext(await ensureLib('jszip.min.js', LIBS['jszip.min.js']), context, { filename: 'jszip.min.js' });
  assert.ok(context.XLSX, 'SheetJS did not attach to the test window');
  assert.ok(context.JSZip, 'JSZip did not attach to the test window');
  ['format.js', 'excel.js', 'generate.js'].forEach((file) => {
    vm.runInContext(
      fs.readFileSync(path.join(APP_DIR, 'js', file), 'utf8'),
      context,
      { filename: file },
    );
  });
  assert.ok(context.XLSX && context.JSZip && context.CertGen && context.CertGen.Excel);
  return context;
}

function pdfBlob(mark) {
  return new Blob([`%PDF-1.1\n%${mark}\n%%EOF\n`], { type: 'application/pdf' });
}

function writeBlob(filePath, blob) {
  return blob.arrayBuffer().then((buf) => {
    fs.writeFileSync(filePath, Buffer.from(buf));
  });
}

function extractZip(zipPath, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const result = spawnSync('tar', ['-xf', zipPath, '-C', dest], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'tar extract failed');
}

function excelHyperlinks(xlsxPath) {
  const escaped = String(xlsxPath).replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$xlsx = '${escaped}'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AskToUpdateLinks = $false
try {
  $wb = $excel.Workbooks.Open($xlsx, 0, $true)
  $ws = $wb.Worksheets.Item(1)
  $links = @()
  for ($i = 1; $i -le $ws.Hyperlinks.Count; $i++) {
    $h = $ws.Hyperlinks.Item($i)
    $links += @{
      Address = [string]$h.Address
      TextToDisplay = [string]$h.TextToDisplay
    }
  }
  $wb.Close($false)
  @{ ok = $true; count = $links.Count; links = $links } | ConvertTo-Json -Compress -Depth 5
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 90000,
  });
  const out = String(result.stdout || '').trim();
  assert.ok(out, result.stderr || 'Excel COM produced no output');
  const jsonLine = out.split(/\r?\n/).filter(Boolean).pop();
  return JSON.parse(jsonLine);
}

test('Excel attachment download is a zip of clickable PDF links plus the PDF files', async () => {
  const context = await loadBrowserModules();
  const G = context.CertGen;
  const columns = ['name', 'date'];
  const rows = [
    { name: 'Gaelle el ters', date: '20 augusyt', __excelRow: 2 },
    { name: 'Joelle el feghaly', date: '21 augusyt', __excelRow: 3 },
    { name: 'Skipped person', date: '', __excelRow: 4 },
  ];
  const results = [
    {
      ok: true,
      excelRow: 2,
      index: 0,
      pdfFilename: 'Gaelle_El_Ters_Certificate.pdf',
      pdfBlob: pdfBlob('GAELLE-CERT'),
    },
    {
      ok: true,
      excelRow: 3,
      index: 1,
      pdfFilename: 'Joelle_El_Feghaly_Certificate.pdf',
      pdfBlob: pdfBlob('JOELLE-CERT'),
    },
  ];

  const packed = G.Excel.rowsWithAttachments(columns, rows, results);
  const out = await G.Excel.workbookWithAttachmentsZip(
    packed.columns,
    packed.rows,
    packed.attachmentColumn,
    results,
    'Certificates',
  );
  assert.equal(out.name, 'Certificates_with_attachments.zip');
  assert.ok(out.blob && out.blob.size > 0);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-attach-'));
  const zipPath = path.join(work, out.name);
  await writeBlob(zipPath, out.blob);
  extractZip(zipPath, work);

  const xlsxPath = path.join(work, 'Certificates.xlsx');
  const gaellePdf = path.join(work, 'Certificates', 'Gaelle_El_Ters_Certificate.pdf');
  const joellePdf = path.join(work, 'Certificates', 'Joelle_El_Feghaly_Certificate.pdf');
  assert.equal(fs.existsSync(xlsxPath), true);
  assert.equal(fs.existsSync(gaellePdf), true);
  assert.equal(fs.existsSync(joellePdf), true);
  assert.match(fs.readFileSync(gaellePdf, 'utf8'), /GAELLE-CERT/);
  assert.match(fs.readFileSync(joellePdf, 'utf8'), /JOELLE-CERT/);
  assert.equal(fs.existsSync(path.join(work, 'Certificates', 'Skipped person.pdf')), false);

  const xlsxBuf = fs.readFileSync(xlsxPath);
  const inner = await context.JSZip.loadAsync(xlsxBuf);
  const rels = await inner.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
  assert.match(rels, /Target="Certificates\/Gaelle_El_Ters_Certificate\.pdf"/);
  assert.match(rels, /Target="Certificates\/Joelle_El_Feghaly_Certificate\.pdf"/);
  assert.match(rels, /TargetMode="External"/);

  const wb = context.XLSX.read(xlsxBuf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  assert.equal(sheet.A1.v, 'name');
  assert.equal(sheet.B1.v, 'date');
  assert.equal(sheet.C1.v, 'Attachment');
  assert.equal(sheet.C2.v, 'Certificates/Gaelle_El_Ters_Certificate.pdf');
  assert.equal(sheet.C3.v, 'Certificates/Joelle_El_Feghaly_Certificate.pdf');
  assert.equal(sheet.C2.l.Target, 'Certificates/Gaelle_El_Ters_Certificate.pdf');
  assert.equal(sheet.C3.l.Target, 'Certificates/Joelle_El_Feghaly_Certificate.pdf');
  assert.ok(!sheet.C4 || !sheet.C4.l);

  function resolveTarget(target) {
    return path.resolve(work, String(target).replace(/\//g, path.sep));
  }
  assert.equal(fs.existsSync(resolveTarget(sheet.C2.l.Target)), true);
  assert.equal(fs.existsSync(resolveTarget(sheet.C3.l.Target)), true);
  assert.match(fs.readFileSync(resolveTarget(sheet.C2.l.Target), 'utf8'), /%PDF-1\.1/);
  assert.match(fs.readFileSync(resolveTarget(sheet.C3.l.Target), 'utf8'), /%PDF-1\.1/);

  const excel = excelHyperlinks(xlsxPath);
  assert.equal(excel.ok, true, excel.error || 'Excel could not open the workbook');
  assert.equal(excel.count, 2, JSON.stringify(excel));
  const addresses = excel.links.map((link) => String(link.Address).replace(/\\/g, '/'));
  assert.ok(addresses.includes('Certificates/Gaelle_El_Ters_Certificate.pdf'), JSON.stringify(excel.links));
  assert.ok(addresses.includes('Certificates/Joelle_El_Feghaly_Certificate.pdf'), JSON.stringify(excel.links));
  excel.links.forEach((link) => {
    const resolved = resolveTarget(link.Address);
    assert.equal(fs.existsSync(resolved), true, 'Excel hyperlink does not open a file: ' + link.Address);
    assert.match(fs.readFileSync(resolved, 'utf8'), /%PDF-1\.1/);
  });
});
