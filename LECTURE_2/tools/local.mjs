import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createService } from '../server.mjs';

if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 이상이 필요합니다. https://nodejs.org/en/download 에서 준비하세요.');
const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.DESIGN_PORT || 49323);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('DESIGN_PORT는 1024~65535 정수여야 합니다.');
const url = `http://127.0.0.1:${port}`;
function openBrowser() {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.log('브라우저에서 직접 여세요: ' + url));
}
const workspace = createHash('sha256').update(path.resolve(root, '.local-data')).digest('hex').slice(0, 16);
let existing;
try { existing = await (await fetch(url + '/api/health', { signal: AbortSignal.timeout(1000) })).json(); } catch {}
if (existing?.service === 'codeplant-design-studio' && existing.workspace === workspace) {
  console.log('이미 실행 중인 디자인 스튜디오: ' + url);
  openBrowser();
} else {
  const app = await createService({ root });
  try {
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', resolve); });
    console.log(`\nCODEPLANT · 디자인 스튜디오\n${url}\n\n각자 PC의 Codex·Claude 로그인을 사용합니다.\n자료는 LECTURE_2/.local-data에 저장됩니다.\n이 창을 켜 두세요. 종료는 Ctrl+C입니다.\n`);
    openBrowser();
    app.refresh().catch(() => console.error('AI 상태를 확인하지 못했습니다. 화면의 연결 설정에서 새로 확인하세요.'));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit()));
  } catch (e) {
    await app.close(); console.error(e.code === 'EADDRINUSE' ? '다른 프로그램이 49323 포트를 사용하고 있습니다. DESIGN_PORT 환경 변수로 다른 포트를 지정하세요.' : '서버 실행 실패: ' + e.message); process.exitCode = 1;
  }
}
