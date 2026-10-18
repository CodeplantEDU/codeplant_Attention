const status=document.querySelector('#status'),install=document.querySelector('#install'),open=document.querySelector('#open');
function message(text){status.textContent=text;}
window.attention.onProgress(message);
window.attention.status().then(s=>{open.disabled=!s.installed.length&&!s.usingExisting;if(s.usingExisting)message('기존 실행 프로그램이 켜져 있습니다. 대화 화면을 열면 기존 기록을 그대로 사용합니다. AI 추가는 기존 프로그램을 종료한 뒤 이 앱을 다시 실행하세요.');else if(s.installed.length)message('준비된 AI: '+s.installed.join(', ')+'. AI를 추가하려면 대화를 마치고 앱을 다시 실행하세요.');});
document.querySelector('#setup').addEventListener('submit',async event=>{
  event.preventDefault();const providers=[...document.querySelectorAll('input:checked')].map(x=>x.value);
  if(!providers.length){message('AI를 하나 이상 선택하세요.');return;}
  install.disabled=open.disabled=true;
  try{const result=await window.attention.install(providers);message('준비 완료: '+result.installed.join(', ')+'. 대화 화면에서 로그인하세요.');open.disabled=false;}catch(e){message(e.message);}finally{install.disabled=false;}
});
open.addEventListener('click',async()=>{open.disabled=true;try{await window.attention.open();}catch(e){message(e.message);open.disabled=false;}});
