import path from 'node:path';
import {mkdir,writeFile,readFile,rename,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {pythonExecutable} from './python.mjs';

const execute=promisify(execFile);
export const fileTypes=new Set(['docx','pdf','pptx','xlsx','md','txt','csv','json','html','css','js','ts','py','sql','yaml']);
export function requestedFormats(text,previous=[]){
  if(/(?:만들지|생성하지|저장하지|변환하지)\s*(?:마|말|않)/.test(text))return [];
  const patterns={docx:/(?:\bword\b|\bdocx\b|워드)/i,pdf:/\bpdf\b/i,pptx:/(?:\bpptx?\b|파워포인트)/i,xlsx:/(?:\bxlsx?\b|\bexcel\b|엑셀)/i,md:/(?:\bmd\b|마크다운)/i,txt:/(?:\btxt\b|텍스트\s*파일)/i,csv:/\bcsv\b/i,json:/\bjson\b/i,html:/\bhtml\b/i,css:/\bcss\b/i,js:/\b(?:js|javascript)\b/i,ts:/\btypescript\b|\.ts\b/i,py:/\bpython\b|파이썬|\.py\b/i,sql:/\bsql\b/i,yaml:/\bya?ml\b/i};
  const formats=Object.entries(patterns).filter(([,pattern])=>{const found=pattern.exec(text);return found&&!/^\s*(?:말고|제외|아닌)/.test(text.slice(found.index+found[0].length));}).map(([ext])=>ext);
  if(formats.length&&/(?:만들|생성|작성|제작|저장|변환|내려받|다운로드|줘|주세요|create|generate|export|save|파일|형식)/i.test(text))return formats;
  if(previous.length&&/(?:수정|고쳐|바꿔|보완|추가)/.test(text))return [...new Set(previous.slice(-1).map(f=>path.extname(f.name).slice(1)))];
  return [];
}
export function parseFilePackage(text,formats){
  let result;
  try{result=JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1'));}catch{throw Error('AI가 파일 작성 데이터를 올바르게 반환하지 못했습니다. 같은 요청으로 다시 시도하세요.');}
  if(!result||!Array.isArray(result.files)||!result.files.length||result.files.length>8||JSON.stringify(result).length>400000)throw Error('파일 작성 데이터의 개수나 크기를 확인하세요.');
  for(const file of result.files){
    if(typeof file.name!=='string'||file.name.length>140||/[\\/:\x00-\x1f]/.test(file.name)||file.name==='.'||file.name==='..')throw Error('파일 이름이 올바르지 않습니다.');
    const ext=path.extname(file.name).slice(1).toLowerCase();
    if(!fileTypes.has(ext)||!formats.includes(ext))throw Error('요청한 형식과 생성 파일의 형식이 다릅니다.');
    if(typeof file.content!=='string'||!file.content.trim()||file.content.length>100000)throw Error('파일 본문이 없거나 너무 큽니다.');
    if(file.title!==undefined&&(typeof file.title!=='string'||file.title.length>200))throw Error('문서 제목을 확인하세요.');
  }
  if(!formats.every(ext=>result.files.some(f=>path.extname(f.name).toLowerCase()==='.'+ext)))throw Error('요청한 파일 형식 중 빠진 항목이 있습니다.');
  return result;
}
export function fileInstructions(formats){
  return `사용자가 실제 다운로드 파일을 요청했다. 앱이 네 JSON을 받아 실제 파일을 작성한다. 직접 파일이나 셸을 사용하지 말고 JSON만 반환해. 만들지 않은 파일을 저장했다고 주장하지 마. 요청 형식: ${formats.join(', ')}. 반드시 모든 요청 형식을 포함해.\n스키마: {"message":"문서 내용과 구성에 대한 짧은 설명","files":[{"name":"결과.docx","title":"구체적인 문서 제목","content":"문서 전체 Markdown 본문"}]}\ncontent는 요약 예고가 아니라 완성된 실제 본문이어야 한다. DOCX/PDF는 Markdown 제목·문단·목록·표를 지원한다. PPTX는 # 제목으로 슬라이드를 나눈 Markdown을 쓴다. XLSX content는 JSON 문자열 {"sheets":[{"name":"시간표","rows":[["항목","시간"],["도입",10]]}]}이다. XLSX는 표 데이터만 사용하고 계산식은 쓰지 마. 기타 형식의 content는 해당 파일의 완성된 텍스트다. 파일은 최대8개, 각본문10만자. 자료의 사실·가정·제안을 구분하고, 출처·확인되지 않은 점을 보존해. JSON 바깥의 설명이나 코드펜스는 붙이지 마.`;
}
export async function createFiles({dataDir,runId,packet,signal}){
  const folder=path.join(dataDir,'generated',runId);await mkdir(folder,{recursive:true});
  const batch=randomUUID(),spec=path.join(folder,batch+'.json');
  const items=packet.files.map(file=>({...file,id:randomUUID(),ext:path.extname(file.name).slice(1).toLowerCase()}));
  await writeFile(spec,JSON.stringify({files:items}),'utf8');
  let stdout;
  try{stdout=(await execute(pythonExecutable(),[fileURLToPath(new URL('./render_files.py',import.meta.url)),spec,folder],{windowsHide:true,timeout:90000,maxBuffer:200000,signal,encoding:'utf8'})).stdout;}
  catch(e){if(signal?.aborted)throw Error('중지됐습니다.');if(e.stdout)stdout=e.stdout;else throw Error('파일 생성에 실패했습니다. Python과 requirements.txt 설치를 확인하세요.');}
  const result=JSON.parse(stdout);if(result.error)throw Error(result.error);
  if(signal?.aborted)throw Error('중지됐습니다.');
  const output=[];
  for(const item of items){
    const destination=path.join(folder,item.id+'.'+item.ext);
    await rename(destination+'.part',destination);
    const info=await stat(destination);if(!info.size)throw Error('빈 파일이 생성돼 완료 처리하지 않았습니다.');
    output.push({id:item.id,name:item.name,ext:item.ext,size:info.size,createdAt:new Date().toISOString(),url:`/api/runs/${runId}/files/${item.id}`});
  }
  return output;
}
export async function readGenerated(dataDir,runId,file){
  if(!fileTypes.has(file.ext)||! /^[a-f0-9-]{36}$/.test(file.id))throw Error('잘못된 파일 정보');
  return readFile(path.join(dataDir,'generated',runId,file.id+'.'+file.ext));
}
