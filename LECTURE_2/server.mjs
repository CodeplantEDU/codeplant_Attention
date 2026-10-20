import http from 'node:http';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, realpath } from 'node:fs/promises';
import { initialDesign, validateDesign, validateLogo, ASSET_LABELS } from './public/model.mjs';
import { saveFont, readFont, ownedFonts, FONT_ROLES } from './lib/assets.mjs';
import { exportFiles, zip } from './lib/export.mjs';
import { connection, generate, openLogin, safeFailure, PROVIDERS } from './lib/providers.mjs';

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
function problem(message, status = 400) { return Object.assign(Error(message), { status }); }
async function atomic(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(tmp, file);
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 24000000) throw problem('편집 자료 전체는 24 MB 이하로 넣으세요.', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; } catch { throw problem('JSON 자료의 형식을 확인하세요.'); }
}
export async function createService({ root, dataDir = path.join(root, '.local-data'), runner = generate, probe = connection } = {}) {
  const projectsDir = path.join(dataDir, 'projects'), jobsDir = path.join(dataDir, 'jobs'), fontsDir = path.join(dataDir, 'fonts');
  await mkdir(projectsDir, { recursive: true }); await mkdir(jobsDir, { recursive: true });
  const publicDir = await realpath(path.join(root, 'public'));
  const token = randomBytes(24).toString('hex'), workspace = createHash('sha256').update(path.resolve(dataDir)).digest('hex').slice(0, 16);
  const locks = new Map(), jobs = new Map(); let active = null, statuses = [], probing = null;
  for (const file of await readdir(jobsDir)) {
    if (!/^[\da-f-]+\.json$/.test(file)) continue;
    try {
      const job = JSON.parse(await readFile(path.join(jobsDir, file), 'utf8'));
      if (['running', 'cancelling'].includes(job.status)) { job.status = 'failed'; job.message = '서버가 종료되어 중단됐습니다. 기존 디자인을 확인하고 다시 요청하세요.'; await atomic(path.join(jobsDir, file), job); }
      jobs.set(job.id, job);
    } catch { /* An unreadable job must not prevent access to saved projects. */ }
  }
  async function project(id) {
    if (!UUID.test(id)) throw problem('디자인 시스템 ID를 확인하세요.', 404);
    try { const p = JSON.parse(await readFile(path.join(projectsDir, `${id}.json`), 'utf8')); return { ...p, design: validateDesign(p.design), darkLogoDataUrl: p.darkLogoDataUrl || '', symbolDataUrl: p.symbolDataUrl || '', fontAssets: p.fontAssets || {} }; }
    catch (e) { throw problem(e.code === 'ENOENT' ? '저장된 디자인 시스템이 없습니다.' : '저장 자료를 읽지 못했습니다. 원본 파일을 보존하고 서버 로그를 확인하세요.', e.code === 'ENOENT' ? 404 : 500); }
  }
  function locked(id, action) {
    const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(action);
    locks.set(id, next); next.finally(() => { if (locks.get(id) === next) locks.delete(id); }).catch(() => {}); return next;
  }
  async function refresh() {
    if (probing) return probing;
    probing = Promise.all(Object.keys(PROVIDERS).map(p => probe(p, dataDir))).then(results => { statuses = results; return statuses; }).finally(() => { probing = null; });
    return probing;
  }
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src 'self' about:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const expectedHost = `127.0.0.1:${server.address()?.port}`, alternateHost = `localhost:${server.address()?.port}`;
      if (![expectedHost, alternateHost].includes(req.headers.host)) throw problem('이 서버의 로컬 주소로 접속하세요.', 403);
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin), pathname = decodeURIComponent(url.pathname);
      const fontMatch = pathname.match(/^\/api\/fonts\/([\da-f-]{36})$/);
      const publicAsset = ['GET', 'HEAD'].includes(req.method) && (pathname.startsWith('/assets/') || fontMatch && req.headers.origin === 'null');
      if (req.headers.origin && req.headers.origin !== origin && !publicAsset) throw problem('다른 사이트에서 이 작업실을 제어할 수 없습니다.', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-design-token'] !== token) throw problem('화면을 새로고침한 뒤 다시 시도하세요.', 403);
      if (!['GET', 'HEAD'].includes(req.method) && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw problem('JSON 요청만 지원합니다.', 415);
      if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { service: 'codeplant-design-studio', workspace });
      if (req.method === 'GET' && fontMatch) {
        const f = await readFont(fontsDir, fontMatch[1]); res.setHeader('Access-Control-Allow-Origin', 'null');
        res.writeHead(200, { 'Content-Type': `font/${f.meta.format}` }); return res.end(f.data);
      }
      if (req.method === 'GET' && pathname === '/api/state') {
        const list = [];
        for (const filename of await readdir(projectsDir)) if (UUID.test(filename.replace(/\.json$/, ''))) {
          try { const p = await project(filename.slice(0, -5)); list.push({ id: p.id, name: p.design.name || '이름 없는 디자인', revision: p.revision, updatedAt: p.updatedAt }); }
          catch { list.push({ id: filename.slice(0, -5), name: '읽기 오류 · 원본 보존됨', error: true }); }
        }
        return json(res, 200, { token, projects: list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), providers: statuses, activeJob: active?.id || null });
      }
      if (req.method === 'POST' && pathname === '/api/providers/refresh') return json(res, 200, { providers: await refresh() });
      const loginMatch = pathname.match(/^\/api\/providers\/(codex|claude)\/login$/);
      if (req.method === 'POST' && loginMatch) { await openLogin(loginMatch[1], dataDir); return json(res, 200, { message: '로그인 터미널을 열었습니다. 본인이 인증을 마친 뒤 새로 확인을 누르세요.' }); }
      if (req.method === 'POST' && pathname === '/api/projects') {
        const input = await body(req), design = validateDesign(input.design || initialDesign()), logoDataUrl = validateLogo(input.logoDataUrl || '');
        const p = { id: randomUUID(), revision: 1, updatedAt: new Date().toISOString(), design, logoDataUrl };
        for (const key of Object.keys(ASSET_LABELS)) p[key] = validateLogo(input[key] || '');
        p.fontAssets = {};
        if (input.fontFiles && (typeof input.fontFiles !== 'object' || Object.keys(input.fontFiles).some(k => !FONT_ROLES.includes(k)))) throw problem('본문·제목 글꼴 파일만 가져올 수 있습니다.');
        for (const role of FONT_ROLES) if (input.fontFiles?.[role]) p.fontAssets[role] = await saveFont(fontsDir, p.id, input.fontFiles[role]);
        await atomic(path.join(projectsDir, `${p.id}.json`), p); return json(res, 201, p);
      }
      const uploadMatch = pathname.match(/^\/api\/projects\/([\da-f-]{36})\/fonts\/(body|heading)$/);
      if (req.method === 'POST' && uploadMatch) {
        const p = await project(uploadMatch[1]); const value = await body(req);
        return json(res, 201, await saveFont(fontsDir, p.id, value));
      }
      const match = pathname.match(/^\/api\/projects\/([\da-f-]+)(?:\/(export\.zip|design\.md))?$/);
      if (match) {
        const id = match[1];
        if (req.method === 'PUT' && !match[2]) {
          const input = await body(req), design = validateDesign(input.design), logoDataUrl = validateLogo(input.logoDataUrl);
          const p = await locked(id, async () => {
            const old = await project(id);
            if (input.revision !== old.revision) throw problem('다른 탭에서 수정된 자료입니다. 이 화면의 JSON 백업을 받은 뒤 브라우저를 새로고침해 최신 자료를 여세요.', 409);
            const images = {}; for (const key of Object.keys(ASSET_LABELS)) images[key] = validateLogo(input[key] ?? old[key] ?? '');
            const fontAssets = await ownedFonts(fontsDir, id, input.fontAssets ?? old.fontAssets);
            const p = { ...old, design, ...images, fontAssets, revision: old.revision + 1, updatedAt: new Date().toISOString() };
            await atomic(path.join(projectsDir, `${id}.json`), p); return p;
          }); return json(res, 200, p);
        }
        if (req.method === 'GET') {
          const p = await project(id);
          if (!match[2]) return json(res, 200, { ...p, jobs: [...jobs.values()].filter(j => j.projectId === id).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map(j => ({ id: j.id, status: j.status, provider: j.provider })) });
          if (url.searchParams.has('revision') && Number(url.searchParams.get('revision')) !== p.revision) throw problem('자료가 변경됐습니다. 저장 상태를 확인한 뒤 다시 내려받으세요.', 409);
          if (!p.design.name.trim() || !p.design.purpose.trim()) throw problem('이름과 서비스 목적을 입력한 뒤 내려받으세요.');
          const fontFiles = {};
          for (const role of FONT_ROLES) if (p.fontAssets[role]) { const f = await readFont(fontsDir, p.fontAssets[role].id, p.id); fontFiles[role] = { name: f.meta.name, dataUrl: f.dataUrl }; }
          const files = exportFiles(p, fontFiles);
          if (match[2] === 'design.md') { res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="DESIGN.md"' }); return res.end(files['DESIGN.md']); }
          for (const file of ['Pretendard-Regular.ttf', 'Pretendard-SemiBold.ttf', 'Pretendard-Bold.ttf', 'Pretendard-LICENSE.txt']) files[`assets/${file}`] = await readFile(path.join(publicDir, 'assets', file));
          files['preview-demo.js'] = await readFile(path.join(publicDir, 'preview-demo.js'));
          res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="design-system.zip"' }); return res.end(zip(files));
        }
      }
      if (req.method === 'POST' && pathname === '/api/jobs') {
        const input = await body(req);
        if (!Object.hasOwn(PROVIDERS, input.provider)) throw problem('Codex 또는 Claude를 선택하세요.');
        if (typeof input.instruction !== 'string' || input.instruction.length > 4000) throw problem('수정 요청은 4,000자 이하로 입력하세요.');
        const p = await project(input.projectId);
        if (input.revision !== p.revision) throw problem('최신 자료를 저장한 뒤 AI에게 요청하세요.', 409);
        if (!p.design.name.trim() || !p.design.purpose.trim()) throw problem('이름과 서비스 목적을 먼저 입력하세요.');
        if (active) throw problem('이미 AI가 작업 중입니다. 완료하거나 중지한 뒤 다시 요청하세요.', 409);
        const status = statuses.find(s => s.id === input.provider);
        if (!status?.loggedIn) throw problem('연결 설정에서 설치와 로그인을 먼저 확인하세요.');
        const controller = new AbortController();
        const job = { id: randomUUID(), projectId: p.id, baseRevision: p.revision, provider: input.provider, status: 'running', startedAt: new Date().toISOString(), message: 'AI가 디자인 규칙을 작성하고 있습니다.', design: null };
        jobs.set(job.id, job); active = { id: job.id, controller };
        try { await atomic(path.join(jobsDir, `${job.id}.json`), job); }
        catch (e) { jobs.delete(job.id); active = null; throw e; }
        (async () => {
          try {
            const design = await runner(input.provider, p.design, input.instruction || '입력한 기획과 참고 자료에 맞춰 일관된 디자인 시스템 초안을 제안하세요.', path.join(dataDir, 'runs', job.id), controller.signal);
            if (controller.signal.aborted) throw Error('작업을 중지했습니다.');
            job.design = validateDesign(design);
            // Licensing notes are user evidence; model suggestions must not invent them.
            job.design.fontSource = p.design.fontSource;
            job.status = 'completed'; job.message = 'AI 제안이 도착했습니다. 변경 내용을 확인하고 적용하세요.';
          } catch (e) { job.status = controller.signal.aborted ? 'cancelled' : 'failed'; job.message = safeFailure(e); }
          finally {
            job.finishedAt = new Date().toISOString();
            try { await atomic(path.join(jobsDir, `${job.id}.json`), job); }
            catch { job.status = 'failed'; job.message = 'AI 결과를 디스크에 저장하지 못했습니다. 저장 공간과 쓰기 권한을 확인하세요.'; }
            if (active?.id === job.id) active = null;
          }
        })();
        return json(res, 202, job);
      }
      const jobMatch = pathname.match(/^\/api\/jobs\/([\da-f-]+)(?:\/(cancel))?$/);
      if (jobMatch && UUID.test(jobMatch[1])) {
        const job = jobs.get(jobMatch[1]); if (!job) throw problem('AI 작업 기록을 찾지 못했습니다.', 404);
        if (req.method === 'GET' && !jobMatch[2]) return json(res, 200, job);
        if (req.method === 'POST' && jobMatch[2] === 'cancel') { if (active?.id === job.id) { active.controller.abort(); job.status = 'cancelling'; job.message = 'AI 작업을 중지하고 있습니다.'; } return json(res, 200, job); }
      }
      if (pathname.startsWith('/api/')) throw problem('요청한 기능을 찾지 못했습니다.', 404);
      if (!['GET', 'HEAD'].includes(req.method)) throw problem('지원하지 않는 요청입니다.', 405);
      const file = path.resolve(publicDir, pathname === '/' ? 'index.html' : `.${pathname}`);
      let resolved; try { resolved = await realpath(file); } catch { throw problem('파일을 찾지 못했습니다.', 404); }
      if (!resolved.startsWith(publicDir + path.sep) || !mime[path.extname(resolved)]) throw problem('파일에 접근할 수 없습니다.', 404);
      const data = await readFile(resolved);
      if (resolved.startsWith(path.join(publicDir, 'assets') + path.sep)) res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) { json(res, e.status || 400, { error: e.status === 500 ? e.message : e.code ? '파일 처리에 실패했습니다. 저장 공간과 파일 권한을 확인하세요. 입력은 화면에 보존됩니다.' : e.message }); }
  });
  server.requestTimeout = 30000;
  return { server, workspace, refresh, close: async () => { active?.controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
