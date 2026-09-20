const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const request = require('supertest');
const { app } = require('../src/app');

function createMinimalPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB4LqAAAAA1J0' +
    'pAAB9h0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJ0UkG' +
    'AAAAAAgI0BAAAAAAABQwAABQAAABJRU5ErkJggg==',
    'base64'
  );
}

function createMinimalPdf() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 50 70 Td (Hello Verixa) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000123 00000 n\n0000000545 00000 n\ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n610\n%%EOF\n', 'binary');
}

async function createMinimalDocx(filePath) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Overview</w:t></w:r></w:p>
        <w:p><w:r><w:t>Verixa AI inspects the quality of business documents.</w:t></w:r></w:p>
      </w:body>
    </w:document>`);
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  await zip.generateAsync({ type: 'nodebuffer' }).then((buf) => fs.writeFileSync(filePath, buf));
}

async function createMinimalPptx(filePath) {
  const zip = new JSZip();
  zip.file('ppt/presentation.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>');
  zip.file('ppt/slides/slide1.xml', '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2400"/><a:t>Quarterly Overview</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  zip.file('ppt/slides/slide2.xml', '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>Project status</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  await zip.generateAsync({ type: 'nodebuffer' }).then((buf) => fs.writeFileSync(filePath, buf));
}

test('server health', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Verixa AI Backend');
});

test('upload accepts a valid image file', async () => {
  const filePath = path.join(__dirname, 'sample.png');
  fs.writeFileSync(filePath, createMinimalPng());

  const res = await request(app)
    .post('/api/upload')
    .attach('file', filePath);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.fileType, 'png');
  assert.ok(res.body.scanId);

  fs.unlinkSync(filePath);
});

test('upload rejects invalid file type', async () => {
  const filePath = path.join(__dirname, 'bad.txt');
  fs.writeFileSync(filePath, 'not an allowed upload');

  const res = await request(app)
    .post('/api/upload')
    .attach('file', filePath);

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  fs.unlinkSync(filePath);
});

test('upload rejects oversized files', async () => {
  const filePath = path.join(__dirname, 'large.png');
  fs.writeFileSync(filePath, Buffer.alloc(11 * 1024 * 1024, 1));

  const res = await request(app)
    .post('/api/upload')
    .attach('file', filePath);

  assert.equal(res.status, 413);
  assert.equal(res.body.success, false);
  fs.unlinkSync(filePath);
});

test('pptx extraction yields slide metadata', async () => {
  const filePath = path.join(__dirname, 'sample.pptx');
  await createMinimalPptx(filePath);

  const res = await request(app)
    .post('/api/upload')
    .attach('file', filePath);

  assert.equal(res.status, 200);
  assert.equal(res.body.fileType, 'pptx');

  const scanId = res.body.scanId;
  const scanRes = await request(app).post('/api/scan').send({ scanId });
  assert.equal(scanRes.status, 200);
  assert.ok(scanRes.body.report);
  assert.ok(scanRes.body.report.extraction.slideCount >= 2);

  fs.unlinkSync(filePath);
});

test('docx extraction yields paragraphs and heading text', async () => {
  const filePath = path.join(__dirname, 'sample.docx');
  await createMinimalDocx(filePath);

  const uploadRes = await request(app).post('/api/upload').attach('file', filePath);
  const scanId = uploadRes.body.scanId;
  const scanRes = await request(app).post('/api/scan').send({ scanId });

  assert.equal(scanRes.status, 200);
  assert.ok(scanRes.body.report.extraction.docx.headings.some(item => item.includes('Project')));

  fs.unlinkSync(filePath);
});

test('pdf extraction yields page and text data', async () => {
  const filePath = path.join(__dirname, 'sample.pdf');
  fs.writeFileSync(filePath, createMinimalPdf());

  const uploadRes = await request(app).post('/api/upload').attach('file', filePath);
  const scanId = uploadRes.body.scanId;
  const scanRes = await request(app).post('/api/scan').send({ scanId });

  assert.equal(scanRes.status, 200);
  assert.ok(scanRes.body.report.extraction.pdf.pages >= 1);
  assert.ok(scanRes.body.report.extraction.pdf.text.includes('Verixa'));

  fs.unlinkSync(filePath);
});

test('image metadata can be extracted', async () => {
  const filePath = path.join(__dirname, 'sample-image.png');
  fs.writeFileSync(filePath, createMinimalPng());

  const res = await request(app)
    .post('/api/upload')
    .attach('file', filePath);

  const scanId = res.body.scanId;
  const scanRes = await request(app).post('/api/scan').send({ scanId });

  assert.equal(scanRes.status, 200);
  assert.ok(scanRes.body.report.extraction.image.width > 0);
  assert.ok(scanRes.body.report.extraction.image.aspectRatio > 0);

  fs.unlinkSync(filePath);
});

test('scan status and report generation work end-to-end', async () => {
  const filePath = path.join(__dirname, 'final-scan.png');
  fs.writeFileSync(filePath, createMinimalPng());

  const uploadRes = await request(app).post('/api/upload').attach('file', filePath);
  const scanId = uploadRes.body.scanId;

  const statusRes = await request(app).get(`/api/scan/${scanId}/status`);
  assert.equal(statusRes.status, 200);
  assert.ok(['uploaded', 'processing', 'extracting', 'analyzing', 'scoring', 'completed'].includes(statusRes.body.status));

  const scanRes = await request(app).post('/api/scan').send({ scanId });
  assert.equal(scanRes.status, 200);

  const reportRes = await request(app).get(`/api/scan/${scanId}/report`);
  assert.equal(reportRes.status, 200);
  assert.equal(reportRes.body.scanId, scanId);
  assert.equal(reportRes.body.status, 'completed');
  assert.ok(reportRes.body.overallScore >= 0);

  fs.unlinkSync(filePath);
});
