import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initialDesign, validateDesign, validateLogo, validateFont, contrast, checks, tokensCss } from '../public/model.mjs';
import { previewHtml } from '../public/preview.mjs';
import { exportFiles, zip } from '../lib/export.mjs';
import { findCli, generationArgs, parseDesignOutput, accountEnvironment, safeFailure } from '../lib/providers.mjs';
import { createService } from '../server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
function fixture() { return { ...initialDesign(), name: '검수용 디자인', purpose: '공개 예시로 디자인 규칙을 확인하는 서비스', audience: '실습 참가자' }; }

test('token boundary rejects CSS injection, unknown fields, non-finite values and unsafe source URLs', () => {
  assert.deepEqual(validateDesign(fixture()), fixture());
  for (const value of ['red', '#fff', '#FFFFFF; color:red', '</style>']) assert.throws(() => validateDesign({ ...fixture(), colors: { ...fixture().colors, text: value } }));
  for (const value of [NaN, Infinity, '16', 0, 23]) assert.throws(() => validateDesign({ ...fixture(), baseSize: value }));
  assert.throws(() => validateDesign({ ...fixture(), sourceUrl: 'javascript:alert(1)' }));
  assert.throws(() => validateDesign({ ...fixture(), sourceUrl: 'https://user:pass@example.com' }));
  assert.throws(() => validateDesign({ ...fixture(), injected: 'value' }));
  assert.throws(() => validateLogo('data:image/svg+xml;base64,AAAA'));
});
test('contrast uses WCAG luminance and reflects changed button tokens', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21); assert.equal(contrast('#FFFFFF', '#FFFFFF'), 1);
  assert.ok(checks(fixture()).every(c => c.pass));
  const d = fixture(); d.colors.onPrimary = d.colors.primary; assert.equal(checks(d).find(c => c.label === '대표 버튼').pass, false);
});
test('existing designs migrate only new fields, preserve their font, and still reject missing original fields', () => {
  const old = fixture();
  for (const key of ['headingFontFamily', 'logoUsage', 'symbolUsage', 'logoAvoid', 'fontSource', 'fontUsage', 'imageRules', 'logoClearSpace', 'logoMinWidth', 'symbolMinSize', 'bodyWeight', 'headingWeight', 'headingLineHeight', 'letterSpacing', 'labelSize', 'captionSize']) delete old[key];
  old.fontFamily = 'serif'; const migrated = validateDesign(old);
  assert.equal(migrated.headingFontFamily, 'serif'); assert.equal(migrated.fontSource, ''); assert.equal(migrated.name, old.name);
  assert.throws(() => validateDesign({})); assert.throws(() => validateDesign({ ...fixture(), headingFontFamily: 'Bad";</style>' }));
  assert.throws(() => validateDesign({ ...fixture(), bodyWeight: 450 }));
});
test('font upload validates format, signature and file size', () => {
  assert.throws(() => validateFont({ name: 'font.ttf', dataUrl: 'data:font/ttf;base64,' + Buffer.from('not-a-real-font').toString('base64') }));
  assert.throws(() => validateFont({ name: 'font.svg', dataUrl: 'data:font/ttf;base64,AAAA' }));
  assert.throws(() => validateFont({ name: 'font.ttf', dataUrl: 'data:font/ttf;base64,' + 'A'.repeat(7000000) }));
});
test('logo roles and typography rules use the same values in CSS, preview and document', () => {
  const d = { ...fixture(), headingFontFamily: 'Noto Sans KR', fontFamily: 'Pretendard', headingWeight: 600, headingLineHeight: 1.4, letterSpacing: .5, labelSize: 15, captionSize: 11, symbolMinSize: 32, logoUsage: '헤더 왼쪽', fontSource: '사용자 확인 메모' };
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const files = exportFiles({ design: d, revision: 1, logoDataUrl: image, darkLogoDataUrl: image, symbolDataUrl: image });
  for (const name of ['assets/logo.png', 'assets/logo-dark.png', 'assets/symbol.png']) assert.ok(files[name]);
  assert.ok(files['tokens.css'].includes('--ds-heading-font: "Noto Sans KR"')); assert.ok(files['tokens.css'].includes('--ds-label-size: 15px'));
  assert.ok(files['preview.html'].includes('32 × 32px')); assert.ok(files['preview.html'].includes('어두운 배경용 로고'));
  assert.ok(files['DESIGN.md'].includes('사용자 확인 메모')); assert.ok(files['DESIGN.md'].includes('헤더 왼쪽'));
  assert.equal(JSON.parse(files['tokens.json']).symbolDataUrl, image);
});
test('preview escapes user markup including style-breakout names', () => {
  const d = fixture(); d.name = '</style><script>alert("XSS")</script>'; d.purpose = '<img src=x onerror=alert(1)>';
  const html = previewHtml(d);
  assert.ok(!html.includes(d.name)); assert.ok(!html.includes(d.purpose)); assert.ok(!tokensCss(d).includes(d.name));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('aria-invalid="true"'));
});
test('ZIP data reuses exactly the editor tokens, includes handoff, and does not invent a skill', () => {
  const d = fixture(); d.colors.primary = '#123456'; d.cardRadius = 7;
  const files = exportFiles({ design: d, revision: 4, updatedAt: '2026-10-20T00:00:00Z' });
  assert.equal(JSON.parse(files['tokens.json']).design.colors.primary, '#123456');
  assert.ok(files['tokens.css'].includes('--ds-card-radius: 7px'));
  assert.ok(files['preview.html'].includes('--ds-primary: #123456'));
  assert.ok(files['DESIGN.md'].includes('#123456'));
  assert.equal(JSON.parse(files['manifest.json']).skillCreated, false); assert.ok(!Object.keys(files).includes('SKILL.md'));
  const data = zip(files); assert.equal(data.readUInt32LE(), 0x04034b50); assert.equal(data.readUInt32LE(data.length - 22), 0x06054b50); assert.equal(data.readUInt16LE(data.length - 14), Object.keys(files).length);
});
test('Codex and Claude response parsing requires a completed valid result', () => {
  const d = fixture(), out = [{ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(d) } }, { type: 'turn.completed' }].map(e => JSON.stringify(e)).join('\n');
  assert.deepEqual(parseDesignOutput('codex', out), d);
  assert.deepEqual(parseDesignOutput('claude', JSON.stringify({ subtype: 'success', structured_output: d })), d);
  assert.throws(() => parseDesignOutput('codex', out.split('\n')[0]));
  assert.throws(() => parseDesignOutput('claude', JSON.stringify({ subtype: 'error', structured_output: d })));
  assert.throws(() => parseDesignOutput('claude', JSON.stringify({ subtype: 'success', structured_output: { ...d, baseSize: 99 } })));
});
test('CLI runs preserve account authentication while removing API-key overrides and tool execution', () => {
  const env = accountEnvironment({ PATH: 'kept', CODEX_HOME: '/account', OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', CLAUDECODE: '1' });
  assert.equal(env.PATH, 'kept'); assert.equal(env.CODEX_HOME, '/account'); assert.ok(!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY && !env.CLAUDECODE);
  assert.ok(generationArgs('codex', '/schema').includes('features.shell_tool=false')); assert.ok(generationArgs('codex', '/schema').includes('read-only'));
  assert.ok(generationArgs('claude', '/schema').includes('--restricted')); assert.ok(generationArgs('claude', '/schema').includes('--strict-mcp-config'));
  assert.ok(!generationArgs('codex', '/schema').some(a => a.includes('dangerously')));
  assert.ok(!safeFailure('token sk-test-secret').includes('sk-test-secret'));
  assert.ok(!safeFailure('실행 파일 오류: sk-test-secret').includes('sk-test-secret'));
});
test('CLI discovery handles npm installation without executing a shell shim', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'design-discovery-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const npm = path.join(dir, 'npm'), entry = path.join(npm, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  await mkdir(path.dirname(entry), { recursive: true }); await writeFile(entry, '// test'); await writeFile(path.join(npm, 'codex.cmd'), '@echo dangerous');
  const cli = await findCli('codex', { env: { APPDATA: dir, PATH: '' }, home: dir, platform: 'win32' });
  assert.equal(cli.file, process.execPath); assert.equal(cli.args[0], entry); assert.ok(!cli.file.endsWith('.cmd'));
  await assert.rejects(findCli('claude', { env: { DESIGN_CLAUDE_EXE: path.join(npm, 'codex.cmd') }, home: dir }), /실행 파일/);
});
test('local API saves atomically, preserves revisions, validates input, exports and isolates AI proposals', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'design-service-')); let calls = 0;
  const service = await createService({ root, dataDir, probe: async id => ({ id, label: id, installed: true, loggedIn: true }), runner: async (id, d) => { calls++; return { ...d, fontSource: '추측한 라이선스', colors: { ...d.colors, primary: '#456789' } }; } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const state = await (await fetch(base + '/api/state')).json();
  const call = async (url, method = 'GET', value, headers = {}) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Design-Token': state.token, ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  assert.equal((await call('/api/projects', 'POST', {}, { 'X-Design-Token': 'invalid' })).status, 403);
  assert.equal((await call('/api/state', 'GET', undefined, { Origin: 'https://evil.example' })).status, 403);
  const font = await call('/assets/Pretendard-Regular.ttf', 'GET', undefined, { Origin: 'null' });
  assert.equal(font.status, 200); assert.equal(font.headers.get('access-control-allow-origin'), '*'); await font.arrayBuffer();
  assert.equal((await call('/api/projects', 'POST', null)).status, 400);
  const hostileHost = await new Promise((resolve, reject) => { const req = http.get(base + '/api/state', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(hostileHost, 403);
  const created = await (await call('/api/projects', 'POST', { design: fixture() })).json(); assert.equal(created.revision, 1);
  const change = { revision: 1, design: { ...created.design, headingSize: 44 }, logoDataUrl: '' };
  const concurrent = await Promise.all([call('/api/projects/' + created.id, 'PUT', change), call('/api/projects/' + created.id, 'PUT', change)]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const current = await (await call('/api/projects/' + created.id)).json(); assert.equal(current.revision, 2); assert.equal(current.design.headingSize, 44);
  assert.equal((await call('/api/projects/' + created.id, 'PUT', { ...change, revision: 2, design: { ...fixture(), cardRadius: -1 } })).status, 400);
  assert.equal((await call('/api/projects/' + created.id + '/export.zip?revision=1')).status, 409);
  const exportResponse = await call('/api/projects/' + created.id + '/export.zip?revision=2'); assert.equal(exportResponse.status, 200); assert.equal(exportResponse.headers.get('Content-Type'), 'application/zip');
  const zipBytes = Buffer.from(await exportResponse.arrayBuffer()); assert.equal(zipBytes.readUInt32LE(), 0x04034b50);
  assert.equal((await call('/api/jobs', 'POST', { projectId: created.id, revision: 2, provider: 'codex', instruction: '' })).status, 400);
  await call('/api/providers/refresh', 'POST', {});
  const job = await (await call('/api/jobs', 'POST', { projectId: created.id, revision: 2, provider: 'codex', instruction: '색상 제안' })).json();
  for (let i = 0; i < 30; i++) { const result = await (await call('/api/jobs/' + job.id)).json(); if (result.status === 'completed') break; await new Promise(resolve => setTimeout(resolve, 10)); }
  const done = await (await call('/api/jobs/' + job.id)).json(); assert.equal(done.status, 'completed'); assert.equal(calls, 1); assert.equal(done.design.colors.primary, '#456789'); assert.equal(done.design.fontSource, current.design.fontSource);
  const unchanged = await (await call('/api/projects/' + created.id)).json(); assert.equal(unchanged.design.colors.primary, '#6FC5C1'); assert.equal(unchanged.revision, 2);
  const disk = JSON.parse(await readFile(path.join(dataDir, 'projects', created.id + '.json'))); assert.deepEqual(disk.design, unchanged.design);
  assert.equal((await call('/.local-data/projects/' + created.id + '.json')).status, 404);
});
test('interrupted AI jobs recover as failed while saved designs remain accessible', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'design-recovery-')), jobsDir = path.join(dataDir, 'jobs');
  await mkdir(jobsDir, { recursive: true });
  const id = '11111111-1111-4111-8111-111111111111'; await writeFile(path.join(jobsDir, id + '.json'), JSON.stringify({ id, status: 'running' }));
  const service = await createService({ root, dataDir });
  assert.equal(JSON.parse(await readFile(path.join(jobsDir, id + '.json'))).status, 'failed');
  await service.close(); await rm(dataDir, { recursive: true, force: true });
});
test('uploaded font bytes survive save, ZIP export and JSON reimport; cross-project references are rejected', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'design-fonts-')), service = await createService({ root, dataDir });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`, state = await (await fetch(base + '/api/state')).json();
  const call = (route, method = 'GET', value, headers = {}) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Design-Token': state.token, ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const p = await (await call('/api/projects', 'POST', { design: fixture() })).json();
  const bytes = await readFile(path.join(root, 'public/assets/Pretendard-Regular.ttf')), font = { name: 'my-body.ttf', dataUrl: 'data:font/ttf;base64,' + bytes.toString('base64') };
  const meta = await (await call(`/api/projects/${p.id}/fonts/body`, 'POST', font)).json(); assert.equal(meta.name, font.name);
  const f = await call('/api/fonts/' + meta.id, 'GET', undefined, { Origin: 'null' }); assert.equal(f.status, 200); assert.deepEqual(Buffer.from(await f.arrayBuffer()), bytes);
  assert.equal((await call('/api/fonts/' + meta.id, 'GET', undefined, { Origin: 'https://evil.example' })).status, 403);
  const saved = await call('/api/projects/' + p.id, 'PUT', { revision: p.revision, design: p.design, logoDataUrl: '', fontAssets: { body: meta } }); assert.equal(saved.status, 200);
  const other = await (await call('/api/projects', 'POST', { design: fixture() })).json();
  assert.equal((await call('/api/projects/' + other.id, 'PUT', { revision: other.revision, design: other.design, logoDataUrl: '', fontAssets: { body: meta } })).status, 400);
  const data = Buffer.from(await (await call('/api/projects/' + p.id + '/export.zip')).arrayBuffer()), files = {};
  let offset = 0;
  while (data.readUInt32LE(offset) === 0x04034b50) { const length = data.readUInt32LE(offset + 18), nameLength = data.readUInt16LE(offset + 26), extra = data.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extra; files[data.subarray(offset + 30, offset + 30 + nameLength).toString()] = data.subarray(start, start + length); offset = start + length; }
  assert.deepEqual(files['assets/font-body.ttf'], bytes); assert.ok(files['tokens.css'].toString().includes('DS-body'));
  const imported = JSON.parse(files['tokens.json']); assert.equal(imported.fontFiles.body.dataUrl, font.dataUrl);
  const copy = await (await call('/api/projects', 'POST', imported)).json(); assert.notEqual(copy.id, p.id); assert.notEqual(copy.fontAssets.body.id, meta.id);
  const copied = await call('/api/fonts/' + copy.fontAssets.body.id); assert.deepEqual(Buffer.from(await copied.arrayBuffer()), bytes);
});
test('AI cancellation stops a pending job and duplicate calls are rejected without changing the design', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'design-cancel-'));
  const service = await createService({ root, dataDir, probe: async id => ({ id, loggedIn: true }), runner: async (id, design, instruction, cwd, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('작업을 중지했습니다.')), { once: true })) });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`, state = await (await fetch(base + '/api/state')).json();
  const post = async (route, value) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Design-Token': state.token }, body: JSON.stringify(value) });
  await post('/api/providers/refresh', {}); const p = await (await post('/api/projects', { design: fixture() })).json();
  const input = { projectId: p.id, revision: p.revision, provider: 'codex', instruction: '' };
  const job = await (await post('/api/jobs', input)).json();
  assert.equal((await post('/api/jobs', input)).status, 409);
  await post('/api/jobs/' + job.id + '/cancel', {});
  let result;
  for (let i = 0; i < 30; i++) { result = await (await fetch(base + '/api/jobs/' + job.id)).json(); if (result.status === 'cancelled') break; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.equal(result.status, 'cancelled'); assert.equal(result.design, null);
  assert.deepEqual((await (await fetch(base + '/api/projects/' + p.id)).json()).design, fixture());
});
