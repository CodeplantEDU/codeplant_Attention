import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {runtimePaths,providerPaths,backendEnvironment,installProvider,siteRoot} from '../runtime.mjs';
import {documentCommand} from '../../site/lib/python.mjs';
test('each desktop architecture selects its own bundled tools and literal paths',()=>{
  for(const platform of ['win32','darwin'])for(const arch of ['x64','arm64']){
    const r=runtimePaths('/resources with spaces',platform,arch);
    assert.ok(r.node.includes(`${platform}-${arch}`));assert.equal(path.basename(r.filetools),'attention-files'+(platform==='win32'?'.exe':''));
    const providers=providerPaths('/private space','codex',platform,arch);
    assert.ok(providers[0].includes(arch==='arm64'?'aarch64':'x86_64'));
    assert.ok(providers[0].endsWith(platform==='win32'?'codex.exe':'codex'));
  }
});
test('only installed provider binary paths enter the child; existing env is not mutated',async t=>{
  const base=await mkdtemp(path.join(tmpdir(),'attention-env-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const binary=providerPaths(base,'claude')[0];await mkdir(path.dirname(binary),{recursive:true});await writeFile(binary,'test');
  const original=process.env.DIALOGUE_CLAUDE_EXE;
  const env=backendEnvironment('/resources',base);
  assert.equal(env.DIALOGUE_CLAUDE_EXE,binary);assert.equal(process.env.DIALOGUE_CLAUDE_EXE,original);
  assert.ok(env.DIALOGUE_ASSETS.endsWith(path.join('site','public','assets')));
});
test('untrusted provider cannot become a package or shell argument',async()=>{
  assert.throws(()=>providerPaths('/private','codex;evil'));
  await assert.rejects(installProvider('/resources','/private','../evil'));
});
test('packaged document engine has fixed operations and avoids Python dependency',()=>{
  const before=process.env.DIALOGUE_FILETOOLS;process.env.DIALOGUE_FILETOOLS='/tools/attention files';
  try{assert.deepEqual(documentCommand('render','ignored.py',['/data/spec']),{exe:'/tools/attention files',args:['render','/data/spec']});assert.throws(()=>documentCommand('exec','a',[]));}
  finally{if(before===undefined)delete process.env.DIALOGUE_FILETOOLS;else process.env.DIALOGUE_FILETOOLS=before;}
});
test('source checkout and packaged app use the same site assets without a duplicate checkout',async t=>{
  const base=await mkdtemp(path.join(tmpdir(),'attention-roots-'));t.after(()=>rm(base,{recursive:true,force:true}));
  assert.equal(siteRoot(path.join(base,'desktop')),path.join(base,'site'));
  await mkdir(path.join(base,'resources','site'),{recursive:true});await writeFile(path.join(base,'resources','site','server.mjs'),'');
  assert.equal(siteRoot(path.join(base,'resources')),path.join(base,'resources','site'));
});
