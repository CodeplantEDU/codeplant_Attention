import path from 'node:path';
import os from 'node:os';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,rename,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export function antigravityExecutable(env=process.env){
  const name=process.platform==='win32'?'agy.exe':'agy';
  const override=env.DIALOGUE_ANTIGRAVITY_EXE;
  if(override){if(!path.isAbsolute(override)||!existsSync(override)||/\.(cmd|bat|ps1)$/i.test(override))throw Error('Antigravity 실행 파일 경로를 확인하세요.');return override;}
  const candidates=[path.join(env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'agy/bin',name),path.join(os.homedir(),'.local/bin',name),...(env.PATH||'').split(path.delimiter).filter(Boolean).map(p=>path.join(p,name))];
  const found=candidates.find(existsSync);if(!found)throw Error('Antigravity CLI 실행 파일을 찾지 못했습니다. 설치 버튼을 사용하세요.');return found;
}
export function antigravityModels(text){
  return text.split('\n').flatMap(line=>{const m=line.trim().match(/^([a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99})\s+(.+)$/);return m&&!/fetching|available|usage/i.test(m[1])?[{id:m[1],label:m[2]}]:[];});
}
export function parseAntigravity(event,emit,state){
  if(event.event==='init'){state.model=event.init?.model||state.model;state.threadId=event.conversation_id;}
  if(event.event==='step_update'){
    const step=event.step_update;
    if(step?.step_type==='agent_response'&&typeof step.text_delta==='string'){state.text+=step.text_delta;emit({kind:'mainText',text:state.text});}
  }
  if(event.event==='result'){
    const result=event.result||{};
    if(result.status==='SUCCESS'&&typeof result.response==='string'&&result.response.trim()){state.text=result.response;state.completed=true;emit({kind:'mainText',text:state.text});}
    else state.error=result.error||'Antigravity가 완료된 답변을 반환하지 않았습니다.';
  }
}
export function verifiedManifest(manifest){
  const url=new URL(manifest.url);
  if(url.protocol!=='https:'||url.hostname!=='storage.googleapis.com'||!url.pathname.startsWith('/antigravity-public/antigravity-cli/')||! /^[a-f0-9]{128}$/.test(manifest.sha512)||! /^\d+\.\d+\.\d+/.test(manifest.version))throw Error('Antigravity 공식 배포 정보를 검증하지 못했습니다.');
  return manifest;
}
export async function installAntigravity(dataDir){
  if(!['win32','darwin','linux'].includes(process.platform)||!['x64','arm64'].includes(process.arch))throw Error('Antigravity CLI가 지원하지 않는 운영체제입니다.');
  const platform=`${process.platform==='win32'?'windows':process.platform}_${process.arch==='x64'?'amd64':'arm64'}`;
  const response=await fetch(`https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/${platform}.json`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Antigravity 공식 배포 목록 다운로드 실패');
  const manifest=verifiedManifest(await response.json());
  const binary=await fetch(manifest.url,{signal:AbortSignal.timeout(180000)});if(!binary.ok)throw Error('Antigravity 다운로드 실패');
  const bytes=Buffer.from(await binary.arrayBuffer());if(createHash('sha512').update(bytes).digest('hex')!==manifest.sha512)throw Error('Antigravity SHA512 검증 실패. 실행하지 않았습니다.');
  const target=path.join(dataDir,'cli','antigravity',process.platform==='win32'?'agy.exe':'agy');await mkdir(path.dirname(target),{recursive:true});await writeFile(target+'.tmp',bytes);await chmod(target+'.tmp',0o755);await rename(target+'.tmp',target);
  process.env.DIALOGUE_ANTIGRAVITY_EXE=target;return target;
}
