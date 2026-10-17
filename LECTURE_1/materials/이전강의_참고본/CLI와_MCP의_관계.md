# 연결을 설명하는 방법

이번 기본 연결은 Codex가 셸 도구로 Python 전달 프로그램을 실행하고, 프로그램이 Claude 또는 Gemini CLI에 입력을 보내 답변을 돌려받는 방식이다. 설치·로그인만으로 모델끼리 자동 대화하지 않는다. Codex가 언제 누구에게 무엇을 보낼지 결정하고 회신을 읽어 다음 발언을 작성한다.

CLI는 프로그램을 명령으로 부르는 입구다. MCP는 AI 앱에 도구를 표준 형식으로 노출하는 연결 규격이다. MCP 어댑터로 ask_claude·ask_gemini 같은 도구를 노출할 수도 있지만 별도의 구현과 등록이 필요하다. 이 패키지는 그런 MCP 서버를 구현하거나 연결 완료했다고 주장하지 않는다. 기본 CLI 경로로 같은 메시지 전달 목적을 수행한다.

OpenAI의 문서 MCP는 공식 문서 검색·읽기용이다. 이 서버 등록만으로 Claude·Gemini 대화가 생기지 않는다. 강의에서는 같은 Codex에서 쓸 수 있는 다른 연결 사례로 짧게 설명한다.

```
codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
codex mcp list
```

등록 목록과 실제 도구 호출 성공을 구분한다. 연결 실패 시 기본 CLI 대화를 계속한다. 원격 AI 회신은 원문·출처와 함께 검토하며, 모델끼리 합의했다는 이유만으로 사실로 확정하지 않는다.
