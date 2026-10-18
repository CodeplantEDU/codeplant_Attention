import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {geminiEntrypoint,geminiHasLogin} from '../lib/providers.mjs';

export async function loadAuthCore(entry=geminiEntrypoint()){
  // shortcut: bundled CLI core exports can change; fail clearly instead of editing credentials ourselves.
  const source=await readFile(entry,'utf8');
  const bundle=source.match(/await import\("\.\/(dist-[\w-]+\.js)"\)/);
  const modulePath=bundle?path.join(path.dirname(entry),bundle[1]):path.join(path.dirname(entry),'../node_modules/@google/gemini-cli-core/dist/index.js');
  const core=await import(pathToFileURL(modulePath).href);
  if(typeof core.getOauthClient!=='function'||typeof core.clearCachedCredentialFile!=='function')throw Error('unsupported Gemini authentication module');
  return core;
}

async function main(){
  const action=process.argv[2];
  if(!['login','logout'].includes(action))throw Error('invalid authentication action');
  const core=await loadAuthCore();
  if(action==='logout'){
    await core.clearCachedCredentialFile();
    if(geminiHasLogin())throw Error('credentials were not cleared');
  }else{
    core.coreEvents.on(core.CoreEvent.UserFeedback,event=>{
      for(const match of String(event.message).matchAll(/https:\/\/accounts\.google\.com\/[^\s<>"']+/g)){
        process.stdout.write('\n'+JSON.stringify({url:match[0]})+'\n');
      }
    });
    const client=await core.getOauthClient(core.AuthType.LOGIN_WITH_GOOGLE,{
      getProxy:()=>undefined,isBrowserLaunchSuppressed:()=>false,getAcpMode:()=>false,isInteractive:()=>false
    });
    if(!(await client.getAccessToken()).token||!geminiHasLogin())throw Error('authentication did not complete');
  }
  process.stdout.write(JSON.stringify({ok:true})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().then(()=>process.exit(0),()=>{process.stderr.write('Gemini 인증 처리를 완료하지 못했습니다. CLI 설치·네트워크·로그인을 확인하세요.\n');process.exit(1);});
}
