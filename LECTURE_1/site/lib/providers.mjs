import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const isFile=p=>{try{return existsSync(p);}catch{return false;}};
export const nodeExecutable=(env=process.env)=>env.DIALOGUE_NODE_EXE||process.execPath;
export function geminiEntrypoint(env=process.env){
  const override=env.DIALOGUE_GEMINI_SCRIPT;
  if(override){if(!path.isAbsolute(override)||!isFile(override)||path.extname(override)!=='.js')throw Error('Gemini 실행 경로를 확인하세요.');return override;}
  const roots=[env.APPDATA&&path.join(env.APPDATA,'npm','node_modules'),path.join(path.dirname(process.execPath),'node_modules'),...(env.PATH||'').split(path.delimiter).map(p=>path.join(p,'node_modules'))].filter(Boolean);
  for(const root of roots)for(const entry of ['bundle/gemini.js','dist/index.js']){
    const file=path.join(root,'@google','gemini-cli',entry);if(isFile(file))return file;
  }
  throw Error('Gemini CLI를 찾지 못했습니다. npm install -g @google/gemini-cli로 설치하세요.');
}
export function geminiHasLogin(env=process.env){return isFile(path.join(env.GEMINI_CLI_HOME||path.join(os.homedir(),'.gemini'),'oauth_creds.json'));}
export function executable(provider,env=process.env){
  if(provider==='gemini'){geminiEntrypoint(env);return nodeExecutable(env);}
  const name=provider+(process.platform==='win32'?'.exe':'');
  const override=env[provider==='codex'?'DIALOGUE_CODEX_EXE':'DIALOGUE_CLAUDE_EXE'];
  if(override){if(!path.isAbsolute(override)||!isFile(override)||/\.(cmd|bat|ps1)$/i.test(override))throw Error('실행 파일 경로를 확인하세요.');return override;}
  const paths=(env.PATH||'').split(path.delimiter).map(x=>path.join(x,name));
  if(provider==='claude')paths.unshift(path.join(os.homedir(),'.local','bin',name));
  else {
    const cpu=process.arch==='arm64'?'aarch64':'x86_64';
    const target=`${cpu}-${process.platform==='darwin'?'apple-darwin':process.platform==='win32'?'pc-windows-msvc':'unknown-linux-musl'}`;
    const pkg=`codex-${process.platform}-${process.arch}`;
    for(const root of [env.APPDATA&&path.join(env.APPDATA,'npm','node_modules'),path.join(path.dirname(process.execPath),'node_modules')].filter(Boolean)){
      paths.unshift(path.join(root,'@openai','codex','node_modules','@openai',pkg,'vendor',target,'bin',name));
      paths.push(path.join(root,'@openai',pkg,'vendor',target,'bin',name));
    }
  }
  const found=paths.find(isFile);if(!found)throw Error(`${provider} 실행 파일을 찾지 못했습니다.`);return found;
}
export function loginEnvironment(){
  const env={...process.env};
  // Subscription logins remain in the official CLIs; never copy their credentials.
  for(const k of ['OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY','CLAUDE_CODE_SIMPLE','GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_GENAI_USE_VERTEXAI','GOOGLE_GENAI_USE_GCA','GOOGLE_CLOUD_ACCESS_TOKEN'])delete env[k];
  return env;
}
export function geminiEnvironment(){return {...loginEnvironment(),GEMINI_CLI_NO_RELAUNCH:'true',GEMINI_CLI_SYSTEM_SETTINGS_PATH:fileURLToPath(new URL('./gemini-settings.json',import.meta.url))};}
function kill(child){
  if(!child.pid||child.exitCode!==null)return;
  if(process.platform==='win32'){
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});
    killer.on('error',()=>child.kill());
  }else child.kill('SIGTERM');
}
export function capture(exe,args,{cwd,timeout=20000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{cwd,env:loginEnvironment(),windowsHide:true,shell:false});let out='',err='';
    const timer=setTimeout(()=>{kill(child);reject(Error('연결 확인 시간이 초과됐습니다.'));},timeout);
    child.stdout.on('data',b=>{if(out.length<1000000)out+=b;});child.stderr.on('data',b=>{if(err.length<100000)err+=b;});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);resolve({code,out,err});});child.stdin.end();
  });
}
export function codexModelOptions(data){
  const seen=new Set();
  const models=(data||[]).filter(x=>!x.hidden).flatMap(x=>{
    const id=x.model||x.id;
    if(typeof id!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(id)||seen.has(id))return [];
    seen.add(id);return [{id,label:`${id}${x.isDefault?' · CLI 기본 모델':''}`}];
  });
  if(!seen.has('gpt-6-sol'))models.push({id:'gpt-6-sol',label:'gpt-6-sol · 현재 CLI 목록에 없음',disabled:true});
  return models;
}
async function codexModels(exe,cwd){
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,['app-server','--stdio'],{cwd,env:loginEnvironment(),windowsHide:true,shell:false});
    let buffer='',size=0,settled=false;
    const finish=(error,models)=>{if(settled)return;settled=true;clearTimeout(timer);kill(child);error?reject(error):resolve(models);};
    const timer=setTimeout(()=>finish(Error('모델 목록 조회 시간 초과')),15000);
    const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
    child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
    child.on('error',()=>finish(Error('모델 목록 조회 실패')));
    child.on('close',()=>finish(Error('모델 목록 연결 종료')));
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      size+=Buffer.byteLength(chunk);if(size>1000000){finish(Error('모델 목록 크기 초과'));return;}
      buffer+=chunk;let nl;
      while((nl=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,nl);buffer=buffer.slice(nl+1);let message;try{message=JSON.parse(line);}catch{continue;}
        if(message.error){finish(Error('모델 목록 조회 실패'));return;}
        if(message.id===1){send({method:'initialized'});send({id:2,method:'model/list',params:{limit:100}});}
        if(message.id===2){
          if(!Array.isArray(message.result?.data)){finish(Error('모델 목록 응답 오류'));return;}
          finish(null,codexModelOptions(message.result.data));return;
        }
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'attention_model_list',version:'0.4.1'},capabilities:{experimentalApi:true}}});
  });
}
export async function connection(provider,cwd){
  try{
    const exe=executable(provider);
    if(provider==='gemini'){
      const v=await capture(exe,[geminiEntrypoint(),'--version'],{cwd});
      if(v.code!==0)throw Error('Gemini 실행 실패');
      const loggedIn=geminiHasLogin();
      return {installed:true,loggedIn,version:v.out.trim().slice(0,70),message:loggedIn?'저장된 Google 로그인 사용 · 유효성은 호출 시 확인':'Google 계정 로그인이 필요합니다.',loginRunning:false,
        models:['gemini-2.5-pro','gemini-2.5-flash','gemini-3.1-pro-preview','gemini-3-flash-preview'].map(id=>({id,label:id})),
        modelListMessage:'공식 CLI 모델 이름입니다. 계정별 사용 가능 여부는 호출 시 확인합니다. Gemini 내부 에이전트 연결은 지원하지 않습니다.'};
    }
    const [v,a]=await Promise.all([capture(exe,['--version'],{cwd}),capture(exe,provider==='codex'?['login','status']:['auth','status'],{cwd})]);
    let loggedIn=false;
    if(provider==='codex')loggedIn=a.code===0&&/Logged in/i.test(a.out+a.err);
    else {try{loggedIn=a.code===0&&JSON.parse(a.out).loggedIn===true;}catch{}}
    let models=[],modelListMessage='';
    if(provider==='claude'){
      models=['opus','sonnet','haiku'].map(id=>({id,label:`${id[0].toUpperCase()+id.slice(1)} · ${id}`}));
      modelListMessage='Claude 공식 모델 별칭입니다. 실제 사용 가능 여부는 계정·요금제에 따라 달라집니다.';
    }else if(loggedIn){
      try{models=await codexModels(exe,cwd);modelListMessage='현재 CLI가 반환한 모델 목록입니다. 목록에 없는 모델은 직접 입력으로 시도할 수 있습니다.';}
      catch{modelListMessage='모델 목록을 가져오지 못했습니다. CLI 기본값 또는 직접 입력을 사용하세요.';}
    }
    return {installed:true,loggedIn,version:v.out.trim().slice(0,70),message:loggedIn?'기존 로그인 사용':'본인 계정 로그인이 필요합니다.',loginRunning:false,models,modelListMessage};
  }catch{return {installed:false,loggedIn:false,version:'',message:'설치 또는 실행 경로를 확인하세요.',loginRunning:false};}
}

export function argumentsFor(provider,{roles=[],model=''}={}){
  if(provider==='gemini'){
    if(roles.length)throw Error('Gemini 내부 에이전트는 현재 지원하지 않습니다. 역할을 0개로 설정하세요.');
    return [geminiEntrypoint(),'--output-format','stream-json','--approval-mode','default',...(model?['--model',model]:[]),'-p','제공된 사용자 요청에 답하세요. 도구를 사용하지 마세요.'];
  }
  if(provider==='codex'){
    return ['exec','--json','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only',
      '-c',`features.multi_agent=${roles.length>0}`,'-c','features.shell_tool=false','-c','features.apps=false',
      '-c','features.plugins=false','-c','features.memories=false','-c','skills.include_instructions=false',
      '-c',`agents.max_threads=${Math.max(roles.length+1,2)}`,'-c','model_reasoning_effort="low"',
      ...(model?['--model',model]:[]),'-'];
  }
  const agents=Object.fromEntries(roles.map((r,i)=>[`helper_${i+1}`,{
    description:`${r.name}: ${r.task}`,prompt:`You are ${r.name}. ${r.task}. Use only the supplied task. No files, web, tools or further subagents. Return concise Korean findings under 400 characters.`,tools:[],model:'inherit'}]));
  return ['-p','--restricted','--output-format','stream-json','--verbose','--setting-sources','',
    '--settings','{"disableAllHooks":true}','--tools',roles.length?'Agent':'',
    ...(roles.length?['--allowedTools','Agent','--agents',JSON.stringify(agents)]:[]),
    '--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence',...(model?['--model',model]:[])];
}

export function parseEvent(provider,event,emit,state){
  if(provider==='codex'){
    if(event.type==='thread.started')state.threadId=event.thread_id;
    if(event.type==='item.completed'&&event.item?.type==='agent_message'){
      state.text=event.item.text||'';emit({kind:'mainText',text:state.text});
    }
    if(event.type==='turn.completed')state.completed=true;
    if(event.type==='turn.failed'||event.type==='error')state.error='Codex 호출이 실패했습니다. 로그인·사용량과 모델 설정을 확인하세요.';
    const item=event.item;
    if(item?.type==='collab_tool_call'){
      for(const id of item.receiver_thread_ids||[])emit({kind:'agent',id,name:id,status:item.status==='completed'?'completed':'running'});
    }
  }else if(provider==='gemini'){
    if(event.type==='init'){state.model=event.model;state.threadId=event.session_id;}
    if(event.type==='message'&&event.role==='assistant'){
      state.text=event.delta?state.text+(event.content||''):(event.content||'');emit({kind:'mainText',text:state.text});
    }
    if(event.type==='result'){
      if(event.status!=='success')state.error='Gemini 호출이 실패했습니다. Google 로그인·사용량과 모델 설정을 확인하세요.';
      else state.completed=true;
    }
    if(event.type==='error'&&event.severity==='error')state.error='Gemini 호출이 실패했습니다. Google 로그인·사용량과 모델 설정을 확인하세요.';
  }else {
    if(event.type==='system'&&event.subtype==='init'){state.model=event.model;state.threadId=event.session_id;}
    if(event.type==='system'&&event.subtype==='task_started'){
      state.agentCount++;emit({kind:'agent',id:event.task_id,name:event.subagent_type||event.description,status:'running'});
    }
    if(event.type==='system'&&event.subtype==='task_updated')emit({kind:'agent',id:event.task_id,status:event.patch?.status||'running'});
    if(event.type==='system'&&event.subtype==='task_notification')emit({kind:'agent',id:event.task_id,status:event.status||'completed',text:event.summary});
    if(event.type==='user'&&event.tool_use_result){
      const x=event.tool_use_result;
      const text=typeof x.content==='string'?x.content:Array.isArray(x.content)?x.content.map(c=>c.text||'').join('\n'):'';
      if(x.agentId)emit({kind:'agent',id:x.agentId,status:x.status||'completed',text});
    }
    if(event.type==='assistant'&&!event.parent_tool_use_id){
      const text=(event.message?.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
      if(text){state.text=text;emit({kind:'mainText',text});}
    }
    if(event.type==='result'){
      if(event.is_error||event.subtype!=='success'||!event.result?.trim())state.error='Claude 호출이 실패했습니다. 로그인·사용량과 모델 설정을 확인하세요.';
      else {state.text=event.result;state.completed=true;state.agentCount=Math.max(state.agentCount,event.subagent_stats?.spawned||0);}
    }
  }
}

// This CLI build omits hosted subagent events from stdout; read only the exact owned run's activity.
async function ownRollout(threadId,startedAt){
  if(!/^[a-f0-9-]{36}$/.test(threadId||''))return null;
  const base=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions');
  const dates=new Set();
  for(const offset of [-86400000,0,86400000]){
    const d=new Date(startedAt+offset);
    for(const zone of ['UTC','Asia/Seoul']){
      const s=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
      dates.add(s.replaceAll('-','/'));
    }
  }
  for(const date of dates){
    const dir=path.join(base,date);let list;
    try{list=await readdir(dir);}catch{continue;}
    const file=list.find(x=>x.endsWith(`-${threadId}.jsonl`));
    if(file)return path.join(dir,file);
  }
  return null;
}
export function parseOwnedActivity(record,emit){
  const p=record.payload;
  if(record.type==='turn_context'&&p?.model)emit({kind:'model',model:p.model});
  if(record.type==='event_msg'&&p?.type==='sub_agent_activity'){
    emit({kind:'agent',id:p.agent_thread_id||p.agent_path,name:p.agent_path,status:p.kind==='started'?'running':p.kind});
  }
  if(record.type==='response_item'&&p?.type==='agent_message'&&p.author){
    const text=(p.content||[]).map(c=>c.text||'').join('\n');
    if(text.startsWith('Message Type: FINAL_ANSWER'))emit({kind:'agent',id:p.author,name:p.author,status:'completed',text:text.split('Payload:\n').slice(1).join('Payload:\n')});
  }
}
export async function runCLI(provider,{prompt,cwd,roles=[],model='',signal,onEvent=()=>{},timeout=240000}){
  if(signal?.aborted)throw Error('중지됐습니다.');
  if(provider==='gemini'&&!geminiHasLogin())throw Error('Gemini의 Google 계정 로그인을 먼저 완료하세요.');
  const state={text:'',completed:false,error:'',threadId:null,model,agentCount:0};
  const seen=new Set();let scanned=0,scanning=false,rollout=null;
  const emit=e=>{const key=JSON.stringify(e);if(!seen.has(key)){seen.add(key);onEvent(e);}};
  async function scan(){
    if(provider!=='codex'||!roles.length||!state.threadId||scanning)return;
    scanning=true;
    try{
      rollout ||= await ownRollout(state.threadId,startedAt);if(!rollout)return;
      const info=await stat(rollout);if(info.size>20_000_000)return;
      const data=await readFile(rollout,'utf8');const lines=data.split('\n');
      for(;scanned<lines.length-1;scanned++)try{parseOwnedActivity(JSON.parse(lines[scanned]),e=>{
        if(e.status==='running')state.agentCount++;
        if(e.kind==='model')state.model=e.model;
        emit(e);
      });}catch{}
    }finally{scanning=false;}
  }
  const startedAt=Date.now();
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(executable(provider),argumentsFor(provider,{roles,model}),{cwd,env:provider==='gemini'?geminiEnvironment():loginEnvironment(),windowsHide:true,shell:false});
    let buffer='',size=0,settled=false;
    const timer=setTimeout(()=>{state.error='응답 대기 시간을 초과했습니다.';kill(child);},timeout);
    const poll=setInterval(()=>scan().catch(()=>{}),600);
    const abort=()=>{state.error='중지됐습니다.';kill(child);};signal?.addEventListener('abort',abort,{once:true});
    function done(error){
      if(settled)return;settled=true;clearTimeout(timer);clearInterval(poll);signal?.removeEventListener('abort',abort);
      error?reject(error):resolve(state);
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',text=>{
      size+=Buffer.byteLength(text);if(size>8_000_000){state.error='응답 크기 제한을 초과했습니다.';kill(child);return;}
      buffer+=text;let nl;
      while((nl=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,nl);buffer=buffer.slice(nl+1);try{parseEvent(provider,JSON.parse(line),emit,state);}catch{}}
    });
    // stderr may contain account details; never publish or persist raw CLI diagnostics.
    child.stderr.on('data',()=>{});
    child.on('error',()=>done(Error(`${provider} 프로그램 실행에 실패했습니다.`)));
    child.on('close',async code=>{
      if(buffer.trim())try{parseEvent(provider,JSON.parse(buffer),emit,state);}catch{}
      try{await scan();}catch{}
      if(state.error||code!==0||!state.completed||!state.text.trim())done(Error(state.error||`${provider}가 완료된 답변을 반환하지 않았습니다.`));
      else done();
    });
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
  return result;
}

export function beginLogin(provider,cwd,onUrl,onExit){
  if(provider==='gemini'){
    const child=spawn(nodeExecutable(),[fileURLToPath(new URL('../tools/gemini-auth.mjs',import.meta.url)),'login'],{cwd,env:geminiEnvironment(),windowsHide:true,shell:false});
    let buffer='',finished=false;
    const finish=(ok,message)=>{if(finished)return;finished=true;clearTimeout(timer);onExit(ok,message);};
    const timer=setTimeout(()=>{kill(child);finish(false,'Google 로그인 시간이 초과됐습니다. 다시 로그인하세요.');},300000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      buffer=(buffer+chunk).slice(-32000);let nl;
      while((nl=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,nl);buffer=buffer.slice(nl+1);
        try{const event=JSON.parse(line);if(event.url&&new URL(event.url).hostname==='accounts.google.com')onUrl(event.url);}catch{}
      }
    });
    child.stderr.on('data',()=>{});
    child.stdin.on('error',()=>{});child.stdin.end('y\n');
    child.on('error',()=>finish(false,'Gemini 인증 프로그램을 시작하지 못했습니다.'));
    child.on('close',code=>finish(code===0,code===0?'Google 로그인이 완료됐습니다.':'Google 로그인을 완료하지 못했습니다. 다시 로그인하세요.'));
    return ()=>kill(child);
  }
  const args=provider==='codex'?['login']:['auth','login','--claudeai'];
  const child=spawn(executable(provider),args,{cwd,env:loginEnvironment(),windowsHide:true,shell:false});
  let data='',finished=false;
  const finish=(ok,message)=>{if(finished)return;finished=true;clearTimeout(timer);onExit(ok,message);};
  const timer=setTimeout(()=>{kill(child);finish(false,'로그인 시간이 초과됐습니다. 다시 로그인하세요.');},300000);
  function receive(chunk){
    data=(data+chunk).slice(-16000);
    for(const match of data.matchAll(/https:\/\/[^\s<>"']+/g))try{
      const url=new URL(match[0]);
      if(['auth.openai.com','auth0.openai.com','claude.ai','platform.claude.com','console.anthropic.com'].includes(url.hostname))onUrl(url.href);
    }catch{}
  }
  child.stdout.on('data',receive);child.stderr.on('data',receive);child.stdin.on('error',()=>{});child.stdin.end();
  child.on('error',()=>finish(false,'인증 프로그램을 시작하지 못했습니다. CLI 설치를 확인하세요.'));
  child.on('close',code=>finish(code===0,code===0?'로그인이 완료됐습니다.':'로그인을 완료하지 못했습니다. 다시 로그인하세요.'));
  return ()=>kill(child);
}

export async function logoutCLI(provider,cwd){
  if(!['codex','claude','gemini'].includes(provider))throw Error('AI를 선택하세요.');
  const result=provider==='gemini'
    ?await capture(nodeExecutable(),[fileURLToPath(new URL('../tools/gemini-auth.mjs',import.meta.url)),'logout'],{cwd})
    :await capture(executable(provider),provider==='codex'?['logout']:['auth','logout'],{cwd});
  if(result.code!==0)throw Error('로그아웃에 실패했습니다. CLI 설치와 인증 파일 권한을 확인하세요.');
  const state=await connection(provider,cwd);
  if(!state.installed||state.loggedIn)throw Error('로그아웃 후 연결 해제를 확인하지 못했습니다. 새로 확인을 눌러주세요.');
}
