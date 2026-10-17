import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const isFile=p=>{try{return existsSync(p);}catch{return false;}};
export function executable(provider,env=process.env){
  const name=provider==='codex'?'codex.exe':'claude.exe';
  const override=env[provider==='codex'?'DIALOGUE_CODEX_EXE':'DIALOGUE_CLAUDE_EXE'];
  if(override){if(!path.isAbsolute(override)||!isFile(override)||/\.(cmd|bat|ps1)$/i.test(override))throw Error('실행 파일 경로를 확인하세요.');return override;}
  const paths=(env.PATH||'').split(path.delimiter).map(x=>path.join(x,name));
  if(provider==='claude')paths.unshift(path.join(os.homedir(),'.local','bin',name));
  else {
    const target=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
    const pkg=`codex-win32-${process.arch}`;
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
  for(const k of ['OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY','CLAUDE_CODE_SIMPLE'])delete env[k];
  return env;
}
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
export async function connection(provider,cwd){
  try{
    const exe=executable(provider);
    const [v,a]=await Promise.all([capture(exe,['--version'],{cwd}),capture(exe,provider==='codex'?['login','status']:['auth','status'],{cwd})]);
    let loggedIn=false;
    if(provider==='codex')loggedIn=a.code===0&&/Logged in/i.test(a.out+a.err);
    else {try{loggedIn=a.code===0&&JSON.parse(a.out).loggedIn===true;}catch{}}
    return {installed:true,loggedIn,version:v.out.trim().slice(0,70),message:loggedIn?'기존 로그인 사용':'본인 계정 로그인이 필요합니다.',loginRunning:false};
  }catch{return {installed:false,loggedIn:false,version:'',message:'설치 또는 실행 경로를 확인하세요.',loginRunning:false};}
}

export function argumentsFor(provider,{roles=[],model=''}={}){
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
    const child=spawn(executable(provider),argumentsFor(provider,{roles,model}),{cwd,env:loginEnvironment(),windowsHide:true,shell:false});
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
  const args=provider==='codex'?['login']:['auth','login','--claudeai'];
  const child=spawn(executable(provider),args,{cwd,env:loginEnvironment(),windowsHide:true,shell:false});
  let data='';const timer=setTimeout(()=>kill(child),300000);
  function receive(chunk){
    data=(data+chunk).slice(-16000);
    for(const match of data.matchAll(/https:\/\/[^\s<>"']+/g))try{
      const url=new URL(match[0]);
      if(['auth.openai.com','auth0.openai.com','claude.ai','platform.claude.com','console.anthropic.com'].includes(url.hostname))onUrl(url.href);
    }catch{}
  }
  child.stdout.on('data',receive);child.stderr.on('data',receive);child.stdin.end();
  child.on('error',()=>{clearTimeout(timer);onExit(false);});
  child.on('close',code=>{clearTimeout(timer);onExit(code===0);});
  return ()=>kill(child);
}
