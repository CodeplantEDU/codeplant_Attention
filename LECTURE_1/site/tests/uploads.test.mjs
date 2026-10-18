import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createService} from '../server.mjs';

test('references above 10MB, five files and 60000 characters survive upload, selection and followup without truncation',async t=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'attention-large-references-')),calls=[];
  const app=await createService({dataDir,check:async()=>({installed:true,loggedIn:true}),cli:async(provider,{prompt})=>{calls.push(prompt);return {text:'Public fixture response',agentCount:0};}});
  t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));await app.refresh();
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const state=()=>fetch(base+'/api/state').then(r=>r.json()),{token}=await state();
  const post=(route,data)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json','x-local-token':token},body:JSON.stringify(data)});
  const text='A'.repeat(10*1024*1024+1)+'REFERENCE-END',ids=[];
  for(let i=0;i<6;i++){
    const content=i===0?text:`FILE-${i}-END`;
    const response=await post('/api/uploads',{name:`public-${i}.txt`,base64:Buffer.from(content).toString('base64')});
    assert.equal(response.status,201);const file=await response.json();ids.push(file.id);
    if(i===0){assert.ok(file.size>10*1024*1024);assert.equal(file.chars,text.length);}
  }
  assert.equal((await state()).uploads.length,6);
  const started=await post('/api/runs',{main:'codex',prompt:'Read the public references',attachmentIds:ids});
  assert.equal(started.status,202);const {id}=await started.json();
  async function finished(){for(let i=0;i<100;i++){const run=app.runs.find(r=>r.id===id);if(run.status!=='running')return run;await new Promise(r=>setTimeout(r,20));}throw Error('Fixture did not finish');}
  assert.equal((await finished()).status,'completed');
  assert.ok(calls[0].includes(text));assert.match(calls[0],/FILE-5-END/);
  const extra=await post('/api/uploads',{name:'followup.md',base64:Buffer.from('B'.repeat(60001)+'FOLLOWUP-END').toString('base64')});
  assert.equal(extra.status,201);
  const continued=await post(`/api/runs/${id}/messages`,{message:'Continue with the added reference',attachmentIds:[(await extra.json()).id]});
  assert.equal(continued.status,202);const run=await finished();assert.equal(run.status,'completed');assert.equal(run.attachments.length,7);
  assert.ok(calls[1].includes(text));assert.match(calls[1],/FOLLOWUP-END/);
  assert.equal((await post('/api/runs',{main:'codex',prompt:'Duplicate check',attachmentIds:[ids[0],ids[0]]})).status,400);
});
