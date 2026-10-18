import path from 'node:path';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

export const packages={codex:'@openai/codex@0.163.0',claude:'@anthropic-ai/claude-code@2.1.302',gemini:'@google/gemini-cli@0.64.0'};
export const siteRoot=resources=>existsSync(path.join(resources,'site','server.mjs'))?path.join(resources,'site'):path.resolve(resources,'../site');
export function runtimePaths(resources,platform=process.platform,arch=process.arch){
  const root=path.join(resources,'runtime',`${platform}-${arch}`);
  return {root,node:path.join(root,'node',platform==='win32'?'node.exe':'bin/node'),
    npm:path.join(root,'node',platform==='win32'?'node_modules/npm/bin/npm-cli.js':'lib/node_modules/npm/bin/npm-cli.js'),
    filetools:path.join(root,'filetools',platform==='win32'?'attention-files.exe':'attention-files')};
}
export function providerPaths(base,provider,platform=process.platform,arch=process.arch){
  if(!Object.hasOwn(packages,provider))throw Error('AI 선택을 확인하세요.');
  const modules=path.join(base,'cli',provider,'node_modules');
  const suffix=platform==='win32'?'.exe':'';
  if(provider==='gemini')return [path.join(modules,'@google/gemini-cli/bundle/gemini.js')];
  const scope=provider==='codex'?'@openai':'@anthropic-ai';
  const pkg=provider==='codex'?'codex':'claude-code';
  const triple=`${arch==='arm64'?'aarch64':'x86_64'}-${platform==='darwin'?'apple-darwin':platform==='win32'?'pc-windows-msvc':'unknown-linux-musl'}`;
  const tail=provider==='codex'?['vendor',triple,'bin','codex'+suffix]:['claude'+suffix];
  return [path.join(modules,scope,`${pkg}-${platform}-${arch}`,...tail),
    path.join(modules,scope,pkg,'node_modules',scope,`${pkg}-${platform}-${arch}`,...tail),
    path.join(modules,scope,pkg,'bin',provider+suffix)];
}
export function installedProviders(base){return Object.keys(packages).filter(p=>providerPaths(base,p).some(existsSync));}
export function backendEnvironment(resources,base){
  const runtime=runtimePaths(resources),env={...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  // Only this child gets these paths; existing terminal accounts and PATH are unchanged.
  env.PATH=path.dirname(runtime.node)+path.delimiter+(env.PATH||'');
  env.DIALOGUE_NODE_EXE=runtime.node;env.DIALOGUE_FILETOOLS=runtime.filetools;
  env.DIALOGUE_ASSETS=path.join(siteRoot(resources),'public/assets');
  env.ATTENTION_SITE_ROOT=siteRoot(resources);
  for(const [p,key] of Object.entries({codex:'DIALOGUE_CODEX_EXE',claude:'DIALOGUE_CLAUDE_EXE',gemini:'DIALOGUE_GEMINI_SCRIPT'})){
    const found=providerPaths(base,p).find(existsSync);if(found)env[key]=found;
  }
  return env;
}
export async function installProvider(resources,base,provider){
  if(!Object.hasOwn(packages,provider))throw Error('AI 선택을 확인하세요.');
  const prefix=path.join(base,'cli',provider);await mkdir(prefix,{recursive:true});
  await writeFile(path.join(prefix,'package.json'),JSON.stringify({private:true}));
  const {node,npm}=runtimePaths(resources);
  await new Promise((resolve,reject)=>{
    const child=spawn(node,[npm,'install','--prefix',prefix,'--registry=https://registry.npmjs.org',
      '--no-audit','--no-fund','--save-exact',packages[provider]],{
      env:{...backendEnvironment(resources,base),npm_config_cache:path.join(base,'npm-cache')},windowsHide:true,shell:false,stdio:'ignore'});
    const timer=setTimeout(()=>{child.kill();reject(Error('다운로드 시간이 초과됐습니다. 인터넷 연결을 확인하고 다시 시도하세요.'));},600000);
    child.on('error',()=>{clearTimeout(timer);reject(Error('AI 실행 도구를 준비하지 못했습니다. 앱을 다시 실행해 주세요.'));});
    child.on('close',code=>{clearTimeout(timer);code===0&&providerPaths(base,provider).some(existsSync)?resolve():reject(Error('공식 AI 도구 다운로드에 실패했습니다. 인터넷·보안 프로그램을 확인하고 다시 시도하세요.'));});
  });
}
