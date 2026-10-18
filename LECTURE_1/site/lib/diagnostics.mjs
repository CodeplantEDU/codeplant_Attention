// Classify diagnostics in memory; never publish raw stderr, URLs or credentials.
export function diagnose(error,{provider=null,stage='',exitCode=null}={}){
  if(error?.diagnostic)return {...error.diagnostic,provider,stage};
  const text=String(error?.message||error||'');
  const rules=[
    ['cancelled',/중지|abort|cancelled/i,'작업이 중지됐습니다.','사용자가 원할 때만 다시 요청하세요.',false],
    ['timeout',/시간.*초과|timed?\s*out|timeout/i,'AI 응답 대기 시간이 초과됐습니다.','받은 내용을 확인하고 요청을 줄여 해당 AI만 다시 호출하세요.',true],
    ['auth',/401|unauth|not.?logged|login|로그인|authentication|invalid.*token|expired.*token/i,'AI 인증을 확인해야 합니다.','해당 CLI의 로그인 상태를 확인하고 필요하면 본인이 다시 로그인하세요.',false],
    ['quota',/429|quota|rate.?limit|usage.?limit|credit|billing|사용량|한도/i,'사용량 또는 요청 한도에 걸렸습니다.','계정의 사용량·재개 시각을 확인하세요. 자동 반복 호출하지 마세요.',false],
    ['model',/model.*(?:not|invalid|unknown|unavailable)|unknown.*model|모델.*(?:없|지원|형식)/i,'선택한 모델을 사용할 수 없습니다.','사용 가능한 모델 목록을 확인한 뒤 모델을 명시적으로 변경하세요.',false],
    ['network',/ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network|TLS|certificate|연결.*실패/i,'네트워크 연결에 실패했습니다.','인터넷·프록시·인증서 상태를 확인한 뒤 한 번 재시도하세요.',true],
    ['missing-cli',/ENOENT|실행 파일|찾지 못|프로그램 실행|spawn/i,'AI 실행 파일을 시작하지 못했습니다.','오른쪽 설치 상태와 tools/doctor.mjs 진단을 확인하세요.',false],
    ['arguments',/unknown option|unrecognized|unexpected argument|invalid.*argument/i,'CLI가 실행 옵션을 거부했습니다.','CLI 버전과 해당 버전의 공식 도움말을 확인해 호출 옵션을 수정하세요.',false],
    ['agents',/서브 에이전트|subagent/i,'요청한 서브 에이전트의 완료를 확인하지 못했습니다.','보존된 회신을 확인하고 실제 실행 기록을 점검하세요.',false]
  ];
  const [code,,message,action,retryable]=rules.find(r=>r[1].test(text))||['unknown',null,'AI가 완료된 답변을 반환하지 않았습니다.','연결·모델·CLI 버전을 진단하세요. 원인이 확인되기 전에는 반복 호출하지 마세요.',false];
  return {code,provider,stage,exitCode:Number.isInteger(exitCode)?exitCode:null,message,action,retryable};
}
export const diagnosticText=d=>`AI: ${d.provider||'작업실'} · 단계: ${d.stage||'확인 중'}\n오류 유형: ${d.code}${d.exitCode===null?'':` · 종료 코드: ${d.exitCode}`}\n${d.message}\n조치: ${d.action}`;
