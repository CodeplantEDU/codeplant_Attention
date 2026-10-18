# ATTENTION · 개인 AI 작업실

각자의 PC에서 서버를 켜고, 본인 Codex·Claude Code·Gemini 계정으로 작업하는 가벼운 브라우저 앱입니다. EXE 설치나 Vercel 연결 없이 사용합니다.

## 실행

**[개인 서버 ZIP 받기](https://github.com/CodeplantEDU/codeplant_Attention/releases/download/local-v0.9.0/ATTENTION-Local.zip)** → 압축 해제 → Windows는 자동준비.cmd 실행 → 새 Codex 채팅에서 $attention-codex로 지시합니다.

브라우저 주소: **http://127.0.0.1:49322**. 서버 창은 켜 두세요. Mac은 폴더 안에서 npm start를 실행합니다.

소스에서 실행하려면 LECTURE_1/site 폴더에서 npm start를 실행합니다. npm install은 필요 없습니다. [전체 사용법](LECTURE_1/site/README.md).

## Codex에 입력할 내용

> LECTURE_1/site/README.md를 읽고 개인 서버를 실행해줘. Node와 사용할 AI CLI를 확인하고 부족한 공식 프로그램만 준비해줘. 로그인은 내가 할게. 문서 기능에 필요한 Python 패키지도 확인해. 기존 계정과 자료를 보존하고, http://127.0.0.1:49322를 열어줘. 실제 AI 작업은 내가 시작하도록 비워 둬.

## 기능

메인 AI·모델 선택, 다른 AI와 왕복 검토, 역할·서브 에이전트 설정, 자료 드래그앤드롭, 대화 이어가기, 대화로 Word·PDF·PPT·Excel 파일 만들기와 다운로드를 지원합니다.

새 배포본은 빈 공간으로 시작합니다. 이전 강의·과제 자료나 개인 계정은 포함하지 않습니다. 사용자가 넣은 자료와 대화는 .local-data에 저장됩니다. 기존 EXE와 그 기록은 자동 삭제하지 않습니다. 각자 자신의 PC에서 실행하며 외부 네트워크에는 공개하지 않습니다.

이전 강의자료·설치형 구현은 저장소 기록으로 보존하지만, 개인 서버 ZIP에는 포함하지 않습니다.
