import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAntigravity,antigravityModels,verifiedManifest,antigravityExecutable} from '../lib/antigravity.mjs';
import {argumentsFor} from '../lib/providers.mjs';
test('Antigravity uses its own stdin protocol and safe supported flags',()=>{
  const args=argumentsFor('antigravity',{model:'actual-model'});
  assert.equal(args[args.indexOf('--input-format')+1],'stream-json');
  assert.equal(args[args.indexOf('--mode')+1],'plan');assert.ok(args.includes('--disable-slash-commands'));assert.ok(!args.includes('--dangerously-skip-permissions'));assert.ok(!args.includes('--approval-mode'));
  assert.throws(()=>argumentsFor('antigravity',{roles:[{name:'x',task:'y'}]}));
  assert.throws(()=>antigravityExecutable({DIALOGUE_ANTIGRAVITY_EXE:'relative.exe'}));
});
test('Antigravity official streaming envelopes preserve chunks and require an actual successful result',()=>{
  const s={text:'',model:'',completed:false},events=[];const emit=e=>events.push(e);
  parseAntigravity({event:'init',conversation_id:'owned',init:{model:'selected'}},emit,s);
  for(const text_delta of ['real ','reply'])parseAntigravity({event:'step_update',step_update:{step_type:'agent_response',state:'ACTIVE',text_delta}},emit,s);
  parseAntigravity({event:'step_update',step_update:{step_type:'tool',text_delta:'not an answer'}},emit,s);
  assert.equal(s.text,'real reply');assert.equal(s.completed,false);assert.equal(s.model,'selected');
  parseAntigravity({event:'result',result:{status:'SUCCESS',response:'real reply'}},emit,s);assert.equal(s.completed,true);assert.equal(events.at(-1).text,'real reply');
  const failed={text:'partial',completed:false};parseAntigravity({event:'result',result:{status:'ERROR',error:'authentication required'}},emit,failed);assert.equal(failed.completed,false);assert.equal(failed.text,'partial');assert.match(failed.error,/authentication/);
});
test('Antigravity model IDs come from CLI output and downloads require official host and SHA512',()=>{
  assert.deepEqual(antigravityModels('Fetching available models...\ngemini-real\tGemini model\nclaude-real\tClaude model\n'),[{id:'gemini-real',label:'Gemini model'},{id:'claude-real',label:'Claude model'}]);
  const m={version:'1.4.2',url:'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.2/agy.exe',sha512:'a'.repeat(128)};assert.equal(verifiedManifest(m),m);
  assert.throws(()=>verifiedManifest({...m,url:'https://evil.example/agy.exe'}));assert.throws(()=>verifiedManifest({...m,sha512:'bad'}));
});
