# YiziMarkdown


![image](https://github.com/laoduu/YiziMarkdown/raw/main/docs/index.png)

[简体中文](../readme.md) | [繁體中文](./readme-zh-TW.md) | [English](./readme-en.md) | [日本語](./readme-ja.md) | [한국어](./readme-ko.md) | [Deutsch](./readme-de.md) | [Français](./readme-fr.md) | [Español](./readme-es.md) | [Português](./readme-pt.md) | [Italiano](./readme-it.md) | [Polski](./readme-pl.md) | [Nederlands](./readme-nl.md) | [Türkçe](./readme-tr.md) | [Svenska](./readme-sv.md) | [Українська](./readme-uk.md)


**공식 웹사이트：** https://md.yizigpt.com

간결하고 세련된 크로스 플랫폼 `Markdown` 편집기로, Windows 포터블 버전과 macOS 버전을 지원합니다. 설치 불필요, 압축 해제 즉시 사용 가능하며, 외관과 실용성을 모두 갖추고 있습니다. Windows에서는 설치 버전과 압축 해제 즉시 사용 가능한 버전을 제공하며, macOS에서는 Intel과 Apple Silicon 모두에서 네이티브로 실행되는 범용 바이너리 설치 패키지를 제공합니다.

왜 `Markdown` 편집기를 개발하게 되었을까요?

市中에 출시된 많은 `Markdown` 편집기들이 외관이 떨어지거나 기능이 너무 복잡하고 비대하여, 간결하고 아름우며 사용하기 편한 편집 도구를 찾기 어렵습니다.

그래서 YiziMarkdown가 탄생했습니다.

우리는 WYSIWYG(보이는 대로 편집) 모드에서 매우 우아한 경험을 만들었으며, PPT와 유사한 빠른 프레젠테이션 기능도 지원합니다. 작성한 노트와 문서를 빠르게 프레젠테이션 모드로 전환하여 공유와 보고에 활용할 수 있습니다. 사용해보면 그 차이를 알 수 있습니다.

---

## 기능 특징

### 다국어 인터페이스

- **15개 인터페이스 언어**：简体中文(기본)、繁體中文、English、日本語、한국어、Deutsch、Français、Español、Português、Italiano、Polski、Nederlands、Türkçe、Svenska、Українська
- 설정 → 일반 → 인터페이스 언어 원클릭 전환, 즉시 적용; 모든 인터페이스 문구, 단축키 패널, 플러그인 설명이 언어에 따라 자동 연동

### AI 어시스턴트 (사이드 채팅 패널)

- **17개 대형 모델 공급업체 + 사용자 정의 서비스**：OpenAI、Anthropic、Gemini、xAI、Mistral、Groq、DeepSeek、通义千问、智谱 GLM、Moonshot Kimi、火山方舟、硅基流动、MiniMax、OpenRouter、OpenCode Go、Ollama(로컬)；「사용자 정의 서비스」는 OpenAI 호환/Anthropic 호환 두 가지 프로토콜을 지원하며, Base URL, 모델 ID, 키를 직접 입력하여 모든 서드파티 서비스에 연결 가능
- **AI 스킬(Skill)**：입력창 ⚡ 버튼으로 스킬 메뉴를 열고, 선택한 스킬 태그가 커서 위치에 삽입되며 프롬프트가 자동으로 컨텍스트에 주입됩니다。`skills/` 디렉토리에 `skills.json` + `.md` 프롬프트 파일을 넣으면 사용자 정의 스킬을 만들 수 있습니다. 내장된 「프레젠테이션 요약」「문서 요약」「문체 개선」3개 스킬 제공
- **스트리밍 대화**：도구 모음 로봇 버튼으로 오른쪽 AI 패널을 열고, 답변이 실시간으로 스트리밍 출력되며 언제든 중지 가능
- **사고 과정 표시**：추론 모델의 사고 내용(reasoning/thinking)이 접을 수 있는 블록으로 표시되며, 기본적으로 접혀 있어 본문 읽기를 방해하지 않음
- **키 보안**：API 키는 시스템 키체인(OS keychain)에 저장되며, 원클릭 저장, 삭제, 검증을 지원; 로컬 엔드포인트(llama.cpp / LM Studio / vLLM 등)의 키는 비워둘 수 있음
- **현재 문서 인용**：체크 시 현재 문서를 컨텍스트로 AI에 전송하며, 인용 상한(64K~512K/무제한)과 컨텍스트 라운드 수(0~20라운드, 기본 3라운드)를 설정할 수 있음
- **결과 저장**：답변 복사, 문서 커서 위치에 삽입, 또는 원클릭으로 새 문서 생성 가능

### 편집 및 미리보기

- **소스 코드 편집**：CodeMirror 6 코어, 구문 강조, 괄호 매칭, 자동 완성
- **실시간 모드(WYSIWYG)**：보이는 대로 편집, 입력 시 Markdown 마크업이 자동으로 숨겨져 콘텐츠 작성에 집중
- **실시간 모드 애니메이션**：4가지 마크업 표시 애니메이션(포커스/플래시/글로우/리플), 설정에서 미리보기 및 전환 가능
- **실시간 미리보기**：Markdown을 작성하는 즉시 렌더링되며, 작업 목록 체크박스 상호작용 지원
- **5가지 뷰 모드**：소스/나란히/실시간(보이는 대로)/미리보기/프레젠테이션(전체화면 슬라이드), 원클릭 전환
- **개요 기반 스크롤 동기화**：나란히 모드에서 좌우 패널 양방향 연동, 뷰 전환 시 현재 위치로 자동 이동
- **검색 및 바꾸기**：일치 항목 탐색, 모두 바꾸기 지원
- **도구 모음 빠른 서식**：굵게, 기울임, 취소선, 인라인 코드, 텍스트 선택 즉시 적용
- **로컬 이미지 렌더링**：미리보기 모드에서 로컬 경로 이미지(jpg/png/gif/webp/svg/bmp) 자동 렌더링
- **줄 번호/자동 줄 바꿈**：설정에서 모두 켜기/끄기 가능
- **코드 블록 강화**：구문 강조(highlight.js), 언어 레이블, 복사 버튼, 자동 줄 바꿈 전환
- **서식 도구 모음 접기**：창 너비가 부족할 때 자동 접힘, 수동으로 펼치기/접기 지원
- **Frontmatter 필터**：미리보기/나란히/실시간 모드에서 YAML frontmatter 자동 필터링

### 수학 공식 및 차트

- **KaTeX 공식**：내장 KaTeX 플러그인, 인라인 `$...$` 및 블록 `$$...$$` LaTeX 공식 실시간 렌더링
- **Mermaid 차트**：내장 Mermaid 플러그인, 흐름도, 시퀀스 다이어그램, 간트 차트, 클래스 다이어그램, 파이 차트 등이 자동으로 시각적 차트로 렌더링되며, 다양한 테마 설정 지원
- **표 행렬 선택기**：도구 모음 표 버튼으로 8×8 격자를 열고, 마우스로 클릭하면 해당 행렬 수의 표가 삽입됨

### 프레젠테이션 모드 (슬라이드)

- **순수 Markdown 기반**：별도의 형식이 필요 없으며, `---`(수평 구분선)로 페이지를 나누고, 엔진이 전체 페이지 구조를 분석하여 자동으로 레이아웃을 선택
- **14가지 자동 레이아웃**：표지, 장별 페이지, 마지막 페이지, 목차, 본문, 목록, 데이터 표, 로드맵, 이미지+텍스트, 이미名사, 코드, 차트(mermaid), 공식
- **본문 페이지 좌측 정렬 + 강조 밑줄**：제목은 좌상단 정렬과 테마 색상 밑줄, 본문은 좌측 정렬로 편안한 독서 경험
- **명사 페이지 대각선 큰따옴표**：윗따옴표는 좌상단, 아랫따옴표는 우하단에 배치되며 내용은 상하 중앙 정렬
- **명시적 지시**：`<!-- layout: xxx -->`로 레이아웃 강제, `<!-- align: left|center|right -->`로 페이지 전체 정렬(HTML 주석, 렌더링 시 보이지 않음)
- **표지 메타**：front matter에서 `author`/`date`를 제공하면 표지에 자동 표시
- **바닥글 및 진행률**：좌측 하단에 장 이름 + 페이지 번호, 하단에 테마 색상 진행률 표시줄
- **마우스 휠 페이지 전환**：콘텐츠가 스크롤 가능할 때는 콘텐츠를 먼저 스크롤하고, 경계에 도달하면 페이지 전환
- **테마 상속**：제목 색상이 테마에 따라 정확하게 변화(15개 테마 모두 지원), 프레젠테이션 내에서 테마/다크모드 전환 가능
- **전체화면 전환**：F 키로 전체화면/복원, 일반/최대화된 모든 창 상태에서 안정적으로 진입 가능
- **종료 버튼**：마우스 활동 시 우측 상단에 반투명 종료 버튼 표시, 1.5초 동안 조작 없으면 자동 숨김
- **창 상태 복원**：프레젠테이션 종료 시 진입 전 창 상태(전체화면/최대화/일반)로 자동 복원

### 플러그인 시스템

- 플러그인 아키텍처, 내장 KaTeX 및 Mermaid 두 가지 핵심 플러그인
- 설정 패널 「플러그인」 페이지에서 시작/중지 제어 및 플러그인 설정 지원
- 플러그인은 필요에 따라 동적으로 로드되며, 비활성화 시 리소스를 소비하지 않음

### 다중 파일 관리

- **단일 인스턴스 모드**：여러 파일을 열어도 여러 창이 열리지 않고 기존 인스턴스에 자동으로 병합되며, 중복으로 열린 파일은 해당 탭으로 자동 이동
- **탭 탭 표시줄**：상단에서 열린 파일을 관리, 전환, 닫기, 새로 만들기
- **홈 페이지**：최근에 연 파일 목록, 파일 크기 및 수정 시간 포함
- **저장 상태 표시**：저장되지 않은 파일은 호흡 점 애니메이션, 저장 후 ✅ 확인 애니메이션
- **닫기 확인**：저장되지 않은 파일 닫을 때 저장/저장하지 않기/취소 확인 대화상자 표시

### 파일 작업

- **열기**：.md / .markdown / .txt 지원
- **새로 만들기**：새 빈 탭을 열고 「제목 없는 새 파일」표시
- **템플릿에서 새로 만들기**：도구 모음 「템플릿에서 새로 만들기」 드롭다운 메뉴에서 선택한 템플릿의 Markdown 구조로 새 문서 생성; 설정 → 일반에서 기본 템플릿을 설정하면 `Ctrl+N`으로 자동 적용
- **저장/자동 저장**：수동 저장 + 설정 가능한 간격의 자동 저장(5~180초, 기본 60초)
- **다른 이름으로 저장**：새 파일 저장 시 자동으로 다른 이름으로 저장 대화상자 표시
- **내보내기**：HTML / Markdown / 순수 텍스트 세 가지 형식
- **.md 파일 연결**：설정에서 원클릭으로 시스템 기본 Markdown 편집기로 설정, .md 더블클릭으로 바로 열기(Windows 레지스트리 / macOS LaunchServices)

### 외관 사용자 정의

- **15개 내장 테마**：학술 블루(기본), 활기 오렌지, 테크 감성, 미니멀, 매거진, 내추럴, 액체 글래스, 리치 레드, 바이올렛, 사이버펑크, Facebook, 매트릭스, 민트 스무디, 선셋 골드, 레트로 타이핑기, 각 테마마다 밝고 어두운 두 가지 색상 포함
- **다크/라이트 모드**：각 테마마다 밝고 어두운 두 가지 색상
- **글꼴 사용자 정의**：소스 및 미리보기 모드별로 글꼴, 크기, 행 간격 설정 가능
- **사용자 정의 CSS**：`user.css`가 모든 테마 이후에 적용되며 최우선 적용
- **테마 확장**：`themes/` 디렉토리에 `.css` 파일을 넣고 `themes/theme.json`에 테마 매개변수를 추가하면 재시작 후 자동 인식

### 기타

- **문서 템플릿**：`templates/` 디렉토리에 `.md` 파일을 넣으면 새로 만들 때 선택 가능
- **단축키 시스템**：시각적 단축키 설정 패널, 30개 액션의 사용자 정의 바인딩, 키 녹음, 충돌 감지 및 기본값 복원 지원
- **설정 패널**：일반, 외관, 편집기, 실시간 모드, AI, 플러그인, 단축키, 템플릿, 정보 등 여러 탭으로 구성, 설정 즉시 미리보기

---

## 단축키

| 단축키 | 기능 |
|--------|------|
| Ctrl+N | 새 파일 |
| Ctrl+O | 파일 열기 |
| Ctrl+S | 파일 저장 |
| Ctrl+Shift+S | 다른 이름으로 저장 |
| Ctrl+W | 탭 닫기 |
| Ctrl+H | HTML 내보내기 |
| Ctrl+M | Markdown 내보내기 |
| Ctrl+Z | 실행 취소 |
| Ctrl+Y | 다시 실행 |
| Ctrl+F | 검색 |
| Ctrl+\ | 사이드바 전환 |
| Ctrl+B | 굵게 |
| Ctrl+I | 기울임 |
| Ctrl+- | 취소선 |
| Ctrl++ | 인라인 코드 |
| Ctrl+1 | 1단계 제목 |
| Ctrl+2 | 2단계 제목 |
| Ctrl+3 | 3단계 제목 |
| Ctrl+. | 비순서 목록 |
| Ctrl+0 | 순서 목록 |
| Ctrl+' | 인용 |
| Ctrl+K | 링크 |
| Ctrl+` | 코드 블록 |
| Ctrl+T | 표 |
| Ctrl+L | 구분선 |
| F1 | 단축키 전체 목록 |
| F2 | 다크/라이트 모드 전환 |
| F3 | 뷰 순환 전환 |
| Ctrl+Alt+P | 프레젠테이션 모드(슬라이드) |
| Ins | 슬래시 메뉴 |
| F12 | 개발자 도구 |

단축키는 설정 → 단축키에서 사용자 정의할 수 있으며, 시각적 설정과 충돌 감지를 지원합니다.

---

## 포터블 버전 디렉토리 구조

```
YiziMarkdown/
├── YiziMarkdown.exe        # 메인 프로그램
├── readme.md               # 프로젝트 설명(본 파일)
├── welcome.md              # 환영 문서
├── changelog.md            # 개발 로그
├── user.css                # 사용자 정의 스타일
├── keybindings.json        # 단축키 설정
├── themes/                 # 테마 CSS 파일
│   ├── academic.css        # 학술 블루(기본)
│   ├── vibrant.css         # 활기 오렌지
│   ├── tech.css            # 테크 감성
│   ├── minimal.css         # 미니멀
│   ├── magazine.css        # 매거진
│   ├── nature.css          # 내추럴
│   ├── liquidglass.css     # 액체 글래스
│   ├── lychee.css          # 리치 레드
│   ├── violet.css          # 바이올렛
│   ├── cyberpunk.css       # 사이버펑크
│   ├── facebook.css        # Facebook
│   ├── matrix.css          # 매트릭스
│   ├── mint.css            # 민트 스무디
│   ├── sunset.css          # 선셋 골드
│   └── typewriter.css      # 레트로 타이핑기
├── skills/                 # AI 스킬(Skill)
│   ├── skills.json         # 스킬 목록
│   ├── slides-outline.md   # 프레젠테이션 요약
│   ├── doc-summary.md      # 문서 요약
│   └── polish-writing.md   # 문체 개선
└── templates/              # 문서 템플릿
    └── default.md          # 기본 템플릿
```

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데스크톱 프레임워크 | Tauri 2 (Rust) |
| 프론트엔드 프레임워크 | React 18 + TypeScript |
| 편집기 코어 | CodeMirror 6 |
| 상태 관리 | Zustand (persist) |
| 스타일링 | Tailwind CSS + CSS 변수 |
| Markdown 렌더링 | markdown-it |
| 국제화 | 자체 경량 i18n(15개 언어) |
| AI 연결 | Rust 스트리밍 프록시(OpenAI/Anthropic/Ollama 프로토콜) |
| 빌드 도구 | Vite |

---

## 개발

### 환경 요구사항

- Node.js 18+
- Rust (stable)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### 개발 서버 시작

```bash
cd code
npm install
npm run tauri:dev
```

### 릴리스 빌드

**Windows**

```bash
npm run tauri:build
```

빌드 결과물：
- 포터블 exe：`src-tauri/target/release/yizimarkdown.exe`
- MSI 설치 패키지：`src-tauri/target/release/bundle/msi/`
- NSIS 설치 패키지：`src-tauri/target/release/bundle/nsis/`

빌드 후 exe와 리소스 파일을 수동으로 `public/YiziMarkdown-vX.X.X/` 디렉토리에 복사하여 배포합니다.

**macOS(범용 바이너리, Intel 및 Apple Silicon 모두 지원)**

```bash
rustup target add aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

빌드 결과물：
- 애플리케이션 패키지：`src-tauri/target/universal-apple-darwin/release/bundle/macos/YiziMarkdown.app`
- 설치 패키지：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/YiziMarkdown_0.2.2_universal.dmg`

### 프로젝트 구조

```
code/
├── src/                    # 프론트엔드 소스 코드
│   ├── App.tsx             # 메인 애플리케이션 컴포넌트
│   ├── components/         # UI 컴포넌트
│   │   ├── Editor.tsx      # CodeMirror 편집기 + 미리보기
│   │   ├── TabBar.tsx      # 탭 탭 표시줄
│   │   ├── HomePage.tsx    # 홈 페이지(최근 파일)
│   │   ├── Toolbar.tsx     # 도구 모음
│   │   ├── Sidebar.tsx     # 사이드바(개요 + 파일 탐색)
│   │   ├── StatusBar.tsx   # 하단 상태 표시줄
│   │   └── SettingsModal.tsx # 설정 패널
│   ├── stores/             # Zustand 상태 관리
│   ├── lib/                # 유틸리티 라이브러리(Markdown 렌더링, 제목 ID)
│   └── styles/             # 전역 스타일
├── src-tauri/              # Rust 백엔드
│   ├── src/main.rs         # Tauri 명령(파일 읽기/쓰기, 테마 로딩, 레지스트리 등)
│   ├── icons/              # 애플리케이션 아이콘
│   ├── themes/             # 테마 CSS
│   └── templates/          # 문서 템플릿
└── package.json
```

---

## 라이선스

MIT
