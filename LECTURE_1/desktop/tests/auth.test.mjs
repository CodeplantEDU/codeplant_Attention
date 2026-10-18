import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createService} from '../../site/server.mjs';
import {authRequest,connectionSummary,canContinue,loginUrl} from '../auth.mjs';

test('setup exposes connection state without local tokens, login URLs or private history',()=>{
  const state={token:'secret',runs:[{prompt:'private'}],uploads:['private'],connections:{codex:{installed:true,loggedIn:true,account:'private'},gemini:{installed:true,loginRunning:true,loginUrl:'https://accounts.google.com/o/oauth2/auth?state=private'}}};
  const summary=connectionSummary(state);
  assert.equal(summary.ready,false);assert.equal(summary.connections.gemini.hasLoginUrl,true);
  assert.doesNotMatch(JSON.stringify(summary),/secret|private|https:/);
  state.connections.gemini.loginRunning=false;assert.equal(canContinue(state),true);
  state.connections.codex.loggedIn=false;assert.equal(canContinue(state),false);
});

test('only each provider official HTTPS login URL can open outside the app',()=>{
  for(const url of ['file:///etc/passwd','javascript:alert(1)','https://accounts.google.com.evil.com/','http://accounts.google.com/','https://user:pass@accounts.google.com/','https://auth.openai.com/']){
    assert.equal(loginUrl({connections:{gemini:{loginRunning:true,loginUrl:url}}},'gemini'),null);
  }
  assert.equal(loginUrl({connections:{gemini:{loginRunning:true,loginUrl:'https://accounts.google.com/auth'}}},'gemini'),'https://accounts.google.com/auth');
  assert.throws(()=>loginUrl({},'invalid'));
});

test('setup login, browser fallback, completion, logout and cancellation use protected local API for all three providers',async t=>{
  const folder=await mkdtemp(path.join(tmpdir(),'attention-desktop-auth-'));
  const connected={},callbacks={},stops={};let modelCalls=0;
  const urls={codex:'https://auth.openai.com/authorize',claude:'https://claude.ai/oauth/authorize',gemini:'https://accounts.google.com/o/oauth2/auth'};
  const app=await createService({dataDir:folder,check:async p=>({installed:true,loggedIn:Boolean(connected[p])}),login:(p,_cwd,onUrl,onExit)=>{callbacks[p]=onExit;onUrl(urls[p]);return ()=>{stops[p]=(stops[p]||0)+1;};},logout:async p=>{connected[p]=false;},cli:async()=>{modelCalls++;throw Error('Unexpected model call');}});
  t.after(async()=>{await app.close();await rm(folder,{recursive:true,force:true});});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));await app.refresh();
  const base=`http://127.0.0.1:${app.server.address().port}`,state=()=>fetch(base+'/api/state').then(r=>r.json());
  for(const p of ['codex','claude','gemini']){
    assert.equal(canContinue(await state()),false);
    await authRequest(base,'login',p);
    assert.equal(loginUrl(await state(),p),urls[p]);
    await authRequest(base,'cancel',p);assert.equal(stops[p],1);
    assert.equal(loginUrl(await state(),p),null);
    await authRequest(base,'login',p);connected[p]=true;await callbacks[p](true,'');
    assert.equal(canContinue(await state()),true);
    await authRequest(base,'check');assert.equal((await state()).connections[p].loggedIn,true);
    await authRequest(base,'logout',p);assert.equal(canContinue(await state()),false);
  }
  await assert.rejects(authRequest(base,'login','invalid'));
  await assert.rejects(authRequest(base,'arbitrary','codex'));
  assert.equal(modelCalls,0);assert.deepEqual(app.runs,[]);
});
