import path from 'node:path';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {capture,nodeExecutable} from './providers.mjs';
import {pythonExecutable} from './python.mjs';
import {installAntigravity} from './antigravity.mjs';

export const packages={codex:'@openai/codex@0.163.0',claude:'@anthropic-ai/claude-code@2.1.302',gemini:'@google/gemini-cli@0.64.0'};
const keys={codex:'DIALOGUE_CODEX_EXE',claude:'DIALOGUE_CLAUDE_EXE',gemini:'DIALOGUE_GEMINI_SCRIPT'};
export function localToolPaths(dataDir,provider,platform=process.platform,arch=process.arch){
  if(provider==='antigravity')return [path.join(dataDir,'cli','antigravity',platform==='win32'?'agy.exe':'agy')];
  if(!Object.hasOwn(packages,provider))throw Error('설치할 AI를 선택하세요.');
  const modules=path.join(dataDir,'cli',provider,'node_modules'),suffix=platform==='win32'?'.exe':'';
  if(provider==='gemini')return ['bundle/gemini.js','dist/index.js'].map(entry=>path.join(modules,'@google/gemini-cli',entry));
  const scope=provider==='codex'?'@openai':'@anthropic-ai',pkg=provider==='codex'?'codex':'claude-code';
  const triple=`${arch==='arm64'?'aarch64':'x86_64'}-${platform==='darwin'?'apple-darwin':platform==='win32'?'pc-windows-msvc':'unknown-linux-musl'}`;
  const tail=provider==='codex'?['vendor',triple,'bin','codex'+suffix]:['claude'+suffix];
  return [path.join(modules,scope,`${pkg}-${platform}-${arch}`,...tail),path.join(modules,scope,pkg,'node_modules',scope,`${pkg}-${platform}-${arch}`,...tail),path.join(modules,scope,pkg,'bin',provider+suffix)];
}
export function adoptLocalTools(dataDir,env=process.env){
  const agy=path.join(dataDir,'cli','antigravity',process.platform==='win32'?'agy.exe':'agy');if(existsSync(agy))env.DIALOGUE_ANTIGRAVITY_EXE=agy;
  for(const provider of Object.keys(packages)){
    const file=localToolPaths(dataDir,provider).find(existsSync);
    if(file)env[keys[provider]]=file;
  }
}
export function npmEntrypoint(env=process.env,node=process.execPath){
  const base=path.dirname(node);
  const files=[env.npm_execpath,path.join(base,'node_modules/npm/bin/npm-cli.js'),path.resolve(base,'../lib/node_modules/npm/bin/npm-cli.js')];
  const file=files.find(p=>p&&path.isAbsolute(p)&&/npm-cli\.js$/i.test(p)&&existsSync(p));
  if(!file)throw Error('npm을 찾지 못했습니다. npm이 포함된 공식 Node.js를 설치한 뒤 다시 실행하세요.');
  return file;
}
export async function installTool(dataDir,provider){
  if(provider==='antigravity'){
    const exe=await installAntigravity(dataDir);const result=await capture(exe,['--version']);if(result.code!==0)throw Error('Antigravity 실행 확인 실패');return '공식 Antigravity CLI 설치·SHA512 검증 완료';
  }
  if(provider==='documents'){
    const python=pythonExecutable();
    try{const result=await capture(python,['--version'],{timeout:15000});if(result.code!==0)throw Error();}
    catch{throw Error('Python 3.10 이상을 먼저 설치한 뒤 문서 도구 설치를 다시 누르세요.');}
    const requirements=fileURLToPath(new URL('../requirements.txt',import.meta.url));
    const target=path.join(dataDir,'python-packages');
    const result=await capture(python,['-m','pip','install','--target',target,'--upgrade','--index-url','https://pypi.org/simple','-r',requirements],{timeout:600000});
    if(result.code!==0)throw Error('문서 패키지 설치에 실패했습니다. Python의 pip와 인터넷 연결을 확인하세요.');
    adoptDocumentTools(dataDir);
    const check=await capture(python,['-c','import pypdf,docx,reportlab,pptx,openpyxl; print("ok")']);
    if(check.code!==0)throw Error('문서 패키지를 실행하지 못했습니다. 다시 설치하세요.');
    return '문서 패키지 설치 완료';
  }
  if(!Object.hasOwn(packages,provider))throw Error('설치할 AI를 선택하세요.');
  const npm=npmEntrypoint(),prefix=path.join(dataDir,'cli',provider);
  await mkdir(prefix,{recursive:true});
  if(!existsSync(path.join(prefix,'package.json')))await writeFile(path.join(prefix,'package.json'),'{"private":true}');
  const config=path.join(prefix,'.npmrc');await writeFile(config,'');
  const result=await capture(nodeExecutable(),[npm,'install','--prefix',prefix,'--registry=https://registry.npmjs.org','--userconfig',config,'--cache',path.join(dataDir,'npm-cache'),'--no-audit','--no-fund','--save-exact',packages[provider]],{cwd:prefix,timeout:600000});
  if(result.code!==0)throw Error('공식 CLI 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 누르세요.');
  const executable=localToolPaths(dataDir,provider).find(existsSync);
  if(!executable)throw Error('설치된 CLI 실행 파일을 찾지 못했습니다. 다시 설치하세요.');
  const version=await capture(provider==='gemini'?nodeExecutable():executable,provider==='gemini'?[executable,'--version']:['--version'],{cwd:prefix});
  if(version.code!==0||! /\d+\.\d+/.test(version.out))throw Error('CLI를 실행하지 못했습니다. 운영체제와 보안 프로그램을 확인하세요.');
  process.env[keys[provider]]=executable;
  return '공식 CLI 설치 완료 · 로그인 버튼으로 계정을 연결하세요.';
}
export function adoptDocumentTools(dataDir,env=process.env){
  const target=path.join(dataDir,'python-packages');
  if(existsSync(target))env.PYTHONPATH=[target,...(env.PYTHONPATH||'').split(path.delimiter).filter(p=>p&&p!==target)].join(path.delimiter);
}
