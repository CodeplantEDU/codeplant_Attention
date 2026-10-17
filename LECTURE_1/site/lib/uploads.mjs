import {mkdir,readFile,writeFile,rename,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {pythonExecutable} from './python.mjs';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile),extensions=new Set(['.txt','.md','.csv','.json','.pdf','.docx','.pptx']);
const reject=message=>Object.assign(Error(message),{status:400});
export async function openUploads(dataDir){
  const dir=path.join(dataDir,'uploads'),index=path.join(dir,'index.json');await mkdir(dir,{recursive:true});
  let files=[];
  try{files=JSON.parse(await readFile(index,'utf8'));if(!Array.isArray(files))throw Error();}
  catch(e){if(e.code!=='ENOENT')throw Error('자료 목록을 읽지 못했습니다. data/uploads 원본을 확인하세요.');}
  const python=pythonExecutable();
  let busy=false;
  return {
    list:()=>files.map(({text,...meta})=>meta),
    select(ids=[]){
      if(!Array.isArray(ids)||ids.length>5||new Set(ids).size!==ids.length)throw reject('자료는 중복 없이 최대 5개까지 선택하세요.');
      const selected=ids.map(id=>{const file=files.find(x=>x.id===id);if(!file)throw reject('선택한 자료를 찾지 못했습니다.');return file;});
      if(selected.reduce((sum,f)=>sum+f.text.length,0)>60000)throw reject('선택한 자료의 추출 문자 합계는 60,000자까지입니다.');
      return selected;
    },
    async add(input){
      if(busy)throw Object.assign(Error('다른 자료를 읽고 있습니다. 잠시 후 다시 올려주세요.'),{status:409});
      if(!input||typeof input.name!=='string'||typeof input.base64!=='string')throw reject('자료 이름과 파일 내용이 필요합니다.');
      const name=path.win32.basename(input.name).replace(/[\x00-\x1f\x7f]/g,'').slice(0,160),ext=path.extname(name).toLowerCase();
      if(!extensions.has(ext))throw reject('지원 형식: TXT, MD, CSV, JSON, PDF, DOCX, PPTX');
      if(!input.base64||input.base64.length>13981016||input.base64.length%4||/[^A-Za-z0-9+/=]/.test(input.base64))throw reject('파일은 10MB 이하의 정상 파일이어야 합니다.');
      const bytes=Buffer.from(input.base64,'base64');if(bytes.toString('base64')!==input.base64)throw reject('파일 인코딩을 확인하세요.');
      if(bytes.length>10*1024*1024)throw reject('파일당 최대 크기는 10MB입니다.');
      const id=randomUUID(),source=path.join(dir,id+ext);busy=true;
      try{
        await writeFile(source,bytes,{flag:'wx'});
        let output;
        const options={windowsHide:true,timeout:30000,maxBuffer:2*1024*1024,encoding:'utf8'};
        try{output=(await exec(python,[fileURLToPath(new URL('./extract.py',import.meta.url)),source],options)).stdout;}
        catch(e){if(e.stdout)output=e.stdout;else throw reject('Python 3.10 이상 설치를 확인하세요. 문서 읽기 제한 시간은 30초입니다.');}
        const result=JSON.parse(output);if(result.error)throw reject(result.error);
        const file={id,name,size:bytes.length,chars:result.text.length,warning:result.warning,preview:result.text.slice(0,500),createdAt:new Date().toISOString(),text:result.text};
        const next=[...files,file];await writeFile(index+'.tmp',JSON.stringify(next,null,2),'utf8');await rename(index+'.tmp',index);files=next;
        const {text,...meta}=file;return meta;
      }catch(e){await rm(source,{force:true}).catch(()=>{});throw e;}
      finally{busy=false;}
    }
  };
}
