# CODEPLANT AI 대화 스튜디오 v0.3

이 PC에 로그인된 Codex CLI와 Claude Code를 실제로 호출하는 Windows 로컬 서비스다. 실행.cmd를 열면 백엔드가 숨겨진 창에서 실행되고 http://127.0.0.1:49321 화면이 열린다. Node.js 22 이상, Python 3.10 이상이 필요하며 새 npm 의존성은 없다. Python은 자료 추출에 사용하고, PDF 읽기는 pypdf를 사용한다.

메인 AI를 Codex 또는 Claude로 선택한다. 메인·상대의 역할을 각각 프리셋에서 선택하거나 직접 작성한다. 양쪽 각각 서브 에이전트를 0~3개 추가·삭제하고 역할 이름과 할 일을 편집할 수 있다. 첫 메인 초안과 첫 상대 검토에서 각자 설정한 네이티브 에이전트를 실제 호출하고, 상대 검토와 메인 답변을 1~3회 반복한다. 모델 이름은 비워두면 CLI 기본값을 쓴다. 직접 지정한 모델은 해당 계정에서 사용 가능해야 한다. 서브 에이전트는 각자 부모 모델을 상속한다.

로그인된 CLI 인증을 재사용하며 키나 토큰을 앱으로 복사하지 않는다. 로그인 필요 시 연결 패널의 로그인 버튼으로 공식 CLI 인증을 시작하고 본인이 브라우저에서 완료한다. 현재 로그인돼 있으면 재로그인을 요구하지 않는다. 로그인 확인과 실제 응답 성공은 구분한다.

지시문과 각 모델의 실제 회신을 두 서비스에 전달한다. 이 버전은 텍스트 대화·기획·검토용이다. 임의 PC 파일을 읽거나 수정하는 도구는 켜지 않는다. Codex는 읽기 전용·셸/앱/플러그인/메모리 비활성 상태로 실행한다. Claude는 제한 모드에서 서브 에이전트 도구만 허용한다. 기존 사용자 설정이나 다른 앱 데이터는 수정하지 않는다.

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

1. 메인 AI와 양쪽의 역할을 선택·수정하고, 각자의 내부 역할 0~3개와 왕복 수를 선택한다. 작업 지시를 쓴다.
2. 자료 영역에 파일을 드래그앤드롭하거나 파일 추가에서 TXT·MD·CSV·JSON·PDF·DOCX·PPTX를 올린다. 체크된 자료만 새 작업에 전달한다.
3. 추출 미리보기·경고를 확인한 뒤 **대화 시작**을 누른다.
4. 완료 후 **대화 이어가기**에서 질문한다. 기존 대화·자료·메인·역할·왕복 설정을 유지한다. 양쪽 서브 에이전트는 최초의 각자 응답에서만 생성하며, 후속 대화에서는 새로 만들지 않는다.
5. 후속 질문에 선택한 새 자료는 기존 자료에 추가된다. 기존 자료를 빼거나 메인을 바꾸려면 **새 작업**을 만든다.
6. **기록 내려받기**로 Markdown을 저장한다.

파일당 최대 10MB, 작업당 최대 5개, 추출문 합계 60,000자다. 텍스트는 UTF-8·CP949를 지원한다. PDF는 암호 없는 300페이지 이하 문서, PPTX는 최대 300슬라이드다. DOCX는 본문, PPTX는 슬라이드 글만 추출한다. 이미지·도표·문서 메모·첨부 개체와 표의 배치는 해석하지 않는다. 스캔 PDF는 OCR 후 올려야 한다. 빈 본문·초과 길이는 오류로 표시하며 조용히 잘라 보내지 않는다. PDF의 일부 페이지에 글이 없으면 경고한다.

업로드 자체는 로컬 저장이다. **대화 시작/후속 메시지 보내기**를 누를 때 선택한 추출문과 지시·회신이 두 서비스로 전달된다. 자료 안의 명령은 참고자료의 내용으로 구분한다. 모델의 출처 번호가 정확한지는 사람이 원문과 대조한다. 체크 해제는 로컬 파일 삭제도, 기존 작업의 자료 제거도 아니다.

업로드 원본·추출문은 data/uploads에, 작업은 data/runs.json에 남는다. Git에 올리지 않는다. 후속 대화의 기존 메시지와 새 지시가 60,000자를 넘으면 기록을 내보내 필요한 내용을 요약해 새 작업으로 이어간다. 이 버전은 PDF 보고서를 자동 제작하지 않는다.

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
```

자동 테스트는 모의 CLI로 순서와 경계를 확인한다. 실제 계정 호출 결과와는 구분한다. GitHub는 소스 배포용이며, GitHub Pages만으로 PC의 로그인된 CLI를 실행할 수 없다. 현재 버전은 PC 한 대의 로컬 용도다.
