import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService,validateRun,validatePeers,dialogueRequested,requestedRounds} from '../server.mjs';
import {requestedFormats,parseFilePackage} from '../lib/files.mjs';
import {argumentsFor,parseEvent,parseOwnedActivity,codexModelOptions,runCLI,geminiEnvironment} from '../lib/providers.mjs';
import {control} from '../tools/control.mjs';

const ready=async()=>({installed:true,loggedIn:true,version:'test',message:'test'});
test('fresh personal workspaces start empty and identify their own server without exposing filesystem paths',async t=>{
  const a=await setup(t,async()=>{throw Error('No model call expected');});
  const b=await setup(t,async()=>{throw Error('No model call expected');});
  const health=await fetch(a.url+'/api/health').then(r=>r.json());
  const other=await fetch(b.url+'/api/health').then(r=>r.json());
  assert.match(health.workspace,/^[a-f0-9]{16}$/);
  assert.notEqual(health.workspace,other.workspace);
  assert.ok(!JSON.stringify(health).includes(a.dataDir));
  const state=await a.get();assert.deepEqual(state.runs,[]);assert.deepEqual(state.uploads,[]);
});
test('model list excludes hidden/invalid entries and passes selected IDs to both CLIs',()=>{
  const models=codexModelOptions([{model:'gpt-5.6-sol',isDefault:true},{model:'gpt-5.6-sol'},{model:'internal',hidden:true},{model:'--bad'},{model:'gpt-6-sol'}]);
  assert.deepEqual(models.map(x=>x.id),['gpt-5.6-sol','gpt-6-sol']);
  assert.equal(models[1].disabled,undefined);
  assert.equal(codexModelOptions([])[0].disabled,true);
  for(const [provider,model] of [['codex','gpt-5.6-sol'],['claude','sonnet']]){
    const args=argumentsFor(provider,{model});assert.equal(args[args.indexOf('--model')+1],model);
  }
});
async function setup(t,cli,check=ready,options={}){
  const testRoot=fileURLToPath(new URL('../../tmp/dialogue-tests/',import.meta.url));
  await mkdir(testRoot,{recursive:true});
  const dataDir=await mkdtemp(path.join(testRoot,'case-'));
  const app=await createService({dataDir,cli,check,...options});
  t.after(()=>app.close());
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await app.refresh();
  const url=`http://127.0.0.1:${app.server.address().port}`;
  const get=async()=>fetch(url+'/api/state').then(r=>r.json());
  const {token}=await get();
  const post=(p,data,headers={})=>fetch(url+p,{method:'POST',headers:{'content-type':'application/json','x-local-token':token,...headers},body:JSON.stringify(data)});
  return {app,url,get,post,dataDir};
}
async function wait(get,status){
  for(let i=0;i<80;i++){const s=await get();if(s.runs[0]?.status===status)return s.runs[0];await new Promise(r=>setTimeout(r,20));}
  throw Error(`status ${status} not reached`);
}
test('local shutdown checks its token, persists records and closes only its own server',async t=>{
  let finished;const closed=new Promise(resolve=>{finished=resolve;});
  const s=await setup(t,async()=>({text:'test',agentCount:0}),ready,{onShutdown:async()=>{await s.app.close();finished();}});
  assert.equal((await s.get()).canShutdown,true);
  assert.equal((await s.post('/api/shutdown',{}, {'x-local-token':'wrong'})).status,403);
  assert.equal((await s.post('/api/shutdown',{})).status,200);
  await closed;
  assert.deepEqual(JSON.parse(await readFile(path.join(s.dataDir,'runs.json'),'utf8')),[]);
  await assert.rejects(()=>fetch(s.url+'/api/health',{signal:AbortSignal.timeout(1000)}));
});
test('shutdown is opt-in and refuses active work or authentication',async t=>{
  const basic=await setup(t,async()=>({text:'test',agentCount:0}));
  assert.equal((await basic.post('/api/shutdown',{})).status,403);
  let calls=0;
  const s=await setup(t,async(_p,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('stopped')))),async p=>({...await ready(),loggedIn:p!=='claude'}),{onShutdown:()=>{calls++;},login:()=>()=>{}});
  assert.equal((await s.post('/api/login',{provider:'claude'})).status,202);
  assert.equal((await s.post('/api/shutdown',{})).status,409);
  await s.post('/api/login/cancel',{provider:'claude'});
  assert.equal((await s.post('/api/runs',{main:'codex',prompt:'public fixture'})).status,202);
  assert.equal((await s.post('/api/shutdown',{})).status,409);
  assert.equal(calls,0);
});
for(const main of ['codex','claude'])test(`${main} main: actual delegate branch and conversation order`,async t=>{
  const calls=[];
  const cli=async(provider,opts)=>{
    calls.push({provider,...opts});
    if(opts.roles.length)opts.onEvent({kind:'agent',id:'native-1',name:'helper_1',status:'completed',text:'native findings'});
    return {text:`reply-${calls.length}`,model:'real-test-model',agentCount:opts.roles.length};
  };
  const s=await setup(t,cli);
  const response=await s.post('/api/runs',{prompt:'공개 예제',main,peer:main==='codex'?'claude':'codex',rounds:2,agentRoles:[{name:'검토',task:'검증'}]});assert.equal(response.status,202);
  const run=await wait(s.get,'completed');const peer=main==='codex'?'claude':'codex';
  assert.deepEqual(calls.map(x=>x.provider),[main,peer,main,peer,main]);
  assert.match(calls[2].prompt,/reply-2/);assert.match(calls[3].prompt,/reply-3/);
  assert.match(calls[2].prompt,/native findings/);
  assert.equal(calls[0].roles.length,1);assert.equal(calls[1].roles.length,0);
  assert.equal(run.agents.length,1);assert.equal(run.final,'reply-5');
  assert.equal(JSON.parse(await readFile(path.join(s.dataDir,'runs.json'),'utf8'))[0].status,'completed');
  const exported=await fetch(s.url+`/api/runs/${run.id}/export`).then(x=>x.text());assert.match(exported,/reply-5/);
});
for(const main of ['codex','claude','gemini'])test(`${main} combines both peers with separate models and roles, and followups stay main-only unless requested`,async t=>{
  const peers=['codex','claude','gemini'].filter(p=>p!==main),calls=[];
  const models=Object.fromEntries([main,...peers].map(p=>[p,p+'-model']));
  const peerSettings=Object.fromEntries(peers.map(p=>[p,{role:p+' unique review',agentRoles:p==='gemini'?[]:[{name:p+' helper',task:'public review'}]}]));
  const s=await setup(t,async(p,opts)=>{
    calls.push({p,...opts});
    for(let i=0;i<opts.roles.length;i++)opts.onEvent({kind:'agent',id:'same-id',name:'helper_'+(i+1),status:'completed',text:p+' findings'});
    return {text:'response:'+p+':'+calls.length,agentCount:opts.roles.length};
  });
  const response=await s.post('/api/runs',{main,peers,peerSettings,models,prompt:'public dual peer task',rounds:2});assert.equal(response.status,202);
  const {id}=await response.json(),run=await wait(s.get,'completed');
  assert.deepEqual(calls.map(c=>c.p),[main,...peers,main,...peers,main]);
  assert.equal(run.roundsCompleted,2);
  for(let i=0;i<peers.length;i++){
    const p=peers[i];assert.equal(calls[i+1].model,models[p]);assert.match(calls[i+1].prompt,new RegExp(p+' unique review'));
    assert.ok(calls[3].prompt.includes('response:'+p+':'+(i+2)));
  }
  assert.ok(!calls[2].prompt.includes('response:'+peers[0]+':2'),'reviewers receive the same prior draft');
  const exported=await fetch(s.url+`/api/runs/${id}/export`).then(r=>r.text());for(const p of peers)assert.ok(exported.includes(p+' unique review'));
  let count=calls.length;
  await s.post(`/api/runs/${id}/messages`,{message:'설명을 보완해줘'});await wait(s.get,'completed');assert.deepEqual(calls.slice(count).map(c=>c.p),[main]);
  count=calls.length;
  await s.post(`/api/runs/${id}/messages`,{message:'1회 왕복해'});await wait(s.get,'completed');assert.deepEqual(calls.slice(count).map(c=>c.p),[main,...peers,main]);
  assert.ok(calls.slice(count).every(c=>c.roles.length===0));
});
test('peer lists reject main, duplicate and invalid providers; all selected peers must be connected',async t=>{
  for(const peers of [null,'claude',['codex'],['claude','claude'],['claude','gemini','codex'],['invalid']])assert.throws(()=>validatePeers('codex',peers));
  assert.throws(()=>validateRun({main:'codex',peers:['claude','gemini'],prompt:'public',peerSettings:{gemini:{role:'review',agentRoles:[{name:'a',task:'b'}]}}}));
  let calls=0;const s=await setup(t,async()=>{calls++;return {text:'unused'};},async p=>({...await ready(),loggedIn:p!=='gemini'}));
  assert.equal((await s.post('/api/runs',{main:'codex',peers:['claude','gemini'],prompt:'public'})).status,409);assert.equal(calls,0);
});
test('a failing second peer preserves the first review without fabricating a combined final answer',async t=>{
  const calls=[];const s=await setup(t,async p=>{calls.push(p);if(p==='gemini')throw Error('public failure');return {text:p+' response',agentCount:0};});
  await s.post('/api/runs',{main:'codex',peers:['claude','gemini'],prompt:'public'});
  const run=await wait(s.get,'failed');assert.deepEqual(calls,['codex','claude','gemini']);assert.equal(run.final,'');assert.equal(run.roundsCompleted,0);assert.ok(run.messages.some(m=>m.provider==='claude'&&m.text==='claude response'));
});
test('unobserved native subagents fail instead of roleplaying completion',async t=>{
  const s=await setup(t,async()=>({text:'I used agents',agentCount:0}));
  await s.post('/api/runs',{prompt:'test',main:'codex',peer:'claude',rounds:1,agentRoles:[{name:'a',task:'b'}]});
  const run=await wait(s.get,'failed');assert.match(run.error,/실제 실행/);assert.equal(run.final,'');
});
test('stop prevents later provider calls and concurrent jobs',async t=>{
  let calls=0;
  const s=await setup(t,async(_,opts)=>new Promise((resolve,reject)=>{calls++;opts.signal.addEventListener('abort',()=>reject(Error('stop')),{once:true});}));
  const data={prompt:'test',main:'codex',peer:'claude',rounds:1,agentRoles:[]};
  const {id}=await(await s.post('/api/runs',data)).json();
  await new Promise(r=>setTimeout(r,30));assert.equal((await s.post('/api/runs',data)).status,409);
  assert.equal((await s.post(`/api/runs/${id}/stop`,{})).status,202);
  await wait(s.get,'stopped');assert.equal(calls,1);
});
test('HTTP rejects foreign origin, bad token, path access and invalid models',async t=>{
  const s=await setup(t,async()=>({text:'test',agentCount:0}));
  assert.equal((await s.post('/api/runs',{}, {'origin':'https://evil.example'})).status,403);
  assert.equal((await s.post('/api/runs',{}, {'x-local-token':'wrong'})).status,403);
  assert.equal((await fetch(s.url+'/data/runs.json')).status,404);
  assert.equal((await s.post('/api/runs',{prompt:'test',main:'unknown',rounds:1})).status,400);
  assert.throws(()=>validateRun({prompt:'x',main:'codex',peer:'claude',rounds:0}));
  assert.throws(()=>validateRun({prompt:'x',main:'claude',peer:'codex',rounds:1,models:{claude:'x & evil'}}));
});
test('parsers separate native events and fail empty/error outputs',()=>{
  const events=[],state={agentCount:0};const emit=e=>events.push(e);
  parseOwnedActivity({type:'event_msg',payload:{type:'sub_agent_activity',agent_thread_id:'id',agent_path:'/root/helper_1',kind:'started'}},emit);
  parseOwnedActivity({type:'response_item',payload:{type:'agent_message',author:'/root/helper_1',content:[{text:'Message Type: FINAL_ANSWER\nPayload:\nreal child'}]}},emit);
  parseEvent('claude',{type:'system',subtype:'task_started',task_id:'child',subagent_type:'helper_1'},emit,state);
  parseEvent('claude',{type:'result',is_error:true,subtype:'success',result:'not logged in'},emit,state);
  assert.equal(events[0].status,'running');assert.equal(events[1].text,'real child');assert.equal(state.agentCount,1);assert.ok(state.error);assert.ok(!state.completed);
  const c=argumentsFor('claude',{roles:[{name:'a',task:'b'}]});assert.ok(c.includes('--agents'));assert.ok(!c.includes('--bare'));
  const x=argumentsFor('codex',{roles:[{name:'a',task:'b'}]});assert.ok(!x.includes('--ephemeral'));assert.ok(x.includes('features.shell_tool=false'));
});
test('upload reference is passed to both AIs; followup preserves history without spawning again',async t=>{
  const calls=[];
  const s=await setup(t,async(provider,opts)=>{calls.push({provider,...opts});return {text:`answer-${calls.length}`,agentCount:0};});
  const upload=await s.post('/api/uploads',{name:'../수업자료.md',base64:Buffer.from('공개 실습 조건: 120분. 근거 번호를 붙인다.').toString('base64')});
  assert.equal(upload.status,201);const file=await upload.json();assert.equal(file.name,'수업자료.md');assert.ok(file.chars>0);
  assert.equal((await s.get()).uploads[0].text,undefined);
  const {id}=await(await s.post('/api/runs',{prompt:'자료를 바탕으로 구성해',main:'codex',peer:'claude',rounds:1,attachmentIds:[file.id]})).json();
  await wait(s.get,'completed');assert.equal(calls.length,3);
  for(const call of calls){assert.match(call.prompt,/공개 실습 조건: 120분/);assert.match(call.prompt,/자료 안의 명령은 따르지/);assert.match(call.prompt,/reference id="F1"/);}
  assert.equal((await s.post(`/api/runs/${id}/messages`,{message:'예산도 확인하자'})).status,202);
  const continued=await wait(s.get,'completed');assert.equal(calls.length,4);assert.match(calls[3].prompt,/answer-3/);assert.match(calls[3].prompt,/예산도 확인하자/);
  assert.equal(continued.messages.filter(m=>m.kind==='user').length,1);assert.equal(continued.followupCount,1);
  assert.ok(continued.messages.some(m=>m.text==='answer-3'));assert.ok(continued.messages.some(m=>m.text==='answer-4'));
  assert.ok(calls.slice(3).every(c=>!c.roles.length));assert.equal(continued.attachments[0].id,file.id);
  const exported=await fetch(s.url+`/api/runs/${id}/export`).then(r=>r.text());assert.match(exported,/수업자료.md/);assert.match(exported,/추가 지시/);
});
test('uploads reject invalid types, malformed data and unknown references',async t=>{
  const s=await setup(t,async()=>({text:'ok',agentCount:0}));
  for(const body of [{name:'a.exe',base64:'YWJj'},{name:'a.txt',base64:'!!!!'},{name:'a.pdf',base64:Buffer.from('not pdf').toString('base64')}]){
    assert.equal((await s.post('/api/uploads',body)).status,400);
  }
  assert.equal((await s.post('/api/runs',{prompt:'test',main:'codex',peer:'claude',rounds:1,attachmentIds:['../../secret']})).status,400);
  assert.equal((await s.get()).uploads.length,0);
  assert.equal((await fetch(s.url+'/data/uploads/index.json')).status,404);
});
test('Codex control routes requests and never prints local token or login URL',async t=>{
  const actualFetch=globalThis.fetch,calls=[];
  t.after(()=>{globalThis.fetch=actualFetch;});
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>options?{id:'created'}:{token:'private-local-token',connections:{codex:{installed:true,loggedIn:true,version:'x',message:'ok',loginUrl:'private-login-url'}},runs:[],uploads:[],activeRunId:null}};
  };
  const status=JSON.stringify(await control(['status']));assert.ok(!status.includes('private-local-token'));assert.ok(!status.includes('private-login-url'));
  const testRoot=fileURLToPath(new URL('../../tmp/dialogue-tests/',import.meta.url));await mkdir(testRoot,{recursive:true});
  const dir=await mkdtemp(path.join(testRoot,'control-'));
  const requestFile=path.join(dir,'request.json');await writeFile(requestFile,JSON.stringify({prompt:'public task',main:'claude',peer:'codex',rounds:1}));
  assert.equal((await control(['run',requestFile])).id,'created');
  assert.equal(calls.at(-1).url,'http://127.0.0.1:49322/api/runs');
  assert.equal(JSON.parse(calls.at(-1).options.body).main,'claude');
  await assert.rejects(()=>control(['unknown']),/사용법/);
});
test('custom AI roles and both provider delegates remain separate with identical native names',async t=>{
  for(const main of ['codex','claude']){
    const calls=[];
    const s=await setup(t,async(provider,opts)=>{
      calls.push({provider,...opts});
      if(opts.roles.length)opts.onEvent({kind:'agent',id:'same-id',name:'helper_1',status:'completed',text:provider+' findings'});
      return {text:provider+' response',agentCount:opts.roles.length};
    });
    const body={main,peer:main==='codex'?'claude':'codex',prompt:'공개 예제',rounds:2,mainRole:'교육 설계 총괄',peerRole:'일정 실행 검토',agentRoles:[{name:'교육흐름',task:'분석'}],peerAgentRoles:[{name:'시간검토',task:'검토'}]};
    assert.equal((await s.post('/api/runs',body)).status,202);const run=await wait(s.get,'completed');
    assert.equal(run.agents.length,2);assert.deepEqual(run.agents.map(a=>a.name),['교육흐름','시간검토']);
    assert.equal(run.messages.filter(m=>m.kind==='agent').length,2);
    assert.deepEqual(calls.map(c=>c.roles.length),[1,1,0,0,0]);
    assert.match(calls[0].prompt,/교육 설계 총괄/);assert.match(calls[1].prompt,/일정 실행 검토/);assert.match(calls[2].prompt,/교육 설계 총괄/);
    assert.match(calls[2].prompt,/claude findings/);assert.match(calls[2].prompt,/codex findings/);
    await s.post(`/api/runs/${run.id}/messages`,{message:'후속'});await wait(s.get,'completed');assert.ok(calls.slice(5).every(c=>!c.roles.length));
  }
  assert.throws(()=>validateRun({main:'codex',peer:'claude',prompt:'x',rounds:1,mainRole:''}));
  assert.throws(()=>validateRun({main:'codex',peer:'claude',prompt:'x',rounds:1,peerAgentRoles:Array(4).fill({name:'x',task:'y'})}));
});
test('peer delegates cannot borrow main delegate completion as execution evidence',async t=>{
  const s=await setup(t,async(provider,opts)=>{
    if(provider==='codex')opts.onEvent({kind:'agent',id:'main-only',name:'helper_1',status:'completed',text:'main findings'});
    return {text:'reply',agentCount:1};
  });
  await s.post('/api/runs',{main:'codex',peer:'claude',prompt:'public',rounds:1,agentRoles:[{name:'main',task:'test'}],peerAgentRoles:[{name:'peer',task:'test'}]});
  const run=await wait(s.get,'failed');assert.match(run.error,/claude.*실제 실행/);assert.equal(run.final,'');
});
test('round counts above three, automatic completion and manual unlimited stop',async t=>{
  assert.equal(validateRun({prompt:'x',main:'codex',peer:'claude',rounds:99}).rounds,99);
  assert.equal(validateRun({prompt:'x',main:'codex',peer:'claude',rounds:null}).rounds,null);
  assert.ok(dialogueRequested('3회 왕복해'));assert.ok(!dialogueRequested('왕복하지 마. Word로 만들어줘'));
  assert.ok(!dialogueRequested('왕복해의 뜻을 설명해줘'));assert.equal(requestedRounds('왕복 7회 해',1),7);
  let calls=0;
  const s=await setup(t,async()=>({text:`reply-${++calls}`,agentCount:0}));
  await s.post('/api/runs',{main:'codex',peer:'claude',prompt:'public',rounds:4});const counted=await wait(s.get,'completed');assert.equal(calls,9);assert.equal(counted.roundsCompleted,4);
  let autoCalls=0;
  const auto=await setup(t,async()=>({text:++autoCalls===9?'조건 충족\n[[DIALOGUE_DONE]]':'계속',agentCount:0}));
  await auto.post('/api/runs',{main:'codex',peer:'claude',prompt:'public',rounds:null,stopCondition:'조건 충족시 종료'});
  const done=await wait(auto.get,'completed');assert.equal(autoCalls,9);assert.equal(done.roundsCompleted,4);assert.equal(done.final,'조건 충족');
  let manualCalls=0;
  const manual=await setup(t,async(_,opts)=>{
    if(++manualCalls<3)return {text:'[[DIALOGUE_DONE]]',agentCount:0};
    return new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('stop')),{once:true}));
  });
  const {id}=await(await manual.post('/api/runs',{main:'codex',peer:'claude',prompt:'public',rounds:null,stopCondition:''})).json();
  await new Promise(r=>setTimeout(r,40));await manual.post(`/api/runs/${id}/stop`,{});await wait(manual.get,'stopped');assert.equal(manualCalls,3);
});
test('followups are main-only unless the user explicitly asks for round trips',async t=>{
  const calls=[];const s=await setup(t,async(p)=>{calls.push(p);return {text:'answer',agentCount:0};});
  const {id}=await(await s.post('/api/runs',{main:'claude',peer:'codex',prompt:'public',rounds:1})).json();await wait(s.get,'completed');
  await s.post(`/api/runs/${id}/messages`,{message:'내용을 자세히 설명해줘'});let run=await wait(s.get,'completed');assert.deepEqual(calls.slice(3),['claude']);assert.equal(run.lastInteraction.mode,'main');
  const before=calls.length;await s.post(`/api/runs/${id}/messages`,{message:'2회 왕복해'});run=await wait(s.get,'completed');
  assert.deepEqual(calls.slice(before),['claude','codex','claude','codex','claude']);assert.equal(run.roundsCompleted,2);
});
test('Word request in followup creates a real downloadable DOCX using only the main AI',async t=>{
  const calls=[];const s=await setup(t,async(p,opts)=>{
    calls.push(p);
    return {text:opts.prompt.includes('스키마: {"message"')?JSON.stringify({message:'수업안을 Word로 작성했습니다.',files:[{name:'교육계획.docx',title:'공개 교육계획',content:'# 공개 교육계획\n\n대상은 AI 초보 성인이다.\n\n## 시간표\n\n| 활동 | 시간 |\n| --- | --- |\n| 도입 | 10분 |\n| 실습 | 110분 |\n\n총 120분이다.'}]}):'공개 수업 초안',agentCount:0};
  });
  const {id}=await(await s.post('/api/runs',{main:'codex',peer:'claude',prompt:'public lesson',rounds:1})).json();await wait(s.get,'completed');
  const before=calls.length;await s.post(`/api/runs/${id}/messages`,{message:'이 내용을 Word로 만들어줘'});const run=await wait(s.get,'completed');
  assert.deepEqual(calls.slice(before),['codex']);assert.equal(run.files.length,1);assert.equal(run.files[0].name,'교육계획.docx');assert.equal(run.fileContext,undefined);
  const download=await fetch(s.url+run.files[0].url);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);
  const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>10000);
  assert.equal((await fetch(s.url+`/api/runs/${id}/files/00000000-0000-0000-0000-000000000000`)).status,404);
  assert.equal((await fetch(s.url+'/data/generated/'+id)).status,404);
});
test('artifact requests reject path traversal, unsupported extensions and missing actual content',()=>{
  assert.deepEqual(requestedFormats('Word로 만들어줘'),['docx']);assert.deepEqual(requestedFormats('Word 말고 PDF로 만들어줘'),['pdf']);
  assert.deepEqual(requestedFormats('Word로 만들지 마'),[]);
  for(const name of ['../../secret.docx','a.exe'])assert.throws(()=>parseFilePackage(JSON.stringify({files:[{name,content:'x'}]}),['docx']));
  assert.throws(()=>parseFilePackage(JSON.stringify({files:[{name:'x.docx',content:''}]}),['docx']));
  assert.throws(()=>parseFilePackage('파일을 저장했어요',['docx']));
});
test('main-only followup works when the peer is logged out, while requested dialogue is blocked',async t=>{
  let peerOffline=false;const calls=[];
  const s=await setup(t,async p=>{calls.push(p);return {text:'answer',agentCount:0};},async p=>({...await ready(),loggedIn:p==='codex'||!peerOffline}));
  const {id}=await(await s.post('/api/runs',{main:'codex',peer:'claude',prompt:'public',rounds:1})).json();await wait(s.get,'completed');
  peerOffline=true;await s.app.refresh();
  assert.equal((await s.post(`/api/runs/${id}/messages`,{message:'설명해줘'})).status,202);await wait(s.get,'completed');
  assert.deepEqual(calls.slice(3),['codex']);assert.equal((await s.post(`/api/runs/${id}/messages`,{message:'왕복해'})).status,409);
});
test('long followup history is summarized by the main AI while original messages remain',async t=>{
  const calls=[];
  const s=await setup(t,async(p,opts)=>{
    calls.push({p,prompt:opts.prompt,roles:opts.roles});
    return {text:opts.prompt.includes('맥락을 정리하는 단계')?'보존할 조건과 출처 요약':calls.length<=3?'원문'+String(calls.length)+'가'.repeat(24000):'후속 답변',agentCount:0};
  });
  const {id}=await(await s.post('/api/runs',{main:'codex',peer:'claude',prompt:'public',rounds:1})).json();await wait(s.get,'completed');
  const before=calls.length;
  await s.post(`/api/runs/${id}/messages`,{message:'근거를 설명해줘'});const run=await wait(s.get,'completed');
  assert.ok(calls.slice(before).some(x=>x.prompt.includes('맥락을 정리하는 단계')));
  assert.ok(calls.slice(before).every(x=>x.p==='codex'&&x.roles.length===0));
  assert.match(calls.at(-1).prompt,/보존할 조건과 출처 요약/);
  assert.ok(run.messages.some(m=>m.text.startsWith('원문1')&&m.text.length>24000));
  assert.equal(run.final,'후속 답변');
});
for(const main of ['codex','claude','gemini'])test(`${main} alone can start, follow up and create files with other providers disconnected`,async t=>{
  const calls=[];
  const s=await setup(t,async(p,opts)=>{
    calls.push(p);
    return {text:opts.prompt.includes('스키마: {"message"')?JSON.stringify({message:'완료',files:[{name:'결과.md',content:'# 실제 작성 본문'}]}):'메인 답변',agentCount:0};
  },async p=>({...await ready(),loggedIn:p===main}));
  const response=await s.post('/api/runs',{main,prompt:'공개 단독 작업'});assert.equal(response.status,202);
  const {id}=await response.json();let run=await wait(s.get,'completed');assert.equal(run.peer,null);assert.deepEqual(calls,[main]);
  await s.post(`/api/runs/${id}/messages`,{message:'설명해줘'});await wait(s.get,'completed');assert.deepEqual(calls,[main,main]);
  await s.post(`/api/runs/${id}/messages`,{message:'Markdown 파일로 만들어줘'});run=await wait(s.get,'completed');assert.equal(run.files.length,1);
  assert.deepEqual(calls,[main,main,main]);
  assert.equal((await s.post(`/api/runs/${id}/messages`,{message:'왕복해'})).status,400);
  const peer=main==='codex'?'gemini':'codex';
  assert.equal((await s.post('/api/runs',{main,peer,prompt:'public'})).status,409);
  assert.equal((await s.post(`/api/runs/${id}/messages`,{message:'왕복해',peer})).status,409);
});
for(const [main,peer] of [['codex','gemini'],['gemini','claude'],['claude','gemini']])test(`${main} can choose ${peer} while the third provider is offline`,async t=>{
  const calls=[];const s=await setup(t,async p=>{calls.push(p);return {text:'answer',agentCount:0};},async p=>({...await ready(),loggedIn:[main,peer].includes(p)}));
  await s.post('/api/runs',{main,peer,prompt:'public',rounds:1});await wait(s.get,'completed');assert.deepEqual(calls,[main,peer,main]);
});
test('Gemini streaming separates user input from answer, combines deltas and rejects failures',()=>{
  const state={text:'',completed:false,error:''};const events=[];const emit=x=>events.push(x);
  for(const event of [{type:'init',model:'gemini-test',session_id:'owned-session'},{type:'message',role:'user',content:'do not display'},{type:'message',role:'assistant',content:'첫 ',delta:true},{type:'message',role:'assistant',content:'답변',delta:true},{type:'result',status:'success'}])parseEvent('gemini',event,emit,state);
  assert.equal(state.text,'첫 답변');assert.equal(state.model,'gemini-test');assert.equal(state.completed,true);assert.equal(events.length,2);
  parseEvent('gemini',{type:'result',status:'error'},emit,state);assert.match(state.error,/Gemini/);
  assert.throws(()=>validateRun({main:'gemini',prompt:'x',agentRoles:[{name:'x',task:'y'}]}),/내부 에이전트/);
  assert.throws(()=>validateRun({main:'codex',peer:'codex',prompt:'x'}),/다른 AI/);
});
test('Gemini CLI adapter handles a real child stream, isolated settings and cancellation without a Google request',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'attention-gemini-fixture-'));
  const script=path.join(dir,'fake-gemini.js');
  await writeFile(path.join(dir,'oauth_creds.json'),'{}');
  await writeFile(script,`process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'init',model:'fixture'}));console.log(JSON.stringify({type:'message',role:'assistant',content:'fixture response',delta:true}));if(process.argv.includes('waiting'))setInterval(()=>{},1000);else process.stdout.write(JSON.stringify({type:'result',status:'success'}));});`);
  const previous={DIALOGUE_GEMINI_SCRIPT:process.env.DIALOGUE_GEMINI_SCRIPT,GEMINI_CLI_HOME:process.env.GEMINI_CLI_HOME};
  t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  process.env.DIALOGUE_GEMINI_SCRIPT=script;process.env.GEMINI_CLI_HOME=dir;
  const settings=JSON.parse(await readFile(geminiEnvironment().GEMINI_CLI_SYSTEM_SETTINGS_PATH,'utf8'));
  assert.equal(settings.admin.mcp.enabled,false);assert.equal(settings.hooksConfig.enabled,false);assert.deepEqual(settings.tools.core,['attention_no_tools']);
  const result=await runCLI('gemini',{cwd:dir,prompt:'public fixture',timeout:3000});assert.equal(result.text,'fixture response');assert.equal(result.model,'fixture');
  const controller=new AbortController();
  await assert.rejects(()=>runCLI('gemini',{cwd:dir,prompt:'public fixture',model:'waiting',signal:controller.signal,timeout:3000,onEvent:e=>{if(e.kind==='mainText')controller.abort();}}),/중지/);
});
