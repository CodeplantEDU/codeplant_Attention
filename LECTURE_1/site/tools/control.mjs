import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const base=`http://127.0.0.1:${process.env.DIALOGUE_PORT||49322}`;
export async function control(args){
  const [command,a,b]=args;
  const stateResponse=await fetch(base+'/api/state');if(!stateResponse.ok)throw Error('로컬 서비스를 먼저 실행하세요.');
  const state=await stateResponse.json();
  async function post(endpoint,data){
    const response=await fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json','x-local-token':state.token},body:JSON.stringify(data)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'요청 실패');return result;
  }
  if(command==='status')return {connections:Object.fromEntries(Object.entries(state.connections).map(([provider,{installed,loggedIn,version,message}])=>[provider,{installed,loggedIn,version,message}])),activeRunId:state.activeRunId,uploads:state.uploads,runs:state.runs.map(({id,title,status,stage})=>({id,title,status,stage}))};
  if(command==='upload'&&a)return post('/api/uploads',{name:path.basename(a),base64:(await readFile(a)).toString('base64')});
  if(command==='run'&&a)return post('/api/runs',JSON.parse(await readFile(a,'utf8')));
  if(command==='followup'&&a&&b)return post(`/api/runs/${encodeURIComponent(a)}/messages`,{message:await readFile(b,'utf8')});
  if(command==='stop'&&a)return post(`/api/runs/${encodeURIComponent(a)}/stop`,{});
  if(command==='export'&&a&&b){
    const response=await fetch(base+`/api/runs/${encodeURIComponent(a)}/export`);if(!response.ok)throw Error('기록을 찾지 못했습니다.');
    await writeFile(b,await response.text(),'utf8');return {saved:path.resolve(b)};
  }
  throw Error('사용법: node tools/control.mjs status | upload 파일 | run 요청.json | followup 작업ID 추가지시.md | stop 작업ID | export 작업ID 결과.md');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await control(process.argv.slice(2)),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
