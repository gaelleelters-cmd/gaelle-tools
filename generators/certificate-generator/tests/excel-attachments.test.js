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
  ['format.js', 'excel.js', 'generate.js'].forEach((file) => {
    vm.runInContext(
      fs.readFileSync(path.join(APP_DIR, 'js', file), 'utf8'),
      context,
      { filename: file },
    );
  });
  context.CertGen._oleIconBytes = new Uint8Array(
    fs.readFileSync(path.join(APP_DIR, 'assets', 'ole-icon.emf')),
  );
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

function pdfFromOleBin(context, oleBytes) {
  const cfb = context.XLSX.CFB.read(oleBytes, { type: 'array' });
  const native = cfb.FileIndex.find((entry) => /Ole10Native/i.test(entry.name));
  assert.ok(native && native.content, 'missing Ole10Native stream');
  const buf = Buffer.from(native.content);
  const marker = buf.indexOf(Buffer.from('%PDF-1.1'));
  assert.ok(marker >= 0, 'embedded OLE stream does not contain a PDF');
  return buf.slice(marker).toString('latin1');
}

function excelOleAndLinks(xlsxPath) {
  const escaped = String(xlsxPath).replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$xlsx = '${escaped}'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AskToUpdateLinks = $false
try {
  $wb = $excel.Workbooks.Open($xlsx)
  $ws = $wb.Worksheets.Item(1)
  $ole = $ws.OLEObjects().Count
  $links = $ws.Hyperlinks.Count
  $wb.Close($false)
  @{ ok = $true; ole = $ole; links = $links } | ConvertTo-Json -Compress
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

test('Excel attachment download embeds each PDF so Excel can open it from the workbook', async () => {
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
  const out = await G.Excel.workbookWithEmbeddedAttachments(
    packed.columns,
    packed.rows,
    packed.attachmentColumn,
    results,
    'Certificates',
  );
  assert.equal(out.name, 'Certificates.xlsx');
  assert.ok(out.blob && out.blob.size > 0);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-embed-'));
  const xlsxPath = path.join(work, out.name);
  await writeBlob(xlsxPath, out.blob);

  const zip = await context.JSZip.loadAsync(fs.readFileSync(xlsxPath));
  assert.ok(zip.file('xl/embeddings/oleObject1.bin'));
  assert.ok(zip.file('xl/embeddings/oleObject2.bin'));
  assert.equal(zip.file('xl/embeddings/oleObject3.bin'), null);

  const ole1 = await zip.file('xl/embeddings/oleObject1.bin').async('uint8array');
  const ole2 = await zip.file('xl/embeddings/oleObject2.bin').async('uint8array');
  assert.match(pdfFromOleBin(context, ole1), /GAELLE-CERT/);
  assert.match(pdfFromOleBin(context, ole2), /JOELLE-CERT/);

  const rels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
  assert.match(rels, /oleObject/);
  assert.doesNotMatch(rels, /TargetMode="External"/);

  const wb = context.XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  assert.equal(sheet.C1.v, 'Attachment');
  assert.equal(sheet.C2.v, 'Certificates/Gaelle_El_Ters_Certificate.pdf');
  assert.ok(!sheet.C2.l, 'attachment cells must not be external hyperlinks');

  const excel = excelOleAndLinks(xlsxPath);
  assert.equal(excel.ok, true, excel.error || 'Excel could not open the workbook');
  assert.equal(excel.ole, 2, JSON.stringify(excel));
  assert.equal(excel.links, 0, 'Excel must not follow a missing file path');
});
