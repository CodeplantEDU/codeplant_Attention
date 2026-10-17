import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService,validateRun} from '../server.mjs';
import {argumentsFor,parseEvent,parseOwnedActivity} from '../lib/providers.mjs';
import {control} from '../tools/control.mjs';

const ready=async()=>({installed:true,loggedIn:true,version:'test',message:'test'});
async function setup(t,cli){
  const testRoot=fileURLToPath(new URL('../../tmp/dialogue-tests/',import.meta.url));
  await mkdir(testRoot,{recursive:true});
  const dataDir=await mkdtemp(path.join(testRoot,'case-'));
  const app=await createService({dataDir,cli,check:ready});
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
for(const main of ['codex','claude'])test(`${main} main: actual delegate branch and conversation order`,async t=>{
  const calls=[];
  const cli=async(provider,opts)=>{
    calls.push({provider,...opts});
    if(opts.roles.length)opts.onEvent({kind:'agent',id:'native-1',name:'helper_1',status:'completed',text:'native findings'});
    return {text:`reply-${calls.length}`,model:'real-test-model',agentCount:opts.roles.length};
  };
  const s=await setup(t,cli);
  const response=await s.post('/api/runs',{prompt:'공개 예제',main,rounds:2,agentRoles:[{name:'검토',task:'검증'}]});assert.equal(response.status,202);
  const run=await wait(s.get,'completed');const peer=main==='codex'?'claude':'codex';
  assert.deepEqual(calls.map(x=>x.provider),[main,peer,main,peer,main]);
  assert.match(calls[2].prompt,/reply-2/);assert.match(calls[3].prompt,/reply-3/);
  assert.match(calls[2].prompt,/native findings/);
  assert.equal(calls[0].roles.length,1);assert.equal(calls[1].roles.length,0);
  assert.equal(run.agents.length,1);assert.equal(run.final,'reply-5');
  assert.equal(JSON.parse(await readFile(path.join(s.dataDir,'runs.json'),'utf8'))[0].status,'completed');
  const exported=await fetch(s.url+`/api/runs/${run.id}/export`).then(x=>x.text());assert.match(exported,/reply-5/);
});
test('unobserved native subagents fail instead of roleplaying completion',async t=>{
  const s=await setup(t,async()=>({text:'I used agents',agentCount:0}));
  await s.post('/api/runs',{prompt:'test',main:'codex',rounds:1,agentRoles:[{name:'a',task:'b'}]});
  const run=await wait(s.get,'failed');assert.match(run.error,/실제 실행/);assert.equal(run.final,'');
});
test('stop prevents later provider calls and concurrent jobs',async t=>{
  let calls=0;
  const s=await setup(t,async(_,opts)=>new Promise((resolve,reject)=>{calls++;opts.signal.addEventListener('abort',()=>reject(Error('stop')),{once:true});}));
  const data={prompt:'test',main:'codex',rounds:1,agentRoles:[]};
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
  assert.equal((await s.post('/api/runs',{prompt:'test',main:'gemini',rounds:1})).status,400);
  assert.throws(()=>validateRun({prompt:'x',main:'codex',rounds:4}));
  assert.throws(()=>validateRun({prompt:'x',main:'claude',rounds:1,models:{claude:'x & evil'}}));
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
  const {id}=await(await s.post('/api/runs',{prompt:'자료를 바탕으로 구성해',main:'codex',rounds:1,attachmentIds:[file.id]})).json();
  await wait(s.get,'completed');assert.equal(calls.length,3);
  for(const call of calls){assert.match(call.prompt,/공개 실습 조건: 120분/);assert.match(call.prompt,/자료 안의 명령은 따르지/);assert.match(call.prompt,/reference id="F1"/);}
  assert.equal((await s.post(`/api/runs/${id}/messages`,{message:'예산도 확인하자'})).status,202);
  const continued=await wait(s.get,'completed');assert.equal(calls.length,6);assert.match(calls[3].prompt,/answer-3/);assert.match(calls[3].prompt,/예산도 확인하자/);
  assert.equal(continued.messages.filter(m=>m.kind==='user').length,1);assert.equal(continued.followupCount,1);
  assert.ok(continued.messages.some(m=>m.text==='answer-3'));assert.ok(continued.messages.some(m=>m.text==='answer-6'));
  assert.ok(calls.slice(3).every(c=>!c.roles.length));assert.equal(continued.attachments[0].id,file.id);
  const exported=await fetch(s.url+`/api/runs/${id}/export`).then(r=>r.text());assert.match(exported,/수업자료.md/);assert.match(exported,/추가 지시/);
});
test('uploads reject invalid types, malformed data, oversized text and unknown references',async t=>{
  const s=await setup(t,async()=>({text:'ok',agentCount:0}));
  for(const body of [{name:'a.exe',base64:'YWJj'},{name:'a.txt',base64:'!!!!'},{name:'a.pdf',base64:Buffer.from('not pdf').toString('base64')},{name:'a.md',base64:Buffer.from('x'.repeat(60001)).toString('base64')}]){
    assert.equal((await s.post('/api/uploads',body)).status,400);
  }
  assert.equal((await s.post('/api/runs',{prompt:'test',main:'codex',rounds:1,attachmentIds:['../../secret']})).status,400);
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
  const requestFile=path.join(dir,'request.json');await writeFile(requestFile,JSON.stringify({prompt:'public task',main:'claude',rounds:1}));
  assert.equal((await control(['run',requestFile])).id,'created');
  assert.equal(calls.at(-1).url,'http://127.0.0.1:49321/api/runs');
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
    const body={main,prompt:'공개 예제',rounds:2,mainRole:'교육 설계 총괄',peerRole:'일정 실행 검토',agentRoles:[{name:'교육흐름',task:'분석'}],peerAgentRoles:[{name:'시간검토',task:'검토'}]};
    assert.equal((await s.post('/api/runs',body)).status,202);const run=await wait(s.get,'completed');
    assert.equal(run.agents.length,2);assert.deepEqual(run.agents.map(a=>a.name),['교육흐름','시간검토']);
    assert.equal(run.messages.filter(m=>m.kind==='agent').length,2);
    assert.deepEqual(calls.map(c=>c.roles.length),[1,1,0,0,0]);
    assert.match(calls[0].prompt,/교육 설계 총괄/);assert.match(calls[1].prompt,/일정 실행 검토/);assert.match(calls[2].prompt,/교육 설계 총괄/);
    assert.match(calls[2].prompt,/claude findings/);assert.match(calls[2].prompt,/codex findings/);
    await s.post(`/api/runs/${run.id}/messages`,{message:'후속'});await wait(s.get,'completed');assert.ok(calls.slice(5).every(c=>!c.roles.length));
  }
  assert.throws(()=>validateRun({main:'codex',prompt:'x',rounds:1,mainRole:''}));
  assert.throws(()=>validateRun({main:'codex',prompt:'x',rounds:1,peerAgentRoles:Array(4).fill({name:'x',task:'y'})}));
});
test('peer delegates cannot borrow main delegate completion as execution evidence',async t=>{
  const s=await setup(t,async(provider,opts)=>{
    if(provider==='codex')opts.onEvent({kind:'agent',id:'main-only',name:'helper_1',status:'completed',text:'main findings'});
    return {text:'reply',agentCount:1};
  });
  await s.post('/api/runs',{main:'codex',prompt:'public',rounds:1,agentRoles:[{name:'main',task:'test'}],peerAgentRoles:[{name:'peer',task:'test'}]});
  const run=await wait(s.get,'failed');assert.match(run.error,/claude.*실제 실행/);assert.equal(run.final,'');
});
