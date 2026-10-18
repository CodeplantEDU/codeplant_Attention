import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const base=`http://127.0.0.1:${process.env.DIALOGUE_PORT||49322}`;
export async function control(args,{baseURL=base,emit=()=>{}}={}){
  const [command,a,b]=args;
  const stateResponse=await fetch(baseURL+'/api/state').catch(()=>{throw Error('개인 서버에 연결할 수 없습니다. 이 폴더에서 npm start로 서버를 켜고 DIALOGUE_PORT를 확인하세요.');});if(!stateResponse.ok)throw Error('로컬 서비스를 먼저 실행하세요.');
  const state=await stateResponse.json();
  async function post(endpoint,data){
    const response=await fetch(baseURL+endpoint,{method:'POST',headers:{'content-type':'application/json','x-local-token':state.token},body:JSON.stringify(data)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'요청 실패');return result;
  }
  if(command==='status')return {connections:Object.fromEntries(Object.entries(state.connections).map(([provider,{installed,loggedIn,version,message}])=>[provider,{installed,loggedIn,version,message}])),activeRunId:state.activeRunId,uploads:state.uploads,runs:state.runs.map(({id,title,status,stage})=>({id,title,status,stage}))};
  if(command==='upload'&&a)return post('/api/uploads',{name:path.basename(a),base64:(await readFile(a)).toString('base64')});
  if(command==='run'&&a)return post('/api/runs',JSON.parse(await readFile(a,'utf8')));
  if(command==='task'&&a)return post('/api/tasks',JSON.parse(await readFile(a,'utf8')));
  if(['publish','consult','files','finish'].includes(command)&&a&&b)return post(`/api/tasks/${encodeURIComponent(a)}/${{publish:'events',consult:'consult',files:'files',finish:'finish'}[command]}`,command==='finish'?{text:await readFile(b,'utf8')}:JSON.parse(await readFile(b,'utf8')));
  if(['inspect','diagnose','watch'].includes(command)&&a){
    async function inspect(){const response=await fetch(baseURL+`/api/tasks/${encodeURIComponent(a)}`);const data=await response.json();if(!response.ok)throw Error(data.error);return data;}
    if(command==='inspect')return inspect();
    if(command==='diagnose'){const {run}=await inspect();return {id:run.id,status:run.status,stage:run.stage,diagnostic:run.diagnostic||null,requests:(run.requests||[]).map(({prompt,roles,text,...r})=>r)};}
    const seconds=Number(b||20);if(!Number.isInteger(seconds)||seconds<1||seconds>60)throw Error('watch 시간은 1~60초입니다.');
    const seen=new Map(),until=Date.now()+seconds*1000;let run;
    do{({run}=await inspect());for(const row of run.messages){if(seen.get(row.id)!==row.text){emit(row);seen.set(row.id,row.text);}}if(run.status!=='running')break;await new Promise(r=>setTimeout(r,750));}while(Date.now()<until);
    return {id:run.id,status:run.status,stage:run.stage,error:run.error||'',requests:run.requests||[]};
  }
  if(command==='followup'&&a&&b)return post(`/api/runs/${encodeURIComponent(a)}/messages`,{message:await readFile(b,'utf8')});
  if(command==='stop'&&a)return post(`/api/runs/${encodeURIComponent(a)}/stop`,{});
  if(command==='export'&&a&&b){
    const response=await fetch(baseURL+`/api/runs/${encodeURIComponent(a)}/export`);if(!response.ok)throw Error('기록을 찾지 못했습니다.');
    await writeFile(b,await response.text(),'utf8');return {saved:path.resolve(b)};
  }
  throw Error('사용법: node tools/control.mjs status | upload 파일 | task 설정.json | publish 작업ID 기록.json | consult 작업ID 요청.json | watch 작업ID [초] | inspect 작업ID | diagnose 작업ID | files 작업ID 파일.json | finish 작업ID 최종.md | run 요청.json | followup 작업ID 지시.md | stop 작업ID | export 작업ID 결과.md');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await control(process.argv.slice(2),{emit:row=>console.log(JSON.stringify(row))}),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
