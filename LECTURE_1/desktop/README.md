# ATTENTION 데스크톱 앱

[Windows 실행 파일](https://github.com/CodeplantEDU/codeplant_Attention/releases/download/desktop-v0.6.0/CODEPLANT-ATTENTION-Windows.exe) · [Mac 앱](https://github.com/CodeplantEDU/codeplant_Attention/releases/download/desktop-v0.6.0/CODEPLANT-ATTENTION-Mac.dmg)

[실제 패키지 검수 결과와 SHA256](검수결과.md)

Windows x64용 포터블 EXE와 Mac Apple Silicon·Intel용 Universal DMG를 배포합니다. Mac 앱은 macOS 13 이상을 기준으로 합니다. Windows는 Windows 10 22H2 이상을 기준으로 합니다.

## 사용하기

1. Windows는 EXE를 실행합니다. Mac은 DMG를 열어 앱을 Applications로 옮긴 뒤 실행합니다.
2. 사용할 AI를 선택하고 **선택한 AI 준비**를 누릅니다. Node·Python 별도 설치 없이, 앱이 필요한 공식 CLI를 앱 전용 폴더에 다운로드합니다. 처음에는 인터넷이 필요합니다.
3. **대화 화면 열기**에서 본인 계정으로 로그인합니다. 다른 AI가 없어도 하나만 연결하면 사용할 수 있습니다.
4. 메인·상대·모델·역할을 선택합니다. 자료 드래그앤드롭과 **Word로 만들어줘** 등의 대화형 파일 요청은 기존 사이트와 같습니다.
5. AI를 추가하려면 앱 메뉴의 **AI 추가·실행 도구 준비**를 엽니다. 진행 중인 작업이나 인증이 있으면 먼저 마칩니다.

앱 안에서 바로 대화할 수 있습니다. Vercel 화면을 쓰려면 로컬 화면의 **웹 연결 코드 발급** → 공개 사이트에서 **내 PC 연결** 순서로 연결합니다. 앱은 켜 두어야 합니다.

## 계정과 자료

공식 CLI가 본인 PC의 기존 로그인을 재사용할 수 있습니다. 앱은 인증 파일·API 키를 복사하거나 배포하지 않습니다. 로그인은 본인이 공식 인증 브라우저에서 완료합니다. 로그아웃은 같은 PC의 해당 CLI에도 영향을 줄 수 있습니다.

새 앱의 기록·자료·파일은 Windows `%APPDATA%/codeplant-attention-desktop`, Mac `~/Library/Application Support/codeplant-attention-desktop` 아래 `data/`에 저장합니다. 배포 파일 안의 경로에 기록하지 않으므로 앱 교체 후에도 보존합니다. 계정 권한과 사용량 한도는 해당 서비스에 적용됩니다.

기존 `49321` 연결 프로그램이 켜져 있으면 그 서비스를 재사용합니다. 기존 기록을 이동·삭제하거나 서버를 강제로 종료하지 않습니다. 이때 앱을 닫아도 기존 서비스는 종료하지 않습니다. 새 앱 전용 도구를 추가하려면 기존 연결 프로그램을 종료한 다음 앱을 다시 실행합니다.

## 실행 차단 안내

현재 배포본에는 별도 Windows·Apple 개발자 인증서가 없습니다. Windows SmartScreen에서 배포자를 확인하고 실행 승인이 필요할 수 있습니다. Mac에서 차단되면 시스템 설정 → 개인정보 보호 및 보안의 **확인 없이 열기**를 확인합니다. 보안 기능 전체를 끄는 명령은 필요하지 않습니다. 회사·학교의 관리 정책은 실행을 제한할 수 있습니다.

## 개발·재빌드

`.github/workflows/desktop-release.yml`은 Windows·Intel Mac·Apple Silicon Mac의 문서 엔진을 각각 빌드한 뒤 Windows EXE와 Universal Mac DMG를 만듭니다. 개인 컴퓨터의 인증·data·환경 파일은 전송하지 않습니다.

```text
Codex에 입력:
AGENTS.md와 LECTURE_1/desktop/README.md를 읽고 데스크톱 앱을 수정해줘.
기존 로그인과 data는 보존해. node --test LECTURE_1/desktop/tests/*.test.mjs와
site 테스트를 확인하고, desktop-release.yml로 두 운영체제 실행 파일을 빌드해줘.
사용자 인증과 실제 모델 호출을 모의 검증과 구분해서 기록해줘.
```

로컬 개발에는 Node와 Python이 필요하지만 배포 앱 사용자는 설치하지 않습니다. `desktop`에서 `npm ci`, `npm run prepare:node`, `python -m pip install -r ../site/requirements.txt pyinstaller==6.19.0`, `python scripts/build-filetools.py`, `npm start` 순서로 개발용 앱을 실행합니다. Mac Universal 배포에는 두 아키텍처의 `runtime/`이 필요하므로 GitHub Actions를 사용합니다.

실행 환경 근거: [Electron 환경 변수](https://www.electronjs.org/docs/latest/api/environment-variables), [GitHub의 운영체제별 러너](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Claude Code 설치](https://code.claude.com/docs/en/setup), [Codex CLI](https://developers.openai.com/codex/cli/), [Gemini CLI](https://geminicli.com/docs/get-started/installation/).
