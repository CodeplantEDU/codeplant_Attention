# CODEPLANT ATTENTION

**공개 사이트: [codeplant-attention.vercel.app](https://codeplant-attention.vercel.app/)**

**바로 실행하는 앱:** [Windows EXE](https://github.com/CodeplantEDU/codeplant_Attention/releases/download/desktop-v0.6.0/CODEPLANT-ATTENTION-Windows.exe) · [Mac DMG · Apple Silicon/Intel](https://github.com/CodeplantEDU/codeplant_Attention/releases/download/desktop-v0.6.0/CODEPLANT-ATTENTION-Mac.dmg)

앱을 열고 사용할 AI를 선택해 **선택한 AI 준비 → 대화 화면 열기 → 본인 계정 로그인** 순서로 시작합니다. Node·Python·CLI를 터미널에서 수동 설치할 필요가 없습니다. 처음에는 공식 AI 도구를 자동 다운로드하므로 인터넷이 필요합니다. [앱 사용법·실행 차단 안내](LECTURE_1/desktop/README.md)

각자 PC에서 실행 앱을 열거나 아래 수동 설치를 마친 뒤 로컬 화면의 **공개 웹사이트 연결 관리 → 웹 연결 코드 발급**을 사용합니다. 공개 사이트에 코드를 입력하면 본인의 Codex·Claude·Gemini 계정으로 사용할 수 있습니다. AI 로그인과 자료·대화·생성 파일은 각자의 PC에서 처리합니다. [PC 연결 사용법](LECTURE_1/site/README.md#vercel-공개-화면--본인-pc-연결)

Codex·Claude Code·Gemini를 선택해 대화하고, 자료를 올리고, 대화로 결과 파일을 만드는 Windows·Mac 로컬 프로그램입니다. **AI 하나만 연결해도 사용할 수 있습니다.** 다른 AI와 검토하려면 상대를 추가로 선택합니다.

<a id="codex-install"></a>

## 처음 설치하기 — Codex에 맡기는 방법

### 1. Codex 준비

이미 PC에서 Codex를 사용하고 있다면 다음 단계로 넘어갑니다. 처음이라면 [OpenAI 공식 시작 안내](https://learn.chatgpt.com/docs/quickstart)를 따라 Windows 데스크톱 앱을 설치하고 로그인한 뒤 Codex로 로컬 폴더 작업을 시작합니다.

이 안내는 **사용자 PC의 파일·터미널을 사용할 수 있는 로컬 Codex 작업**을 기준으로 합니다. Codex 화면의 로그인과 이 프로그램이 호출하는 **Codex CLI의 로그인 상태는 별도로 확인**합니다.

### 2. 프로그램 폴더 받기

1. [GitHub 저장소](https://github.com/CodeplantEDU/codeplant_Attention)에서 **Code → Download ZIP**을 누릅니다. Git 설치는 필요하지 않습니다.
2. ZIP의 **압축을 완전히 풉니다**. 예: 바탕화면의 `국민대학교_바탕` 폴더 안.
3. Codex에서 압축을 푼 **저장소의 최상위 폴더**를 로컬 작업 폴더로 선택합니다.

열어야 하는 폴더 안에는 아래 파일이 함께 있어야 합니다. ZIP으로 받으면 폴더 이름이 `codeplant_Attention-main`일 수 있으며 이름을 바꿀 필요는 없습니다.

```text
codeplant_Attention/       ← 이 폴더를 Codex에서 선택
  AGENTS.md
  README.md
  LECTURE_1/
    site/
      실행.cmd
      requirements.txt
```

### 3. 아래 문장을 Codex에 그대로 입력

처음에는 **Codex 하나만 연결**하도록 요청합니다. Claude·Gemini는 나중에 추가하면 됩니다.

```text
이 폴더의 AI 대화 스튜디오를 내 Windows PC에 설치하고 실행까지 해줘.

1. AGENTS.md, LECTURE_1/README.md, LECTURE_1/site/README.md를 읽어줘.
2. Node.js 22 이상, Python 3.10 이상, Codex CLI의 설치를 확인하고,
   없는 프로그램만 공식 배포 경로로 설치해줘. 이미 설치된 것은 재사용해.
   Claude와 Gemini는 지금 설치하거나 로그인할 필요 없어.
3. 서버가 실제로 사용할 Python을 확인하고 그 Python에
   LECTURE_1/site/requirements.txt의 패키지를 설치해줘.
4. Codex CLI의 기존 로그인을 확인해줘. 필요하면 공식 로그인 화면을 열고
   계정 선택·인증은 내가 직접 하도록 안내해줘. 비밀번호·인증 토큰은 읽거나 출력하지 마.
5. 기존 data 폴더의 대화·업로드·생성 파일은 보존해.
   LECTURE_1/site/실행.cmd로 실행하고 http://127.0.0.1:49321/을 열어줘.
6. 메인은 Codex, 상대는 없음으로 준비해. 실제 AI 대화는 아직 시작하지 마.
7. 설치 확인 결과, 연결 상태, 접속 주소와 내가 해야 할 로그인 단계만 알려줘.
   실행하지 못한 것은 성공이라고 쓰지 마.
```

Codex가 설치·실행을 진행하며, 로그인이나 설치 관리자의 사용자 확인이 필요한 단계는 직접 완료합니다. 설치 후 새 터미널이나 Codex 재실행이 필요하다고 안내되면, 다시 열고 **“설치된 상태를 다시 확인하고 이어서 실행해줘”**라고 입력합니다.

### 4. 화면에서 첫 대화

오른쪽에서 Codex 연결 상태를 확인하고, 왼쪽의 **대화 상대**를 **상대 없음 · 메인 AI만 사용**으로 둡니다. 필요하면 서브 에이전트를 추가하고, 자료를 드래그앤드롭한 뒤 지시를 작성해 **대화 시작**을 누릅니다. 실제 요청은 선택한 AI 서비스에 전달되며 계정 사용량을 소비합니다.

완료 후 **대화 이어가기**에 `이 내용을 Word로 만들어줘`라고 입력하면 실제 DOCX 다운로드 링크를 받습니다. 일반 이어가기는 메인만 호출하며, `왕복해`라고 지시할 때만 선택한 상대 AI를 호출합니다.

## 다음부터 실행할 때

설치한 저장소 폴더를 Codex에서 열고 아래 한 문장을 입력합니다.

```text
LECTURE_1/site/README.md를 읽고 AI 대화 스튜디오를 실행해서 브라우저를 열어줘.
기존 대화·업로드·생성 파일과 로그인을 재사용하고, AI 대화는 내가 시작하도록 준비만 해줘.
```

탐색기에서 [실행.cmd](LECTURE_1/site/실행.cmd)를 직접 더블클릭해도 됩니다. GitHub의 파일 링크는 실행 파일의 내용을 보여주므로, 다운로드·압축 해제한 **로컬 파일**을 실행합니다.

## Claude 또는 Gemini 추가하기

사용하고 싶은 AI에 해당하는 문장 하나를 Codex에 입력합니다. 세 AI를 전부 설치하거나 로그인할 필요는 없습니다.

**Claude 추가**

```text
이 프로그램에서 Claude Code도 선택할 수 있도록 내 PC의 설치와 기존 로그인을 확인해줘.
없으면 공식 설치 안내를 따라 설치하고, 로그인은 내가 직접 완료하도록 열어줘.
다른 계정이나 기존 data는 변경하지 말고, 사이트에서 새로 확인을 눌러 연결 상태까지만 확인해줘.
```

**Gemini 추가**

```text
이 프로그램에서 Gemini도 선택할 수 있도록 공식 @google/gemini-cli 설치를 확인하고 없으면 설치해줘.
기존 Google 로그인이 없으면 공식 Gemini CLI를 열어 내가 Sign in with Google을 선택하도록 안내해줘.
인증을 마친 뒤 사이트에서 새로 확인해줘. 토큰을 읽거나 복사하지 말고 실제 대화는 아직 시작하지 마.
```

각 AI의 모델은 화면에서 선택합니다. Gemini의 실제 응답은 Google 로그인 후 확인해야 하며, Gemini 내부 서브 에이전트 연결은 현재 지원하지 않습니다. Codex·Claude의 내부 서브 에이전트는 부모 모델을 사용합니다.

## 업데이트와 실행 문제도 Codex에 요청

Git으로 받은 폴더의 업데이트는 다음처럼 요청합니다. ZIP으로 받은 경우에는 Codex가 그 사실을 확인하고 새 버전 받는 방법을 안내하도록 합니다.

```text
이 프로그램을 최신 GitHub 버전으로 업데이트해줘.
먼저 Git으로 받은 폴더인지 ZIP으로 받은 폴더인지와 실행 중인 작업을 확인해.
내가 수정한 파일과 data의 대화·업로드·생성 파일은 보존하고, 진행 중인 작업은 중지하지 마.
Git 폴더라면 로컬 변경을 덮어쓰지 않는 방식으로 업데이트해줘.
ZIP 폴더라면 기존 폴더를 덮어쓰거나 삭제하지 말고 새 버전을 별도 폴더로 받는 방법을 안내해줘.
```

| 화면에서 겪는 문제 | Codex에 입력할 말 |
|---|---|
| 사이트가 안 열림 | `실행.cmd와 설치 경로·서버 로그를 확인해서 로컬 사이트를 열어줘. 기존 기록은 보존해.` |
| 연결 안 됨 | `선택한 메인 AI 하나의 CLI 설치와 로그인을 확인해줘. 다른 AI의 로그인은 요구하지 마.` |
| Python 패키지 오류 | `서버가 실제로 사용하는 Python에 requirements.txt의 패키지가 설치됐는지 확인해줘.` |
| 지원하지 않는 모델 | `현재 CLI에서 사용할 모델을 확인해줘. 내가 고른 모델을 다른 모델로 자동 대체하지 마.` |

## 강의자료와 자세한 사용법

- [LECTURE_1 전체 안내](LECTURE_1/README.md)
- [설치 명령·로그인·프로그램 사용법](LECTURE_1/site/README.md)
- [자료 업로드·왕복·보고서 제작을 Codex에 맡길 때 복사할 문장](LECTURE_1/docs/Codex에_이렇게_입력.md)
- [2시간 핵심 시연 운영안](LECTURE_1/docs/2시간_시연_운영안.md)
- [실제 확인한 기능과 남은 한계](LECTURE_1/docs/검증결과.md)

GitHub는 소스와 강의자료를 보관하며, 프로그램은 각자 PC의 `http://127.0.0.1:49321/`에서 실행됩니다. Windows의 Node.js 22 이상·Python 3.10 이상·사용할 AI CLI 하나가 필요합니다. API 키나 MCP 서버 추가 설치는 기본 실행에 필요하지 않습니다.

새 PC의 설치를 전부 자동으로 완료한다는 보장은 없습니다. 프로그램·서비스의 설치 권한, 계정 로그인과 CLI 버전별 지원 범위는 해당 PC에서 확인합니다.

공식 안내: [OpenAI 시작하기](https://learn.chatgpt.com/docs/quickstart), [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [Node.js](https://nodejs.org/en/download), [Python](https://www.python.org/downloads/windows/), [Claude Code](https://code.claude.com/docs/en/setup), [Gemini 인증](https://geminicli.com/docs/get-started/authentication/).

개인 로그인 정보·업로드·실행 기록·대학교 원본 수업자료는 저장소에 포함하지 않습니다. [Pretendard 라이선스](LECTURE_1/site/public/assets/Pretendard-LICENSE.txt)를 확인하세요. CODEPLANT 로고의 권리는 원권리자에게 있습니다.
