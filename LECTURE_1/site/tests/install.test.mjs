import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService} from '../server.mjs';
import {localToolPaths,adoptLocalTools,npmEntrypoint} from '../lib/install.mjs';

const root=fileURLToPath(new URL('../../tmp/install-tests/',import.meta.url));
async function fixture(t,installer){
  await mkdir(root,{recursive:true});const dataDir=await mkdtemp(path.join(root,'case-'));
  let installed=false;
  const app=await createService({dataDir,installer:async p=>{const message=await installer(p);installed=true;return message;},check:async p=>({installed:p!=='claude'||installed,loggedIn:p==='codex'}),onShutdown:()=>{throw Error('must not shut down during install');}});
  t.after(()=>app.close());await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));await app.refresh();
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const state=()=>fetch(base+'/api/state').then(r=>r.json());const {token}=await state();
  const post=(route,body,localToken=token)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json','x-local-token':localToken},body:JSON.stringify(body)});
  return {app,state,post,dataDir};
}
async function finished(s){for(let i=0;i<100;i++){const state=await s.state();if(!state.installing)return state;await new Promise(r=>setTimeout(r,10));}throw Error('install did not finish');}
test('installation is authenticated, validates targets, reports progress and blocks conflicting operations',async t=>{
  let complete,calls=0;const s=await fixture(t,()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
  assert.equal((await s.post('/api/install',{provider:'claude'},'wrong')).status,403);
  for(const provider of ['invalid','__proto__',['claude']])assert.equal((await s.post('/api/install',{provider})).status,400);
  assert.equal(calls,0);
  assert.equal((await s.post('/api/install',{provider:'claude'})).status,202);
  const progress=await s.state();assert.equal(progress.installing,'claude');assert.equal(progress.installations.claude.status,'installing');
  for(const [route,body] of [['/api/shutdown',{}],['/api/login',{provider:'codex'}],['/api/logout',{provider:'codex'}],['/api/runs',{main:'codex',prompt:'test'}],['/api/install',{provider:'gemini'}]])assert.equal((await s.post(route,body)).status,409);
  complete('public success');const state=await finished(s);
  assert.equal(state.installations.claude.status,'completed');assert.equal(state.connections.claude.installed,true);assert.equal(calls,1);
  assert.equal((await s.post('/api/install',{provider:'claude'})).status,200);assert.equal(calls,1);
  assert.deepEqual(JSON.parse(await readFile(path.join(s.dataDir,'runs.json'),'utf8')),[]);
});
test('failed install can retry and document packages use the same protected state contract',async t=>{
  let count=0;const s=await fixture(t,async p=>{count++;if(count===1)throw Error('public download failure');return p+' installed';});
  await s.post('/api/install',{provider:'documents'});
  assert.equal((await finished(s)).installations.documents.status,'failed');
  assert.equal((await s.post('/api/install',{provider:'documents'})).status,202);
  assert.equal((await finished(s)).installations.documents.status,'completed');
  assert.equal(count,2);
});
test('private CLI paths support native platforms, avoid shell wrappers and only change the supplied environment',async()=>{
  await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'tools-'));
  for(const platform of ['win32','darwin','linux'])for(const arch of ['x64','arm64'])for(const p of ['codex','claude','gemini']){
    assert.ok(localToolPaths(dir,p,platform,arch).every(file=>path.isAbsolute(file)&&! /\.(cmd|bat|ps1)$/.test(file)));
  }
  assert.throws(()=>localToolPaths(dir,'../bad'));
  const file=localToolPaths(dir,'claude')[0];await mkdir(path.dirname(file),{recursive:true});await writeFile(file,'fixture');
  const env={};adoptLocalTools(dir,env);assert.equal(env.DIALOGUE_CLAUDE_EXE,file);
  assert.ok(!process.env.DIALOGUE_CLAUDE_EXE?.startsWith(dir));
  assert.throws(()=>npmEntrypoint({npm_execpath:'bad.cmd'},path.join(dir,'node.exe')),/npm/);
});
