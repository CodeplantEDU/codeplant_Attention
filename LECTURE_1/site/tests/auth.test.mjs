import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService} from '../server.mjs';
import {beginLogin,logoutCLI,geminiHasLogin} from '../lib/providers.mjs';

const testRoot=fileURLToPath(new URL('../../tmp/auth-tests/',import.meta.url));
async function service(t,{loggedIn=false,logoutError=false}={}){
  await mkdir(testRoot,{recursive:true});
  let done,stopped=0,logoutCalls=0;
  const app=await createService({
    dataDir:await mkdtemp(path.join(testRoot,'service-')),
    check:async p=>({installed:true,loggedIn:p==='gemini'?loggedIn:true}),
    login:(_p,_cwd,onUrl,onExit)=>{done=onExit;onUrl('https://accounts.google.com/o/oauth2/auth?state=test');return ()=>{stopped++;};},
    logout:async()=>{logoutCalls++;if(logoutError)throw Error('private detail');loggedIn=false;},
    cli:async()=>new Promise(()=>{})
  });
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());await app.refresh();
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const state=()=>fetch(base+'/api/state').then(r=>r.json());
  const {token}=await state();
  const post=(route,body,localToken=token)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json','x-local-token':localToken},body:JSON.stringify(body)});
  return {app,state,post,finish:async(ok)=>{loggedIn=ok;await done(ok,'authentication failed');},counts:()=>({stopped,logoutCalls})};
}
test('login completes without terminal close; cancellation ignores late callbacks and allows retry',async t=>{
  const s=await service(t);
  assert.equal((await s.post('/api/login',{provider:'gemini'})).status,202);
  assert.equal((await s.state()).connections.gemini.loginRunning,true);
  assert.equal((await s.post('/api/runs',{main:'codex',prompt:'test'})).status,409);
  assert.equal((await s.post('/api/login/cancel',{provider:'gemini'})).status,200);
  await s.finish(false);
  let c=(await s.state()).connections.gemini;
  assert.equal(c.loginRunning,false);assert.equal(c.loginUrl,undefined);assert.match(c.message,/취소/);
  assert.equal(s.counts().stopped,1);
  await s.post('/api/login',{provider:'gemini'});await s.finish(true);
  c=(await s.state()).connections.gemini;
  assert.equal(c.loggedIn,true);assert.equal(c.loginRunning,false);assert.equal(c.loginUrl,undefined);
});
test('logout updates the real check result, protects token boundary and preserves history',async t=>{
  const s=await service(t,{loggedIn:true});
  assert.equal((await s.post('/api/logout',{provider:'gemini'},'wrong')).status,403);
  assert.equal((await s.post('/api/logout',{provider:'codex'})).status,400);
  assert.equal(s.counts().logoutCalls,0);
  assert.equal((await s.post('/api/logout',{provider:'gemini'})).status,200);
  assert.equal((await s.state()).connections.gemini.loggedIn,false);
  assert.deepEqual(s.app.runs,[]);assert.equal(s.counts().logoutCalls,1);
  assert.equal((await s.post('/api/login',{provider:'gemini'})).status,202);
});
test('logout failure stays connected and reports an error instead of success',async t=>{
  const s=await service(t,{loggedIn:true,logoutError:true});
  const response=await s.post('/api/logout',{provider:'gemini'});
  assert.equal(response.status,400);assert.match((await response.json()).error,/실패/);
  const c=(await s.state()).connections.gemini;
  assert.equal(c.loggedIn,true);assert.equal(c.logoutRunning,false);
});
test('account changes are rejected while a model job is active',async t=>{
  const s=await service(t,{loggedIn:true});
  assert.equal((await s.post('/api/runs',{main:'gemini',prompt:'test'})).status,202);
  assert.equal((await s.post('/api/logout',{provider:'gemini'})).status,409);
  assert.equal((await s.post('/api/login',{provider:'codex'})).status,409);
  assert.equal(s.counts().logoutCalls,0);
});
test('Gemini auth child uses installed core exports for login and logout without model calls',async t=>{
  await mkdir(testRoot,{recursive:true});const dir=await mkdtemp(path.join(testRoot,'cli-'));
  const entry=path.join(dir,'gemini.js');
  await writeFile(path.join(dir,'package.json'),'{}');
  await writeFile(entry,'await import("./dist-auth.js");');
  await writeFile(path.join(dir,'dist-auth.js'),`import {EventEmitter} from 'node:events';
import {writeFile,rm} from 'node:fs/promises';import path from 'node:path';
export const coreEvents=new EventEmitter(),CoreEvent={UserFeedback:'feedback'},AuthType={LOGIN_WITH_GOOGLE:'oauth-personal'};
export async function getOauthClient(type){if(type!=='oauth-personal')throw Error('wrong auth');await writeFile(path.join(process.env.GEMINI_CLI_HOME,'oauth_creds.json'),'{}');coreEvents.emit('feedback',{message:'https://accounts.google.com/o/oauth2/auth?state=test'});return {getAccessToken:async()=>({token:'test-only'})};}
export async function clearCachedCredentialFile(){await rm(path.join(process.env.GEMINI_CLI_HOME,'oauth_creds.json'),{force:true});}`);
  const previous={GEMINI_CLI_HOME:process.env.GEMINI_CLI_HOME,DIALOGUE_GEMINI_SCRIPT:process.env.DIALOGUE_GEMINI_SCRIPT};
  process.env.GEMINI_CLI_HOME=dir;process.env.DIALOGUE_GEMINI_SCRIPT=entry;
  t.after(()=>{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  const urls=[];
  const ok=await new Promise(resolve=>beginLogin('gemini',dir,url=>urls.push(url),resolve));
  assert.equal(ok,true);assert.equal(urls.length,1);assert.equal(geminiHasLogin(),true);
  await logoutCLI('gemini',dir);assert.equal(geminiHasLogin(),false);
});
