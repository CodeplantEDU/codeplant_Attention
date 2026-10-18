import {spawnSync} from 'node:child_process';
import {connection} from '../lib/providers.mjs';
import {pythonExecutable} from '../lib/python.mjs';

console.log('ATTENTION / 실행 환경 확인');
console.log('Node.js '+process.versions.node+(Number(process.versions.node.split('.')[0])>=22?' · 사용 가능':' · 22 이상으로 업데이트 필요'));
for(const provider of ['codex','claude','gemini']){
  const state=await connection(provider,process.cwd());
  console.log(`${provider}: ${state.installed?(state.loggedIn?'연결됨':'설치됨 · 로그인 필요'):'설치되지 않음'}`);
}
const python=spawnSync(pythonExecutable(),['-c',"import pypdf,docx,reportlab,pptx,openpyxl; print('ok')"],{windowsHide:true,encoding:'utf8',timeout:15000});
console.log('문서 엔진: '+(python.status===0?'사용 가능':'선택 설치 필요 · README의 문서 기능 준비를 참고하세요.'));
console.log('AI 하나만 연결해도 사용할 수 있습니다. 계정별 실제 응답 권한은 요청할 때 확인됩니다.');
