import path from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {runtimePaths,backendEnvironment} from './runtime.mjs';
const execute=promisify(execFile);
export async function runSmoke({resources,base,window}){
  const folder=path.join(base,'smoke');await mkdir(folder,{recursive:true});
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
  const screenshot=await window.webContents.capturePage();await writeFile(path.join(folder,'desktop.png'),screenshot.toPNG());
  await writeFile(path.join(folder,'result.json'),JSON.stringify({ok:true,platform:process.platform,arch:process.arch,checks:['packaged-ui','bundled-node-server','docx','pdf','pptx','xlsx','pdf-text-extraction'],realModelCall:false},null,2));
}
