const providers=['codex','claude','gemini'];
const hosts={codex:['auth.openai.com','auth0.openai.com'],claude:['claude.ai','claude.com','platform.claude.com','console.anthropic.com'],gemini:['accounts.google.com']};
function providerId(provider){if(!providers.includes(provider))throw Error('AI를 선택하세요.');return provider;}
export function loginUrl(state,provider){
  providerId(provider);
  if(!state.connections?.[provider]?.loginRunning)return null;
  try{const url=new URL(state.connections[provider].loginUrl);return url.protocol==='https:'&&!url.username&&!url.password&&hosts[provider].includes(url.hostname)?url.href:null;}catch{return null;}
}
export function canContinue(state){
  const connections=Object.values(state.connections||{});
  return connections.some(c=>c.loggedIn)&&!connections.some(c=>c.loginRunning||c.logoutRunning);
}
export function connectionSummary(state){
  return {ready:canContinue(state),activeRun:Boolean(state.activeRunId),connections:Object.fromEntries(providers.map(p=>{
    const c=state.connections?.[p]||{};
    return [p,{checking:c.message==='확인 중',installed:Boolean(c.installed),loggedIn:Boolean(c.loggedIn),loginRunning:Boolean(c.loginRunning),logoutRunning:Boolean(c.logoutRunning),message:typeof c.message==='string'?c.message:'확인 중',hasLoginUrl:Boolean(loginUrl(state,p))}];
  }))};
}
export async function authRequest(base,action,provider,request=fetch){
  const routes={login:'/api/login',logout:'/api/logout',cancel:'/api/login/cancel',check:'/api/connections/check'};
  if(!Object.hasOwn(routes,action))throw Error('허용되지 않은 로그인 작업입니다.');
  if(action!=='check')providerId(provider);
  const stateResponse=await request(base+'/api/state',{signal:AbortSignal.timeout(10000)});
  if(!stateResponse.ok)throw Error('연결 상태를 확인하지 못했습니다.');
  const state=await stateResponse.json();
  const response=await request(base+routes[action],{method:'POST',headers:{'content-type':'application/json','x-local-token':state.token},body:JSON.stringify(action==='check'?{}:{provider}),signal:AbortSignal.timeout(60000)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'계정 연결 작업에 실패했습니다.');
}
