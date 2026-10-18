import {cp,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../skills/attention-codex',import.meta.url));
const dest=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'skills','attention-codex');
await mkdir(path.dirname(dest),{recursive:true});
let exists=false;try{await access(dest);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(exists)await cp(dest,dest+'.backup-'+Date.now(),{recursive:true});
await cp(source,dest,{recursive:true});
console.log('설치 완료: '+dest+'\n새 Codex 대화에서 $attention-codex 로 작업을 지시하세요.');
