import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {connectionSummary} from '../auth.mjs';

// Minimal DOM fixture: run the real renderer event handlers without Electron or accounts.
function element(){return {textContent:'',disabled:false,hidden:false,dataset:{},children:[],listeners:{},append(...nodes){this.children.push(...nodes);},addEventListener(name,callback){this.listeners[name]=callback;},click(){return this.listeners.click?.();}};}
async function setup(connections,{usingExisting=false}={}){
  const nodes=Object.fromEntries(['status','open','check','existing','providers'].map(id=>['#'+id,element()]));
  const actions=[];let polling;
  const attention={status:async()=>({...connectionSummary({connections}),installed:[],usingExisting}),onProgress(){},install:async p=>{actions.push(['install',p]);connections[p[0]].installed=true;},auth:async(...args)=>{actions.push(['auth',...args]);},loginBrowser:async p=>{actions.push(['browser',p]);},open:async()=>{actions.push(['open']);}};
  const context={document:{querySelector:s=>nodes[s],createElement:()=>element()},window:{attention},setInterval:callback=>{polling=callback;}};
  vm.runInNewContext(await readFile(new URL('../setup.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const card=p=>nodes['#providers'].children.find(c=>c.dataset.provider===p);
  const button=(p,a)=>card(p).children.find(c=>c.dataset?.action===a);
  return {nodes,button,actions,poll:()=>polling()};
}
test('start shows three account cards and blocks conversation until one login; existing tools do not skip login UI',async()=>{
  for(const usingExisting of [false,true]){
    const ui=await setup({codex:{installed:true},claude:{installed:true},gemini:{installed:true}},{usingExisting});
    assert.equal(ui.nodes['#providers'].children.length,3);assert.equal(ui.nodes['#open'].disabled,true);
    for(const p of ['codex','claude','gemini'])assert.equal(ui.button(p,'login').disabled,false);
    assert.deepEqual(ui.actions,[]);
  }
});
test('one connected account enables continue and preserves it; ongoing login blocks continue',async()=>{
  const connections={codex:{installed:true,loggedIn:true},gemini:{installed:true}};
  const ui=await setup(connections);
  assert.equal(ui.nodes['#open'].disabled,false);assert.equal(ui.button('codex','login').hidden,true);
  await ui.nodes['#open'].click();assert.deepEqual(ui.actions,[['open']]);
  connections.gemini.loginRunning=true;connections.gemini.loginUrl='https://accounts.google.com/auth';await ui.poll();
  assert.equal(ui.nodes['#open'].disabled,true);assert.equal(ui.button('gemini','browser').hidden,false);
  await ui.button('gemini','browser').click();assert.deepEqual(ui.actions.at(-1),['browser','gemini']);
  await ui.button('gemini','cancel').click();assert.deepEqual(ui.actions.at(-1),['auth','cancel','gemini']);
});
test('prepare then login uses selected AI only and existing service disables missing-tool installation',async()=>{
  const connections={codex:{installed:false}};
  const ui=await setup(connections);await ui.button('codex','login').click();
  assert.equal(JSON.stringify(ui.actions),JSON.stringify([['install',['codex']],['auth','check'],['auth','login','codex']]));
  const existing=await setup({codex:{installed:false}},{usingExisting:true});
  assert.equal(existing.button('codex','login').disabled,true);
});
