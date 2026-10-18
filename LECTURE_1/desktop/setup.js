const status=document.querySelector('#status'),open=document.querySelector('#open'),check=document.querySelector('#check');
const names={codex:'Codex · OpenAI',claude:'Claude Code · Anthropic',gemini:'Gemini · Google'};
let snapshot,busy=false,polling=false;
function message(text){status.textContent=text;}
const cards={};
for(const [provider,name] of Object.entries(names)){
  const card=document.createElement('article');card.dataset.provider=provider;
  const header=document.createElement('header'),title=document.createElement('h2'),badge=document.createElement('span'),detail=document.createElement('p');
  title.textContent=name;badge.className='badge';badge.textContent='확인 중';detail.className='detail';detail.textContent='실행 도구와 계정을 확인합니다.';
  header.append(title,badge);card.append(header,detail);
  const buttons={};
  for(const [action,label] of Object.entries({login:'로그인',logout:'로그아웃',cancel:'로그인 취소',browser:'로그인 화면 열기'})){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.action=action;button.disabled=true;
    if(action!=='login')button.className='secondary';
    if(action!=='login')button.hidden=true;
    button.addEventListener('click',()=>perform(async()=>{
      if(action==='browser'){await window.attention.loginBrowser(provider);return;}
      if(action==='login'&&!snapshot.connections[provider].installed){
        await window.attention.install([provider]);
        await window.attention.auth('check');
      }
      await window.attention.auth(action,provider);
    },action==='login'?'브라우저에서 로그인을 완료하세요. 창이 안 열리면 로그인 화면 열기를 눌러 주세요.':action==='logout'?'로그아웃했습니다.':action==='cancel'?'로그인을 취소했습니다.':'로그인 화면을 열었습니다.'));
    buttons[action]=button;card.append(button);
  }
  cards[provider]={badge,detail,buttons};document.querySelector('#providers').append(card);
}
function render(){
  if(!snapshot)return;
  const authBusy=Object.values(snapshot.connections).some(c=>c.loginRunning||c.logoutRunning);
  open.disabled=busy||!snapshot.ready;check.disabled=busy;
  document.querySelector('#existing').hidden=!snapshot.usingExisting;
  for(const [p,card] of Object.entries(cards)){
    const c=snapshot.connections[p],b=card.buttons;
    card.badge.textContent=c.checking?'확인 중':c.logoutRunning?'로그아웃 중':c.loginRunning?'로그인 중':c.loggedIn?'연결됨':c.installed?'로그인 필요':'준비 필요';
    card.badge.className='badge'+(c.loggedIn?' connected':'');card.detail.textContent=c.message;
    b.login.hidden=c.loggedIn||c.loginRunning;b.login.textContent=c.installed?'로그인':'준비 후 로그인';
    b.login.disabled=c.checking||busy||authBusy||snapshot.activeRun||(!c.installed&&snapshot.usingExisting);
    b.logout.hidden=!c.loggedIn||c.loginRunning;b.logout.disabled=busy||authBusy||snapshot.activeRun;
    b.cancel.hidden=!c.loginRunning;b.cancel.disabled=busy;
    b.browser.hidden=!c.hasLoginUrl;b.browser.disabled=busy;
  }
}
async function refresh(){snapshot=await window.attention.status();render();}
async function perform(task,success){
  if(busy)return;busy=true;render();
  try{await task();message(success);}catch(e){message(e.message);}
  finally{busy=false;try{await refresh();}catch(e){message(e.message);check.disabled=false;}render();}
}
window.attention.onProgress(message);
check.addEventListener('click',()=>perform(()=>window.attention.auth('check'),'연결 상태를 다시 확인했습니다.'));
open.addEventListener('click',()=>perform(()=>window.attention.open(),'대화 화면을 열었습니다.'));
refresh().then(()=>message(snapshot.ready?'로그인된 계정이 있습니다. 대화 시작을 누르세요.':'사용할 AI의 로그인 버튼을 누르세요.')).catch(e=>{message(e.message);check.disabled=false;});
setInterval(async()=>{if(busy||polling)return;polling=true;try{await refresh();}catch(e){message(e.message);check.disabled=false;}finally{polling=false;}},1500);
