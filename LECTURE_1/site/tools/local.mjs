import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createService} from '../server.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const dataDir=path.resolve(root,'.local-data');
const port=Number(process.env.DIALOGUE_PORT||49322);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('DIALOGUE_PORT는 1024~65535 사이의 정수여야 합니다.');
if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 이상이 필요합니다.');
const url=`http://127.0.0.1:${port}`;
const workspace=createHash('sha256').update(dataDir).digest('hex').slice(0,16);
function browser(){
  if(process.env.ATTENTION_NO_BROWSER==='1')return;
  const cmd=process.platform==='win32'?'powershell.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['-NoProfile','-Command',`Start-Process -FilePath '${url}'`]:[url];
  const child=spawn(cmd,args,{windowsHide:true,stdio:'ignore'});
  child.on('error',()=>console.log('브라우저에서 직접 여세요: '+url));
}
let existing;
try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200)});if(response.ok)existing=await response.json();}catch{}
if(existing?.service==='codeplant-ai-dialogue'&&existing.workspace===workspace){
  console.log('이미 실행 중인 개인 작업실: '+url);browser();
}else{
  const service=await createService({root,dataDir,onShutdown:()=>service.close().then(()=>process.exit())});
  try{
    await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(port,'127.0.0.1',resolve);});
  }catch(error){
    await service.close();
    console.error(error.code==='EADDRINUSE'?'다른 프로그램이 이 포트를 사용 중입니다. DIALOGUE_PORT를 바꿔 실행하세요.':'서버를 시작하지 못했습니다. '+error.message);
    process.exitCode=1;
  }
  if(service.server.listening){
    console.log('\nATTENTION / 개인 AI 작업실\n'+url+'\n자료: '+dataDir+'\n이 창을 닫거나 Ctrl+C를 누르면 서버가 종료됩니다.\n');
    browser();service.refresh().catch(()=>console.error('AI 상태 확인에 실패했습니다. 화면의 새로 확인을 누르세요.'));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>service.close().then(()=>process.exit()));
  }
}
