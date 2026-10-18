import path from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {runtimePaths,backendEnvironment} from './runtime.mjs';
const execute=promisify(execFile);
async function capture(window){
  let timer;try{return await Promise.race([window.webContents.capturePage(undefined,{stayAwake:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('검증 화면 캡처 시간 초과')),30000);})]);}
  finally{clearTimeout(timer);}
}
export async function runSmoke({resources,base,window,setup,local}){
  const folder=path.join(base,'smoke');await mkdir(folder,{recursive:true});
  const setupState=await setup.webContents.executeJavaScript('window.attention.status()');
  assert.deepEqual(setupState.installed,[]);
  const loginScreen=await setup.webContents.executeJavaScript(`({title:document.querySelector('h1').textContent,cards:document.querySelectorAll('[data-provider]').length,loginButtons:document.querySelectorAll('[data-action="login"]').length,loginApi:typeof window.attention.auth,browserApi:typeof window.attention.loginBrowser})`);
  assert.match(loginScreen.title,/로그인/);assert.equal(loginScreen.cards,3);assert.equal(loginScreen.loginButtons,3);
  assert.equal(loginScreen.loginApi,'function');assert.equal(loginScreen.browserApi,'function');
  assert.equal(setupState.token,undefined);assert.equal(setupState.runs,undefined);
  const blocked=await setup.webContents.executeJavaScript('window.attention.open().then(()=>false,()=>true)');assert.equal(blocked,true);
  const invalid=await setup.webContents.executeJavaScript('window.attention.install(["invalid"]).then(()=>false,()=>true)');assert.equal(invalid,true);
  await writeFile(path.join(folder,'setup.png'),(await capture(setup)).toPNG());
  const env=backendEnvironment(resources,base),tool=runtimePaths(resources).filetools;
  const files=['docx','pdf','pptx','xlsx'].map((ext,i)=>({id:`00000000-0000-4000-8000-00000000000${i}`,name:`test.${ext}`,title:'실행 앱 검증',ext,content:ext==='xlsx'?JSON.stringify({sheets:[{name:'검증',rows:[['항목','결과'],['패키지','정상']]}]}):'# 실행 앱 검증\n\n공개 예제입니다. 개인 계정이나 모델 호출은 사용하지 않았습니다.'}));
  const spec=path.join(folder,'spec.json');await writeFile(spec,JSON.stringify({files}));
  const result=await execute(tool,['render',spec,folder],{env,encoding:'utf8',windowsHide:true,timeout:90000});
  assert.equal(JSON.parse(result.stdout).ok,true);
  const pdf=files.find(f=>f.ext==='pdf');
  const {copyFile}=await import('node:fs/promises');
  await copyFile(path.join(folder,pdf.id+'.pdf.part'),path.join(folder,'test.pdf'));
  const extraction=await execute(tool,['extract',path.join(folder,'test.pdf')],{env,encoding:'utf8',windowsHide:true,timeout:30000});
  assert.match(JSON.parse(extraction.stdout).text,/실행 앱 검증/);
  const visible=await window.webContents.executeJavaScript('Boolean(document.querySelector("#run-form") && document.querySelector("#bridge-panel"))');
  assert.equal(visible,true);
  const state=await fetch(local+'/api/state').then(r=>r.json());
  const uploaded=await fetch(local+'/api/uploads',{method:'POST',headers:{'content-type':'application/json','x-local-token':state.token},body:JSON.stringify({name:'실행앱_공개검증.txt',base64:Buffer.from('공개 검증 자료입니다.').toString('base64')})});
  assert.equal(uploaded.status,201);
  const large='A'.repeat(10*1024*1024+1)+'REFERENCE-END';
  const largeUpload=await fetch(local+'/api/uploads',{method:'POST',headers:{'content-type':'application/json','x-local-token':state.token},body:JSON.stringify({name:'large-public-reference.txt',base64:Buffer.from(large).toString('base64')})});
  assert.equal(largeUpload.status,201);assert.equal((await largeUpload.json()).chars,large.length);
  const screenshot=await capture(window);await writeFile(path.join(folder,'desktop.png'),screenshot.toPNG());
  await writeFile(path.join(folder,'result.json'),JSON.stringify({ok:true,platform:process.platform,arch:process.arch,checks:['startup-login-screen','three-provider-login-controls','requires-connected-account','sanitized-setup-state','first-run-ui','preload-ipc','reject-invalid-provider','packaged-ui','bundled-node-server','upload','reference-over-10mb-and-60000-characters','docx','pdf','pptx','xlsx','pdf-text-extraction'],realModelCall:false},null,2));
}
