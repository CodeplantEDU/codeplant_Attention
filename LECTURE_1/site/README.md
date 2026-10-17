# CODEPLANT AI 대화 스튜디오 v0.5

이 PC에 로그인된 Codex CLI·Claude Code·Gemini CLI를 실제로 호출하는 Windows 로컬 서비스다. 실행.cmd를 열면 백엔드가 숨겨진 창에서 실행되고 http://127.0.0.1:49321 화면이 열린다. Node.js 22 이상, Python 3.10 이상이 필요하며 새 npm 의존성은 없다. Python은 자료 추출에 사용하고, PDF 읽기는 pypdf를 사용한다.

메인 AI를 Codex·Claude·Gemini 중 선택한다. 기본은 **상대 없음 · 메인 AI만 사용**이다. 하나만 설치·로그인해도 대화·자료 업로드·파일 생성을 사용할 수 있다. 왕복하려면 다른 상대 AI를 골라 연결한다. 메인·상대의 역할을 각각 프리셋에서 선택하거나 직접 작성한다. Codex·Claude는 각자 서브 에이전트를 0~3개 추가·삭제하고 역할 이름과 할 일을 편집할 수 있다. 첫 메인 초안과 첫 상대 검토에서 각자 설정한 네이티브 에이전트를 실제 호출한다. 왕복은 1·2·3회, 숫자 직접 입력, 횟수 제한 없이 중에서 고른다. 각 AI의 모델을 드롭다운에서 선택한다. Codex는 현재 CLI의 모델 목록을 조회하고, Claude는 공식 별칭 Opus·Sonnet·Haiku를 제공한다. CLI 기본값 또는 정확한 모델 이름 직접 입력도 가능하다. 현재 채팅의 모델과 CLI 모델 목록은 다를 수 있으며, 모델은 해당 계정에서 사용 가능해야 한다. 서브 에이전트는 각자 부모 모델을 상속한다.

로그인된 CLI 인증을 재사용하며 키나 토큰을 앱으로 복사하지 않는다. 로그인 필요 시 연결 패널의 로그인 버튼으로 공식 CLI 인증을 시작하고 본인이 브라우저에서 완료한다. 현재 로그인돼 있으면 재로그인을 요구하지 않는다. 로그인 확인과 실제 응답 성공은 구분한다.

왕복 대화의 지시문과 각 모델의 회신을 두 서비스에 전달한다. 일반 후속 요청은 메인 서비스에만 전달한다. 모델은 텍스트·구조화 데이터를 작성하고 앱이 실제 결과 파일을 만든다. 임의 PC 파일을 읽거나 수정하는 도구는 켜지 않는다. Codex는 읽기 전용·셸/앱/플러그인/메모리 비활성 상태로 실행한다. Claude는 제한 모드에서 서브 에이전트 도구만 허용한다. 기존 사용자 설정이나 다른 앱 데이터는 수정하지 않는다.

서브 에이전트는 실제 생성·회신 이벤트를 확인해 표시한다. 현재 Codex CLI는 stdout에서 호스팅 에이전트 활동을 누락하므로, 해당 실행에서 반환한 정확한 thread ID의 로컬 기록 중 에이전트 활동과 완료 회신만 읽어 보완한다. 다른 대화·인증 파일을 읽지 않는다. 네이티브 생성 기록이 부족하면 완료로 꾸미지 않고 오류로 남긴다.

작업은 data/runs.json에 저장한다. Codex의 네이티브 실행 기록은 공식 CLI의 기존 기록 저장 정책에 따라 사용자 .codex에도 남을 수 있다. 중지는 현재 CLI 프로세스 트리를 종료하고 다음 호출을 막는다. 이미 처리 중인 원격 요청의 사용량은 취소를 보장하지 않는다. 같은 로컬 서비스에서는 한 작업만 동시에 실행한다. 종료 후 다시 실행할 수 있으며 미완료 작업은 재시작 시 중단 상태로 표시한다.

기록 내려받기로 Markdown을 저장할 수 있다. 별도 유료 API 키·MCP 서버 설치는 이 기본 연결에 필요하지 않다. 구독·사용량·서비스 정책은 각 계정에 적용된다.

공식 구현 근거:
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/subagents
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/headless

검증: `node --test tests/*.test.mjs`. 실제 연결·UI 검사 결과는 검수결과.md에 기록한다.

## 처음 한 번 설치·로그인

Node는 [공식 다운로드](https://nodejs.org/en/download), Python은 [공식 다운로드](https://www.python.org/downloads/windows/), Codex는 [공식 CLI 안내](https://developers.openai.com/codex/cli/), Claude는 [공식 설치 안내](https://code.claude.com/docs/en/setup)를 사용한다. Codex의 공식 npm 패키지는 `@openai/codex`다. Claude는 공식 설치 프로그램 또는 `winget install Anthropic.ClaudeCode`를 사용할 수 있다. 설치 후 터미널을 다시 연다.

이 site 폴더에서:

```powershell
node --version
python --version
codex --version
claude --version
python -m pip install -r requirements.txt
```

로그인이 필요한 경우 본인이 완료한 뒤 사이트의 **새로 확인**을 누른다.

```powershell
codex login
claude auth login
```

## 자료 업로드와 후속 대화

1. 연결된 메인 AI를 선택한다. 단독 사용은 상대 없음을 유지한다. 왕복하려면 다른 상대와 역할·횟수를 고른다. Codex·Claude는 내부 역할 0~3개를 선택할 수 있고 Gemini 내부 역할은 현재 지원하지 않는다. 작업 지시를 쓴다.
2. 자료 영역에 파일을 드래그앤드롭하거나 파일 추가에서 TXT·MD·CSV·JSON·PDF·DOCX·PPTX를 올린다. 체크된 자료만 새 작업에 전달한다.
3. 추출 미리보기·경고를 확인한 뒤 **대화 시작**을 누른다.
4. 완료 후 **대화 이어가기**에서 질문한다. 기본은 메인 AI만 답한다. “왕복해”, “3회 왕복해”라고 명시할 때만 상대 AI를 호출한다. 횟수를 말하지 않으면 작업의 기존 왕복 설정을 사용한다. 기존 대화·자료·역할을 유지하고, 후속에서는 새 서브 에이전트를 만들지 않는다.
5. 후속 질문에 선택한 새 자료는 기존 자료에 추가된다. 기존 자료를 빼거나 메인을 바꾸려면 **새 작업**을 만든다.
6. **기록 내려받기**로 Markdown을 저장한다.

파일당 최대 10MB, 작업당 최대 5개, 추출문 합계 60,000자다. 텍스트는 UTF-8·CP949를 지원한다. PDF는 암호 없는 300페이지 이하 문서, PPTX는 최대 300슬라이드다. DOCX는 본문, PPTX는 슬라이드 글만 추출한다. 이미지·도표·문서 메모·첨부 개체와 표의 배치는 해석하지 않는다. 스캔 PDF는 OCR 후 올려야 한다. 빈 본문·초과 길이는 오류로 표시하며 조용히 잘라 보내지 않는다. PDF의 일부 페이지에 글이 없으면 경고한다.

업로드 자체는 로컬 저장이다. **대화 시작**은 선택한 메인(상대 선택 시 두 서비스)에 전달하고, 일반 **후속 메시지**는 메인 서비스에만 전달한다. 후속에서 왕복을 요청하면 두 서비스에 전달한다. 자료 안의 명령은 참고자료의 내용으로 구분한다. 모델의 출처 번호가 정확한지는 사람이 원문과 대조한다. 체크 해제는 로컬 파일 삭제도, 기존 작업의 자료 제거도 아니다.

업로드 원본·추출문은 data/uploads에, 작업은 data/runs.json에 남는다. Git에 올리지 않는다. 대화가 길어지면 메인 AI가 앞부분을 요약하는 명시적 단계를 거쳐 맥락을 이어간다. 원래 메시지는 기록에서 삭제하지 않는다.

## 왕복 횟수와 창 크기

**횟수 직접 입력**은 1 이상의 정수를 받으며 3회 상한이 없다. **횟수 제한 없이**에서는 종료 조건을 작성할 수 있다. 메인 AI가 조건 충족을 판단하면 끝내며, 이는 사실 검증이나 사람의 승인을 대신하지 않는다. 조건을 비우면 사람이 **중지**할 때까지 계속한다. 실행 시간이 길어질수록 계정 사용량도 늘어난다. 무제한은 서비스 한도·연결·각 호출의 대기 시간 제한을 없애는 뜻은 아니다.

화면이 넓을 때 좌측 설정·가운데 대화·우측 활동 사이 경계선을 드래그하거나, 경계선에 키보드 초점을 두고 좌우 방향키로 너비를 조절한다. 폭은 브라우저에 저장하며 **창 크기 초기화**로 되돌린다. 좁은 화면에서는 기본 배치로 바뀐다. 입력창 높이도 기존 하단 조절점으로 바꿀 수 있다.

## 대화로 파일 만들기

별도 파일 생성 버튼은 없다. **대화 이어가기**에 아래처럼 쓴다.

```text
이 내용을 Word로 만들어줘.
같은 내용을 PDF로 만들어줘.
시간표를 Excel 파일로 만들어줘.
이 수업안을 PPT로 만들어줘.
이 문서의 2번 항목을 보완해서 Word로 다시 만들어줘.
```

파일 요청은 메인 AI만 처리한다. 앱이 실제 파일 작성을 마친 뒤 대화 아래 **생성된 파일**에 다운로드 링크가 표시된다. 수정 요청은 새 파일로 저장해 이전 파일을 보존한다. “3회 왕복해 검토한 후 Word로 만들어줘”처럼 말하면 요청한 왕복을 마친 뒤 파일을 만든다.

지원 출력은 DOCX, PDF, PPTX, XLSX, MD, TXT, CSV, JSON, HTML, CSS, JS, TS, PY, SQL, YAML이다. DOCX/PDF는 제목·문단·목록·기본 표, PPTX는 텍스트 슬라이드, XLSX는 표 데이터를 작성한다. 복잡한 편집 양식·차트·실행 수식·수학 수식·이미지 생성·HWP 원본 제작은 지원하지 않는다. 코드 파일은 텍스트로 저장하며 실행하지 않는다. 문서 파일은 최대 8개, 각 본문 100,000자, 한 번의 작성 데이터는 400,000자까지다.

생성물과 작성 원문은 data/generated에 저장한다. 파일 생성 실패를 성공으로 표시하지 않으며, 오류가 나면 같은 요청으로 다시 시도할 수 있다. 내용의 타당성과 원문 대조는 사람이 확인한다. Word·PDF의 시각 검증 범위는 검수결과를 참고한다.

## Codex에서 같은 서비스 제어

Codex 채팅과 사이트 대화가 자동 복제되지는 않는다. Codex가 아래 제어 도구에 지시·자료를 넘기면 같은 사이트에 작업이 나타난다. 실행.cmd로 서버를 먼저 켠다. 이 site 폴더 기준 명령이다.

```powershell
node tools/control.mjs status
node tools/control.mjs upload ../examples/공개_실습자료.md
node tools/control.mjs run data/나의요청.json
node tools/control.mjs followup 실제작업ID ../examples/후속질문.md
node tools/control.mjs export 실제작업ID data/대화기록.md
node tools/control.mjs stop 실제작업ID
```

`../examples/요청.json`을 개인 요청 파일로 복사한다. upload의 반환 id를 attachmentIds 배열에 넣고 run으로 실행한다. mainRole/peerRole로 양쪽 AI 역할을 작성하고, agentRoles/peerAgentRoles로 각자의 하위 역할을 설정한다. 실제작업ID는 run/status 결과를 사용한다. 개인 요청·내보낸 기록은 Git에서 제외되는 data 폴더에 둔다. CLI 제어 도구는 인증 토큰을 출력하지 않는다. README의 examples 경로는 저장소의 LECTURE_1/site를 기준으로 한다. 단독 복사본에서는 파일의 실제 경로를 사용한다.

Codex에 복사할 시작문:

```text
AGENTS.md와 LECTURE_1/README.md, LECTURE_1/site/README.md를 읽어줘.
필요 프로그램·기존 로그인 상태를 확인하고 대화 스튜디오를 실행해 브라우저를 열어줘.
기존 대화와 자료는 보존하고, 비밀번호·토큰을 읽거나 출력하지 마.
아직 AI 대화는 시작하지 말고 업로드할 수 있는 화면까지만 준비해줘.
```

더 많은 복사용 문장은 `../docs/Codex에_이렇게_입력.md`를 참고한다.

## 오류·업데이트

- CLI 설치가 안 보임: 설치·PATH를 확인하고 터미널을 다시 연다. 특이한 설치 위치는 DIALOGUE_CODEX_EXE / DIALOGUE_CLAUDE_EXE에 실제 .exe 절대 경로를 지정한다. 셸 스크립트는 받지 않는다.
- Python 없음: `python --version`을 확인한다. DIALOGUE_PYTHON에 Python 실행 파일 절대 경로를 지정할 수도 있다. PDF 의존성은 실제 사용하는 Python에서 requirements.txt로 설치한다.
- 모델 오류: 모델 이름을 비워 기본값으로 실행하고, CLI 버전·계정 사용량을 확인한다.
- 포트 충돌: 49321에서 기존 대화 스튜디오가 실행 중이면 재사용한다. 다른 서비스이면 먼저 충돌을 해결한다.
- 파일을 갱신한 경우: 실행 중인 작업이 없는지 확인한 뒤 이 앱의 `node ...server.mjs` 프로세스만 종료하고 다시 실행한다. 다른 Node 프로세스를 일괄 종료하지 않는다. data 폴더를 보존한다.

검증 명령:

```powershell
node --test tests/*.test.mjs
python tests/test_extract.py
python tests/test_render_files.py
```

자동 테스트는 모의 CLI로 순서와 경계를 확인한다. 실제 계정 호출 결과와는 구분한다. GitHub는 소스 배포용이며, GitHub Pages만으로 PC의 로그인된 CLI를 실행할 수 없다. 현재 버전은 PC 한 대의 로컬 용도다.

## 모델 선택

왼쪽 **AI 모델 선택**에서 Codex와 Claude Code를 각각 선택한다. 선택한 모델 ID를 그대로 해당 CLI에 전달하며, 내부 에이전트는 부모 모델을 상속한다. 작업 시작 시 모델이 고정되고, 이어가기에는 그 작업의 모델을 사용한다. 다른 모델을 사용하려면 설정 후 새 작업을 시작한다.

Codex는 `app-server`의 `model/list`를 조회한다. **새로 확인**으로 다시 가져올 수 있다. 목록 조회 실패 시 로그인 상태와 모델 목록 오류를 구분하여 안내한다. `gpt-6-sol`이 현재 CLI 목록에 없으면 비활성 항목으로 표시한다. **직접 입력**으로 시도할 수 있지만 호출 성공을 보장하지 않으며, 다른 모델로 몰래 대체하지 않는다. Claude의 별칭은 계정·요금제에 따라 실제 사용 가능 여부가 달라진다. [Claude 공식 모델 설정](https://code.claude.com/docs/en/model-config) 참고.

## Gemini 연결과 단독 사용

사용할 CLI 하나만 설치하면 된다. Gemini가 필요하면 PowerShell에서 다음을 실행한다.

```powershell
npm install -g @google/gemini-cli
gemini
```

**Sign in with Google**을 선택하고 본인 계정의 인증을 완료한다. 사이트의 Gemini **로그인** 버튼도 이 공식 CLI를 별도 터미널로 연다. 인증을 마치면 터미널을 닫거나 사이트에서 **새로 확인**을 누른다. 약관·동의나 계정 선택은 본인이 완료한다. 앱은 인증 토큰의 내용을 읽거나 복사하지 않는다. 저장된 로그인 파일의 존재만 확인하므로, 만료·계정 권한·모델 지원 여부는 실제 요청에서 확인한다. [공식 인증 안내](https://geminicli.com/docs/get-started/authentication/).

Gemini의 모델 목록은 공식 CLI 모델 이름을 제공하며 계정에서 전부 사용 가능하다는 보장은 없다. CLI 기본값과 직접 입력도 제공한다. Gemini의 내부 에이전트는 이 앱에서 아직 연결하지 않았고, 해당 선택 UI와 API 요청을 제한한다. Codex·Claude의 내부 에이전트는 기존과 같다.

기본 단독 모드는 선택한 메인에게만 자료·지시를 보낸다. 상대를 선택한 새 작업은 그 상대와 왕복한다. 일반 이어가기는 계속 메인만 호출한다. 단독 작업에서 “왕복해”를 요청하려면 왼쪽에서 상대를 선택한다. 메인과 같은 AI를 상대로 선택할 수 없으며, 선택하지 않은 세 번째 AI의 로그인은 요구하지 않는다. 기존 두 AI 작업은 저장된 메인과 예전 상대 조합을 유지한다.

Gemini는 `node`로 공식 CLI 진입점을 직접 실행해 셸 문자열 조합을 피한다. 앱 전용 설정으로 도구·MCP·확장·훅·스킬·내부 에이전트와 주변 컨텍스트 탐색을 제한한다. 이 설정은 해당 자식 프로세스에만 적용하며 사용자 전역 설정을 수정하지 않는다. 모델의 JSON/텍스트를 호스트가 실제 문서로 변환한다. [공식 headless 출력](https://geminicli.com/docs/cli/headless/), [공식 설정](https://geminicli.com/docs/reference/configuration/).

API 요청은 `peer: null` 또는 상대 생략이 단독 모드다. 예: `{"main":"gemini","peer":null,"prompt":"공개 수업안 작성","agentRoles":[],"models":{"gemini":"gemini-2.5-flash"}}`. 명시적 왕복은 `peer:"codex"`처럼 지정한다.
