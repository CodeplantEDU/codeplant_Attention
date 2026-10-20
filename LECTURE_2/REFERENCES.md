# 참고 자료와 구현 범위

확인일: 2026-10-20 (한국 시간).

## 과정 참고

- [OpenDesign 저장소](https://github.com/nexu-io/open-design): 사용자의 기획과 자료를 디자인 규칙으로 만들고, 토큰·미리보기·후속 작업에 전달하는 개념을 참고했습니다.
- [OpenDesign 디자인 시스템 시작 화면](https://github.com/nexu-io/open-design/blob/main/apps/web/src/components/DesignSystemCreateHero.tsx): 참고 자료 입력·규칙 생성·재사용 자료라는 과정의 범위를 확인했습니다.
- [OpenDesign 라이선스](https://github.com/nexu-io/open-design/blob/main/LICENSE): 원본 저장소의 라이선스는 Apache-2.0으로 표시돼 있습니다. 이 서비스는 원본의 구현·UI·카피·샘플 패키지·템플릿을 가져오지 않았습니다.

이 서비스의 정보 구조, 한국어 안내, 편집 데이터 구조, 화면, 스타일과 로컬 서버는 이 수업의 요구에 맞춰 별도로 구현했습니다. 위 사실은 모든 제3자 자료의 권리 검토를 대신하지 않습니다. 사용자가 넣는 로고·참고 글·브랜드 규칙의 출처와 사용 권한은 별도로 확인해야 합니다.

## 브랜드 자료

- 사용자가 지정한 `codeplant-design` 스킬의 제공된 공식 CODEPLANT 로고와 브랜드 가이드를 사용했습니다. 흰색·회색 표면, #6FC5C1·#D8F1F0·#2D2D2D, Pretendard, 평면 스타일, 한국어 작성 규칙을 적용했습니다.
- Pretendard는 기존 `LECTURE_1/site/public/assets`의 원본 글꼴·라이선스를 재사용했습니다. 글꼴 라이선스는 `public/assets/Pretendard-LICENSE.txt`에 포함합니다.
- 사용자 디자인의 성공색 #23704A와 오류색 #B42318은 이 서비스가 제안한 기본값입니다. 원본 CODEPLANT의 공식 추가 색상이라는 의미가 아닙니다.

## CLI 연동 공식 문서

- [Codex CLI reference](https://developers.openai.com/codex/cli/reference/): 비대화형 실행, 읽기 전용 샌드박스, JSON 이벤트, JSON Schema 응답.
- [Claude Code programmatic use](https://code.claude.com/docs/en/headless): print 모드, JSON 출력과 `structured_output`.
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference): restricted 모드, 도구·MCP·설정 격리 옵션.
- [Codex 설치](https://developers.openai.com/codex/cli/) · [Claude Code 설치](https://code.claude.com/docs/en/setup) · [Node.js](https://nodejs.org/en/download).

공급자 모델 이름을 임의로 고정하지 않고 해당 CLI의 기본 모델을 사용합니다. CLI의 실제 옵션은 설치 버전과 공식 문서를 함께 확인했습니다. 계정별 로그인·사용 권한·한도는 각 서비스가 관리합니다.
