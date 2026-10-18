import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {connection,capture} from '../lib/providers.mjs';
import {installTool,adoptLocalTools,adoptDocumentTools} from '../lib/install.mjs';
import {pythonExecutable} from '../lib/python.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
export function setupOptions(args){
  const allowed=new Set(['--providers','--skip-documents','--no-start','--no-browser','--check-only']);
  const options={providers:['claude','antigravity'],documents:true,start:true,browser:true,checkOnly:false};
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(!allowed.has(arg))throw Error('알 수 없는 준비 옵션: '+arg);
    if(arg==='--providers'){const list=(args[++i]||'').split(',');if(list.some(p=>!['codex','claude','antigravity'].includes(p)))throw Error('설치할 AI 이름을 확인하세요.');options.providers=[...new Set(list)];}
    if(arg==='--skip-documents')options.documents=false;
    if(arg==='--no-start')options.start=false;
    if(arg==='--no-browser')options.browser=false;
    if(arg==='--check-only')options.checkOnly=true;
  }
  return options;
}
export async function prepare(options){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 이상이 필요합니다. Windows는 자동준비.cmd를 실행하세요.');
  const dataDir=path.join(root,'.local-data'),url=`http://127.0.0.1:${process.env.DIALOGUE_PORT||49322}`;
  adoptLocalTools(dataDir);adoptDocumentTools(dataDir);
  let state;
  try{const response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(2000)});if(response.ok)state=await response.json();}catch{}
  if(!options.checkOnly&&(state?.activeRunId||state?.installing||Object.values(state?.connections||{}).some(c=>c.loginRunning||c.logoutRunning)))throw Error('현재 작업·설치·로그인을 마친 뒤 자동 준비를 다시 실행하세요.');
  const report=[];
  async function install(provider){
    if(state){
      const response=await fetch(url+'/api/install',{method:'POST',headers:{'content-type':'application/json','x-local-token':state.token},body:JSON.stringify({provider})});
      if(!response.ok)throw Error('실행 중 서버가 설치를 거부했습니다. 서버 버전과 상태를 확인하세요.');
      const until=Date.now()+660000;
      do{await new Promise(r=>setTimeout(r,750));const s=await fetch(url+'/api/state').then(r=>r.json());const installed=s.installations[provider];if(installed?.status==='completed'){adoptLocalTools(dataDir);adoptDocumentTools(dataDir);return;}if(installed?.status==='failed')throw Error(installed.message);}while(Date.now()<until);
      throw Error('설치 확인 시간이 초과됐습니다. 작업실의 설치 상태를 확인하세요.');
    }
    await installTool(dataDir,provider);
  }
  for(const provider of options.providers){
    console.log('확인: '+provider);let status=await connection(provider,root);
    if(!status.installed&&!options.checkOnly){console.log('공식 CLI 설치: '+provider);await install(provider);status=await connection(provider,root);if(!status.installed)throw Error(provider+' 설치 후 실행 확인 실패');}
    report.push({tool:provider,installed:status.installed,loggedIn:status.loggedIn});
  }
  if(options.documents){
    let python=pythonExecutable(),valid;
    try{valid=(await capture(python,['-c','import sys; assert sys.version_info >= (3,10)'],{timeout:15000})).code===0;}catch{valid=false;}
    if(!valid&&!options.checkOnly){
      if(process.platform!=='win32')throw Error('Python 3.10 이상을 준비한 뒤 다시 실행하세요: https://www.python.org/downloads/');
      console.log('사용자 계정에 공식 Python 설치');
      const result=await capture('winget.exe',['install','--id','Python.Python.3.13','--exact','--source','winget','--scope','user','--silent','--accept-package-agreements','--accept-source-agreements','--disable-interactivity'],{timeout:900000});
      if(result.code!==0)throw Error('Python 자동 설치에 실패했습니다. Windows 앱 설치 관리자(winget) 또는 Python 공식 설치를 확인하세요.');
      python=pythonExecutable();valid=(await capture(python,['-c','import sys; assert sys.version_info >= (3,10)'])).code===0;
      if(!valid)throw Error('설치한 Python을 찾지 못했습니다. 새 터미널에서 다시 실행하세요.');
    }
    let installed=false;if(valid)try{installed=(await capture(python,['-c','import pypdf,docx,reportlab,pptx,openpyxl'],{timeout:15000})).code===0;}catch{}
    if(!installed&&!options.checkOnly){console.log('문서 패키지 설치');await install('documents');installed=true;}
    report.push({tool:'documents',installed});
  }
  if(!options.checkOnly){
    const child=spawn(process.execPath,[path.join(root,'tools/install-skill.mjs')],{cwd:root,windowsHide:true,stdio:'inherit'});
    await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('스킬 설치 실패')));});
    await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'setup-report.json'),JSON.stringify({time:new Date().toISOString(),report},null,2));
    if(options.start){
      if(state){if(options.browser)openBrowser(url);}
      else{const child=spawn(process.execPath,[path.join(root,'tools/local.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,...(!options.browser?{ATTENTION_NO_BROWSER:'1'}:{})}});child.unref();}
    }
  }
  console.log(JSON.stringify({report,url,checkOnly:options.checkOnly},null,2));return report;
}
function openBrowser(url){const child=spawn(process.platform==='win32'?'powershell.exe':process.platform==='darwin'?'open':'xdg-open',process.platform==='win32'?['-NoProfile','-Command',`Start-Process -FilePath '${url}'`]:[url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('직접 여세요: '+url));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)try{await prepare(setupOptions(process.argv.slice(2)));}catch(error){console.error(error.message);process.exitCode=1;}
