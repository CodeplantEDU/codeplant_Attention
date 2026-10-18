import {app,BrowserWindow,Menu,ipcMain,shell,dialog} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {runtimePaths,installedProviders,installProvider,backendEnvironment} from './runtime.mjs';
import {connectionSummary,authRequest,loginUrl,canContinue} from './auth.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const resources=app.isPackaged?process.resourcesPath:here;
const smoke=process.argv.includes('--smoke-test');
const userData=smoke?process.env.ATTENTION_SMOKE_DIR:path.join(app.getPath('appData'),'codeplant-attention-desktop');
if(!userData||!path.isAbsolute(userData))throw Error('앱 저장 경로를 확인하세요.');
mkdirSync(userData,{recursive:true});app.setPath('userData',userData);
let window,setup,worker,quitting=false,installing=false,usingExisting=false,stoppingWorker=false;
let local='http://127.0.0.1:49321',backendStarting;
function external(url){try{if(new URL(url).protocol==='https:')shell.openExternal(url);}catch{}}
function secureWindow(options){
  const win=new BrowserWindow({...options,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,...options.webPreferences}});
  win.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL()&&!url.startsWith(local+'/')){event.preventDefault();external(url);}});
  return win;
}
async function showSetup(){
  if(setup){setup.show();setup.focus();return;}
  setup=secureWindow({width:740,height:860,minWidth:560,minHeight:600,resizable:true,title:'AI 로그인 · CODEPLANT',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(here,'preload.cjs')}});
  setup.on('close',event=>{if(installing){event.preventDefault();setup.webContents.send('attention:progress','공식 도구를 준비하고 있습니다. 완료한 뒤 창을 닫아 주세요.');}});
  setup.on('closed',()=>{setup=null;});await setup.loadFile(path.join(here,'setup.html'));
}
function trusted(event){if(!setup||event.sender!==setup.webContents||event.senderFrame.url!==new URL('setup.html',import.meta.url).href)throw Error('허용되지 않은 요청입니다.');}
async function state(){
  if(installing)throw Error('공식 도구를 준비하고 있습니다. 잠시 기다려 주세요.');
  await startBackend();
  const response=await fetch(local+'/api/state',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('연결 상태를 확인하지 못했습니다. 다시 확인하세요.');
  return response.json();
}
ipcMain.handle('attention:status',async event=>{trusted(event);return {...connectionSummary(await state()),installed:installedProviders(userData),usingExisting};});
ipcMain.handle('attention:auth',async(event,action,provider)=>{
  trusted(event);
  if(installing)throw Error('공식 도구 준비가 끝날 때까지 기다려 주세요.');
  await startBackend();
  await authRequest(local,action,provider);
});
ipcMain.handle('attention:login-browser',async(event,provider)=>{
  trusted(event);const url=loginUrl(await state(),provider);
  if(!url)throw Error('아직 로그인 주소가 없습니다. 잠시 후 다시 눌러 주세요.');
  await shell.openExternal(url);
});
ipcMain.handle('attention:install',async(event,providers)=>{
  trusted(event);if(installing)throw Error('준비 중입니다. 잠시 기다려 주세요.');
  if(!Array.isArray(providers)||!providers.length||providers.length>3||providers.some(p=>!['codex','claude','gemini'].includes(p))||new Set(providers).size!==providers.length)throw Error('사용할 AI를 선택하세요.');
  if(usingExisting)throw Error('기존 연결 프로그램을 종료하고 이 앱을 다시 실행해 AI를 추가해 주세요.');
  installing=true;try{
    if(worker){
      const snapshot=await fetch(local+'/api/state').then(r=>r.json());
      if(snapshot.activeRunId||Object.values(snapshot.connections).some(c=>c.loginRunning||c.logoutRunning))throw Error('진행 중인 대화 또는 로그인을 마친 뒤 AI를 추가하세요.');
      stoppingWorker=true;const child=worker;
      try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('대화 서버 종료를 기다리고 있습니다. 다시 시도하세요.')),10000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send('close');});}
      finally{stoppingWorker=false;}
    }
    for(const provider of providers){setup?.webContents.send('attention:progress',`${provider} 공식 실행 도구를 준비하고 있습니다. 처음에는 몇 분 걸릴 수 있습니다.`);await installProvider(resources,app.getPath('userData'),provider);}
    return {installed:installedProviders(app.getPath('userData'))};
  }finally{installing=false;}
});
ipcMain.handle('attention:open',async event=>{trusted(event);if(!canContinue(await state()))throw Error('AI를 하나 이상 로그인하고 진행 중인 인증을 마쳐 주세요.');await openStudio();setup?.close();});

async function existing(){try{const response=await fetch(local+'/api/state',{signal:AbortSignal.timeout(1500)});const state=await response.json();return response.ok&&state.connections&&Array.isArray(state.runs);}catch{return false;}}
async function startBackend(){
  if(backendStarting)return backendStarting;
  if(worker||usingExisting)return;
  backendStarting=launchBackend();
  try{await backendStarting;}finally{backendStarting=null;}
}
async function launchBackend(){
  if(!smoke&&await existing()){usingExisting=true;return;}
  const base=app.getPath('userData'),dataDir=path.join(base,'data');await mkdir(dataDir,{recursive:true});
  await new Promise((resolve,reject)=>{
    worker=spawn(runtimePaths(resources).node,[path.join(resources,'worker.mjs'),resources,dataDir],{
      env:{...backendEnvironment(resources,base),ATTENTION_DESKTOP_SMOKE:smoke?'1':''},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false});
    const timer=setTimeout(()=>reject(Error('실행 준비 시간이 초과됐습니다.')),15000);
    worker.on('message',message=>{clearTimeout(timer);if(message.ready){local=`http://127.0.0.1:${message.port}`;resolve();}else reject(Error(message.error==='port'?'49321 포트가 다른 프로그램에서 사용 중입니다.':'대화 서버를 시작하지 못했습니다.'));});
    worker.on('error',()=>{clearTimeout(timer);reject(Error('앱 실행 환경을 시작하지 못했습니다. 다시 다운로드해 주세요.'));});
    worker.on('exit',()=>{clearTimeout(timer);worker=null;if(!quitting&&!stoppingWorker){reject(Error('대화 서버가 종료됐습니다.'));dialog.showErrorBox('CODEPLANT ATTENTION','대화 서버가 종료됐습니다. 앱을 다시 실행해 주세요.');}});
  });
}
async function openStudio(){
  await startBackend();
  if(window){await window.loadURL(local+'/');window.show();return;}
  window=secureWindow({width:1500,height:960,minWidth:840,minHeight:640,title:'CODEPLANT ATTENTION'});
  window.on('closed',()=>{window=null;});
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  await window.loadURL(local+'/');
  if(smoke){
    // Smoke mode never starts auth or model inference. It checks the packaged UI and document engine only.
    const {runSmoke}=await import(pathToSmoke());await runSmoke({resources,base:app.getPath('userData'),window,setup,local});setup?.close();app.quit();
  }
}
function pathToSmoke(){return new URL('./smoke.mjs',import.meta.url).href;}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{showSetup().catch(()=>{});});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
      {label:'앱',submenu:[{label:'AI 로그인·연결',click:showSetup},{label:'공개 사이트 열기',click:()=>external('https://codeplant-attention.vercel.app/')},{label:'자료 저장 폴더',click:()=>shell.openPath(app.getPath('userData'))},{type:'separator'},{role:'quit',label:'종료'}]},
      {role:'editMenu',label:'편집'},{role:'viewMenu',label:'보기'}]));
    // Every launch shows account connections, including when tools or a legacy server already exist.
    await showSetup();
    if(smoke)await openStudio();
  }).catch(async e=>{
    if(smoke){const folder=path.join(userData,'smoke');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'error.json'),JSON.stringify({error:e.message}));}
    else dialog.showErrorBox('CODEPLANT ATTENTION',e.message);
    app.exit(1);
  });
  app.on('window-all-closed',()=>{if(!installing)app.quit();});
  app.on('before-quit',event=>{
    quitting=true;if(!worker)return;event.preventDefault();const child=worker;worker=null;
    child.once('exit',()=>app.quit());child.send('close');setTimeout(()=>{child.kill();app.exit();},5000).unref();
  });
}
