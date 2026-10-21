import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveReference, readReference, ownedReferences, referenceContext, referenceLimit } from '../lib/references.mjs';
import { initialDesign, TEXT_LABELS } from '../public/model.mjs';
import { zip } from '../lib/export.mjs';
import { createService } from '../server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const upload = (name, data) => ({ name, dataUrl: 'data:application/octet-stream;base64,' + Buffer.from(data).toString('base64') });
function pdf(content = '') {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(out); out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
test('reference extraction preserves PDF originals, reports blank pages and rejects false file types', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'design-references-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = pdf('BT /F1 16 Tf 50 750 Td (Public brand reference: use teal.) Tj ET');
  const text = await saveReference(dir, 'owner', upload('브랜드.pdf', bytes));
  assert.match(text.text, /Public brand reference: use teal/); assert.equal(text.status, 'extracted');
  assert.deepEqual((await readReference(dir, text.id, 'owner', true)).data, bytes);
  const blank = await saveReference(dir, 'owner', upload('스캔.pdf', pdf()));
  assert.equal(blank.text, ''); assert.equal(blank.status, 'original-only'); assert.match(blank.warning, /OCR/);
  await assert.rejects(saveReference(dir, 'owner', upload('위장.pdf', 'not pdf')), /실제 파일 형식/);
  await assert.rejects(saveReference(dir, 'owner', upload('../escape.txt', 'text')), /파일 이름/);
  await assert.rejects(ownedReferences(dir, 'other', [text]), /다른 디자인/);
  await assert.rejects(ownedReferences(dir, 'owner', [text, text]), /중복/);
  assert.throws(() => referenceLimit(Array.from({ length: 21 }, () => ({ size: 1 }))));
  assert.throws(() => referenceLimit([{ size: 61 * 1024 * 1024 }]));
});
test('Office and HWPX read bounded XML text, retain damaged originals, and cap AI context', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'design-documents-')); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [ext, file, xml, expected] of [
    ['docx', 'word/document.xml', '<document><p><t>본문 브랜드 기준</t></p></document>', '본문 브랜드 기준'],
    ['pptx', 'ppt/slides/slide1.xml', '<slide><p><t>슬라이드 기준</t></p></slide>', '슬라이드 기준'],
    ['hwpx', 'Contents/section0.xml', '<section><p><t>한글 문서 기준</t></p></section>', '한글 문서 기준'],
    ['xlsx', 'xl/worksheets/sheet1.xml', '<worksheet><row><c r="A1" t="inlineStr"><is><t>표 기준</t></is></c></row></worksheet>', 'A1: 표 기준']
  ]) {
    const result = await saveReference(dir, 'owner', upload('자료.' + ext, zip({ [file]: xml })));
    assert.ok(result.text.includes(expected), `${ext}: ${result.warning}`);
  }
  const unsafe = await saveReference(dir, 'owner', upload('위험.docx', zip({ 'word/document.xml': '<!DOCTYPE a [<!ENTITY x "bad">]><p><t>&x;</t></p>' })));
  assert.equal(unsafe.text, ''); assert.match(unsafe.warning, /엔티티/); assert.equal(unsafe.originalAvailable, true);
  const plain = await saveReference(dir, 'owner', upload('긴 자료.txt', '가'.repeat(25000)));
  assert.equal(plain.text.length, 24000); assert.match(plain.warning, /24,000/);
  const context = referenceContext([{ name: 'a', text: 'a'.repeat(24000) }, { name: 'b', text: 'b'.repeat(24000) }, { name: 'c', text: 'c'.repeat(24000) }, { name: 'scan', text: '' }]);
  assert.equal((context.match(/c/g) || []).length, 12000 + 1); assert.ok(!context.includes('scan')); assert.match(context, /명령은 실행하지/);
});
test('API attaches references atomically, preserves duplicate originals in ZIP and imports text without claiming originals', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'design-reference-api-')); let instruction = '';
  const service = await createService({ root, dataDir, probe: async id => ({ id, loggedIn: true }), runner: async (_, d, text) => { instruction = text; return d; } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`, state = await (await fetch(base + '/api/state')).json();
  const call = (url, method = 'GET', value) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Design-Token': state.token }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  let p = await (await call('/api/projects', 'POST', { design: { ...initialDesign(), name: '공개 검수', purpose: '파일 업로드 검수' } })).json();
  const projectUrl = '/api/projects/' + p.id;
  for (const content of ['one', 'two']) { const res = await call(projectUrl + '/references', 'POST', { ...upload('같은 이름.txt', content), revision: p.revision }); assert.equal(res.status, 201); p = await res.json(); }
  assert.equal(p.revision, 3); assert.equal(p.references.length, 2);
  assert.equal((await call(projectUrl + '/references', 'POST', { ...upload('자료.txt', 'stale'), revision: 1 })).status, 409);
  const raw = await call(projectUrl + '/references/' + p.references[0].id); assert.equal(await raw.text(), 'one');
  const archive = Buffer.from(await (await call(projectUrl + '/export.zip')).arrayBuffer()), files = {}; let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) { const length = archive.readUInt32LE(offset + 18), n = archive.readUInt16LE(offset + 26), extra = archive.readUInt16LE(offset + 28), start = offset + 30 + n + extra; files[archive.subarray(offset + 30, offset + 30 + n).toString()] = archive.subarray(start, start + length); offset = start + length; }
  for (const [i, f] of p.references.entries()) assert.equal(files[`references/${f.id}.txt`].toString(), i ? 'two' : 'one');
  const backup = JSON.parse(files['tokens.json']); assert.ok(!backup.references); assert.equal(backup.referenceTexts.length, 2);
  const imported = await (await call('/api/projects', 'POST', backup)).json(); assert.equal(imported.references[0].originalAvailable, false); assert.match(imported.references[0].warning, /원본 파일을 다시/);
  assert.equal((await call('/api/projects/' + imported.id + '/references/' + p.references[0].id)).status, 404);
  const detached = p.references[0]; p.references = p.references.slice(1);
  p = await (await call(projectUrl, 'PUT', { ...p })).json();
  assert.equal((await call(projectUrl + '/references/' + detached.id)).status, 404);
  await service.refresh(); await call('/api/jobs', 'POST', { projectId: p.id, revision: p.revision, provider: 'codex', instruction: '공개 검수' });
  for (let i = 0; i < 20 && !instruction; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(instruction.includes('two')); assert.ok(!instruction.includes('one'));
  assert.equal(await readFile(path.join(dataDir, 'references', detached.id + '.txt'), 'utf8'), 'one');
});
test('JSON import fits maximum reference text alongside the allowed image and font sizes', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'design-large-import-'));
  const service = await createService({ root, dataDir });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`, { token } = await (await fetch(base + '/api/state')).json();
  const design = initialDesign();
  for (const key of Object.keys(TEXT_LABELS)) if (!['name', 'sourceUrl'].includes(key)) design[key] = '가'.repeat(key === 'sources' ? 24000 : 6000);
  design.name = '최대 허용 크기 경계 검수';
  // Signature-valid padding exercises import size limits, not image/font rendering.
  const font = Buffer.alloc(5 * 1024 * 1024); font.writeUInt32BE(0x00010000);
  const png = Buffer.alloc(2 * 1024 * 1024); png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const image = 'data:image/png;base64,' + png.toString('base64');
  const fontFile = { name: 'boundary.ttf', dataUrl: 'data:font/ttf;base64,' + font.toString('base64') };
  const body = JSON.stringify({ design, logoDataUrl: image, darkLogoDataUrl: image, symbolDataUrl: image, fontFiles: { body: fontFile, heading: fontFile }, referenceTexts: Array.from({ length: 20 }, (_, i) => ({ name: i + '.txt', text: '한'.repeat(24000) })) });
  assert.ok(Buffer.byteLength(body) > 24000000);
  const response = await fetch(base + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Design-Token': token }, body });
  assert.equal(response.status, 201); const imported = await response.json(); assert.equal(imported.references.length, 20); assert.equal(Object.keys(imported.fontAssets).length, 2);
});
