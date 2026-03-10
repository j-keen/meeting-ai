# Meeting AI — 풀스택 기술 분석 보고서

> **작성일**: 2026-03-11
> **분석 대상**: Meeting AI v1.0 (클라이언트 SPA + 정적 서버)
> **코드베이스**: ~6,500 LOC (JS 4,090 / HTML 594 / CSS 1,617)

---

## 1. Executive Summary

Meeting AI는 브라우저 기반 실시간 회의 보조 도구로, Web Speech API를 통한 STT, Google Gemini API를 활용한 AI 분석/채팅, localStorage 기반 데이터 저장을 핵심으로 하는 **순수 클라이언트 사이드 SPA**이다. 서버(`server.js`)는 33줄의 정적 파일 서버에 불과하며, 모든 비즈니스 로직이 클라이언트에서 실행된다.

### 핵심 강점
- **명확한 모듈 분리**: app/ai/chat/stt/storage/ui/settings/i18n/meeting-prep 9개 모듈로 관심사 분리
- **Pub/Sub 패턴**: 모듈 간 느슨한 결합 (`on`/`emit`)
- **i18n 완성도**: 한/영 완전 지원, data-i18n 속성 기반 선언적 번역
- **UX 완성도**: 다크모드, 반응형, 드래그 리사이저, 스켈레톤 UI, 토스트 알림

### 핵심 위험
- **[P0] API 키 클라이언트 노출**: Gemini API 키가 브라우저 네트워크 탭에서 평문 노출
- **[P0] XSS 취약점**: `innerHTML` 사용 시 사용자 입력/AI 응답의 불완전한 이스케이프
- **[P1] localStorage 5MB 한계**: 장시간 회의 또는 다수 회의 저장 시 데이터 손실 가능
- **[P1] 테스트 부재**: 단위/통합/E2E 테스트가 전무

---

## 2. 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                     index.html (SPA)                     │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Panel L │  │ Panel C  │  │ Panel R  │               │
│  │Transcript│  │AI Analysis│  │ AI Chat  │               │
│  └────┬────┘  └────┬─────┘  └────┬─────┘               │
│       │            │              │                      │
│  ┌────▼────────────▼──────────────▼─────┐               │
│  │              ui.js (795L)            │  DOM 렌더링     │
│  │  Toast, Transcript, Analysis,       │  이벤트 바인딩   │
│  │  History, Viewer, Modals            │               │
│  └────────────────┬─────────────────────┘               │
│                   │ emit/on                              │
│  ┌────────────────▼─────────────────────┐               │
│  │            app.js (952L)             │  ★ 중앙 허브    │
│  │  State, Pub/Sub, Init, Recording,   │               │
│  │  Analysis, Export, Timer, Demo       │               │
│  └──┬──────┬──────┬──────┬──────┬──────┘               │
│     │      │      │      │      │                       │
│  ┌──▼──┐┌──▼──┐┌──▼───┐┌▼────┐┌▼──────────┐           │
│  │ai.js││chat ││stt.js││stor-││settings.js │           │
│  │228L ││.js  ││ 87L  ││age  ││  432L      │           │
│  │     ││366L ││      ││212L ││            │           │
│  └──┬──┘└──┬──┘└──┬───┘└──┬──┘└────────────┘           │
│     │      │      │       │                             │
│  ┌──▼──────▼──┐┌──▼──┐┌───▼──────────┐                 │
│  │Gemini API  ││Web  ││localStorage  │  외부 의존성      │
│  │(REST)      ││Speech││(5MB)        │                 │
│  └────────────┘│API   │└─────────────┘                 │
│                └──────┘                                 │
│  ┌────────────────────────────────────────┐             │
│  │  meeting-prep.js (525L) + i18n.js (666L)│ 보조 모듈  │
│  └────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐
│  server.js (33L) │  정적 파일 서버 (Node.js http)
│  Vercel 배포      │  비즈니스 로직 없음
└─────────────────┘
```

### 모듈 의존성 그래프

```
app.js ──imports──▶ stt.js, ai.js, storage.js, ui.js, settings.js, chat.js, meeting-prep.js, i18n.js
ui.js  ──imports──▶ app.js (state, emit, on), i18n.js, storage.js
chat.js ──imports──▶ app.js (state, emit), i18n.js
settings.js ──imports──▶ app.js (state, emit), storage.js, ai.js, i18n.js
meeting-prep.js ──imports──▶ app.js (emit), chat.js, storage.js, i18n.js
ai.js  ──imports──▶ i18n.js
stt.js ──imports──▶ i18n.js
i18n.js ──imports──▶ (없음 — leaf 모듈)
storage.js ──imports──▶ (없음 — leaf 모듈)
```

### 순환 의존성 분석
- `app.js ↔ ui.js`: app이 ui를 import하고, ui가 app의 `state`/`emit`/`on`을 import
- `app.js ↔ chat.js`: 동일 패턴
- `app.js ↔ settings.js`: 동일 패턴

ES 모듈 특성상 순환 참조가 런타임 오류를 유발하지는 않으나, 모듈 초기화 순서에 민감한 구조이다.

---

## 3. 모듈별 상세 분석

### 3.1 app.js (952L) — 중앙 오케스트레이터

**역할**: 상태 관리, Pub/Sub, 녹음 제어, 분석 실행, 내보내기, 초기화

**God Object 분석**:
- `state` 객체가 11개 필드를 가진 전역 뮤터블 상태 → **부분적 God Object**
- 그러나 각 모듈이 `state`를 직접 참조하되 변경은 주로 app.js에서 수행 → 단방향 데이터 흐름에 가까움
- `init()` 함수가 40개 이상의 이벤트 바인딩을 설정 (568~843행) → **과도한 책임**

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 27-34 | Pub/Sub `listeners` 배열에 unsubscribe 반환하지만, 실제 호출 코드 없음 → 이벤트 누수 가능 | P2 |
| 37-51 | `state` 객체가 `export`되어 모든 모듈에서 직접 변경 가능 → 예측 불가능한 상태 변이 | P2 |
| 128-131 | `setInterval` 3개 동시 시작 (timer, autoSave, autoAnalysis) — 정리 로직 존재하나 에러 시 누수 가능 | P2 |
| 390 | `resetMeeting()`에서 `innerHTML = ''`로 DOM 일괄 초기화 → 이벤트 리스너 참조 GC에 의존 | P3 |
| 629 | `require('./settings.js')` 사용 — ES 모듈에서 CommonJS require는 오류 발생 (dead code) | P3 |
| 888-949 | Demo 데이터가 프로덕션 코드에 하드코딩 | P3 |

### 3.2 ai.js (228L) — Gemini API 인터페이스

**역할**: 회의록 분석, 태그 생성, 오타 교정

**아키텍처 평가**: 잘 분리된 순수 함수 모듈. 외부 상태 의존 없음.

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 119 | `?key=${apiKey}` — API 키가 URL 쿼리 파라미터로 전송 → **브라우저 히스토리, 서버 로그, 네트워크 탭에 노출** | P0 |
| 122-151 | 재시도 로직이 2회 고정, 지수 백오프 없음 | P3 |
| 47-64 | `parseGeminiResponse` — JSON 파싱 실패 시 정규식 폴백 → 견고하지만 예외 케이스 많음 | P3 |
| 19-45 | `buildTranscriptText` — 'smart' 전략에서 recent가 빈 배열이면 마지막 20개 사용 → 적절한 폴백 | OK |

### 3.3 chat.js (366L) — AI 채팅 모듈

**역할**: Gemini 채팅, Function Calling, 마크다운 렌더링

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 8-12 | `GEMINI_BASE`/`getGeminiUrl` — ai.js와 **코드 중복** | P2 |
| 293-336 | `renderMarkdown()` — HTML 이스케이프 후 마크다운 변환하지만, `<li>$1</li>` 등에서 $1이 이미 이스케이프된 텍스트 → 안전하나 복잡한 마크다운에서 깨질 수 있음 | P2 |
| 173 | `?key=${state.settings.geminiKey}` — ai.js와 동일한 API 키 노출 문제 | P0 |
| 245-269 | `buildContents` — 시스템 프롬프트를 첫 user 메시지에 합치는 방식 → Gemini의 `systemInstruction` 미사용 | P3 |
| 47-49 | `attachedFileContent`/`attachedFileName` — 모듈 레벨 mutable 변수 | P3 |

### 3.4 stt.js (87L) — 음성 인식 추상화

**역할**: Web Speech API 래퍼

**아키텍처 평가**: 깔끔한 팩토리 패턴. 최소한의 추상화.

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 23 | 언어 매핑이 4개만 하드코딩 (`ko`, `ja`, `zh`, `en`) — 확장성 부족 | P3 |
| 43-46 | `onend`에서 `shouldRestart` 시 재시작 — 무한 재시작 가능성 (네트워크 끊김 시) | P2 |
| 45 | `try { recognition.start(); } catch {}` — 에러 무시 | P2 |

### 3.5 storage.js (212L) — 데이터 영속화

**역할**: localStorage CRUD, 설정 관리, 오타 사전, 연락처

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 7-13 | `getStorageUsage` — `localStorage.length` 전체 순회 → O(n) 성능 | P3 |
| 16-23 | `loadAll()` — 매 호출마다 전체 JSON 파싱 → **빈번한 호출 시 성능 병목** | P1 |
| 115-127 | `saveApiKey`/`getApiKey` — Base64 인코딩 (btoa/atob) → **암호화가 아닌 단순 인코딩, 보안 무의미** | P1 |
| 78-81 | 50개 초과 회의 시 자동 삭제 — 사용자 동의 없이 데이터 손실 | P2 |
| 전체 | 모든 데이터가 단일 키(`meeting-ai-data`)에 저장 → 하나의 거대한 JSON blob | P2 |

### 3.6 settings.js (432L) — 설정 패널 관리

**역할**: 설정 UI 이벤트 바인딩, 값 로드/저장

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 400-418 | `renderTypoDictModal` — `item.innerHTML`에 `before` 값을 `data-before` 속성에 직접 삽입 → XSS 가능 | P0 |
| 407-414 | `require('./storage.js')` — ES 모듈에서 CommonJS 사용 (dead code, 직후 dynamic import로 대체) | P3 |
| 309-371 | `loadSavedSettings` — 20개 이상의 DOM 조작을 일괄 수행 → DOM 배칭 미사용 | P3 |

### 3.7 ui.js (795L) — DOM 렌더링 엔진

**역할**: 모든 UI 렌더링, 이벤트 위임, 드래그 리사이저, 키보드 단축키

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 417-426 | `renderHighlights` — `item.text`를 `innerHTML`에 직접 삽입, `escapeHtml` 미적용 → **XSS 취약점** | P0 |
| 441-447 | `renderAnalysisHistory` — `analysis.summary`와 `actionItems`를 `innerHTML`에 직접 삽입 → **XSS 취약점** | P0 |
| 579-580 | `renderMeetingViewer` — `metaContainer.innerHTML`에 `value` 직접 삽입 → XSS 가능 | P0 |
| 592-596 | `renderMeetingViewer` — transcript `line.text`를 `innerHTML`에 직접 삽입 → **XSS 취약점** | P0 |
| 688-703 | `renderViewerAnalysis` — 분석 결과를 `innerHTML`에 직접 삽입 → **XSS 취약점** | P0 |
| 506-507 | `renderHistoryGrid` — `tag` 값을 `data-tag` 속성과 innerHTML에 삽입 → XSS 가능 | P1 |
| 644-679 | `scroll` 이벤트에 쓰로틀링 없음 → 성능 저하 가능 | P2 |

### 3.8 i18n.js (666L) — 국제화

**역할**: 한/영 번역, AI 프롬프트 관리

**아키텍처 평가**: 잘 설계된 i18n 시스템. `data-i18n*` 속성 기반 선언적 번역.

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 626-634 | `t()` — 단순 문자열 치환 (`{key}` → value), 복수형/성별 미지원 | P3 |
| 전체 | 번역 키 537개가 하나의 파일에 하드코딩 → JSON 분리 권장 | P3 |

### 3.9 meeting-prep.js (525L) — 회의 준비 챗봇

**역할**: 단계별 회의 설정 가이드 (챗봇 UI)

**아키텍처 평가**: State machine 패턴으로 잘 구현. 초성 검색 기능 포함.

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 305 | `card.innerHTML`에 `escapeHtml` 적용 → 안전 | OK |
| 420-445 | `renderStandbyStep`에서 `escapeHtml` 적용 → 안전 | OK |
| 42-51 | 모듈 레벨 mutable state (`active`, `currentStep`, `config`) | P3 |

### 3.10 server.js (33L) — 정적 파일 서버

**주요 이슈**:

| 행 | 이슈 | 심각도 |
|---|---|---|
| 23 | **Path Traversal 취약점** — `url.pathname`을 직접 `join`하여 파일 읽기 → `/../../../etc/passwd` 접근 가능 | P0 |
| 전체 | CORS, CSP, Rate Limiting 등 보안 헤더 없음 | P2 |
| 전체 | 캐싱 헤더 없음 (ETag, Cache-Control) | P3 |

---

## 4. 이슈 목록 (우선순위별)

### P0 — 즉시 수정 필요 (보안 취약점)

| # | 모듈 | 이슈 | 영향 |
|---|---|---|---|
| 1 | ai.js, chat.js | **Gemini API 키 URL 쿼리 노출** | API 키 탈취, 과금 폭탄 |
| 2 | ui.js:417 | `renderHighlights`에서 `item.text` innerHTML 직접 삽입 → XSS | 세션 하이재킹, 데이터 유출 |
| 3 | ui.js:441-447 | `renderAnalysisHistory`에서 분석 결과 innerHTML 직접 삽입 → XSS | AI 응답 주입 공격 |
| 4 | ui.js:592-596 | `renderMeetingViewer` transcript innerHTML 직접 삽입 → XSS | 저장된 XSS |
| 5 | ui.js:688-703 | `renderViewerAnalysis` innerHTML 직접 삽입 → XSS | AI 응답 주입 |
| 6 | ui.js:579 | `renderMeetingViewer` 메타데이터 innerHTML 직접 삽입 → XSS | 저장된 XSS |
| 7 | settings.js:400 | `renderTypoDictModal`에서 `before`를 `data-before`에 직접 삽입 → XSS | 오타 사전 주입 |
| 8 | server.js:23 | **Path Traversal** — URL 경로 검증 없이 파일 시스템 접근 | 서버 파일 유출 |

### P1 — 높은 우선순위

| # | 모듈 | 이슈 |
|---|---|---|
| 9 | storage.js | `loadAll()` 매 호출마다 전체 JSON 파싱 — `saveMeeting` 내에서 load→modify→save 패턴으로 2회 파싱 |
| 10 | storage.js | Base64 API 키 저장 — 보안 효과 없음, 개발자 도구에서 즉시 디코딩 가능 |
| 11 | storage.js | localStorage 5MB 한계 — 대규모 회의 데이터 손실 가능 |
| 12 | 전체 | **테스트 부재** — 단위/통합/E2E 테스트 전무 |
| 13 | ui.js:506 | History grid 태그 렌더링 시 XSS 가능 |

### P2 — 중간 우선순위

| # | 모듈 | 이슈 |
|---|---|---|
| 14 | app.js | Pub/Sub unsubscribe 미사용 → 이벤트 리스너 누적 가능 |
| 15 | app.js | `state` 객체 외부 변경 가능 (캡슐화 부재) |
| 16 | chat.js, ai.js | Gemini URL 생성 코드 중복 |
| 17 | stt.js | 음성 인식 무한 재시작 가능성 |
| 18 | storage.js | 50개 초과 회의 자동 삭제 — 사용자 미고지 |
| 19 | storage.js | 단일 키 JSON blob — 부분 업데이트 불가 |
| 20 | server.js | 보안 헤더 부재 (CORS, CSP) |
| 21 | ui.js:644 | scroll 이벤트 쓰로틀링 없음 |
| 22 | chat.js:293 | 마크다운 렌더러가 커스텀 구현 — 엣지 케이스 취약 |

### P3 — 낮은 우선순위 (코드 품질)

| # | 모듈 | 이슈 |
|---|---|---|
| 23 | app.js:629 | dead code: `require('./settings.js')` |
| 24 | app.js:888 | 프로덕션 코드에 Demo 데이터 하드코딩 |
| 25 | stt.js:23 | 언어 매핑 4개 하드코딩 |
| 26 | i18n.js | 번역 데이터 코드 내 하드코딩 |
| 27 | settings.js:309 | DOM 배칭 미사용 |
| 28 | ai.js:122 | 재시도 지수 백오프 없음 |
| 29 | meeting-prep.js | 모듈 레벨 mutable state |

---

## 5. 보안 취약점 보고서

### 5.1 [CRITICAL] 클라이언트 사이드 API 키 노출

**위치**: `ai.js:119`, `chat.js:173`
**코드**:
```javascript
const url = `${getGeminiUrl(model)}?key=${apiKey}`;
```

**위험**:
- 브라우저 Network 탭에서 API 키 평문 확인 가능
- 브라우저 히스토리에 URL과 함께 기록
- 서버 로그에 쿼리 파라미터로 기록
- 악성 브라우저 확장이 URL 수집 가능

**대응 방안**:
1. **프록시 서버 도입** (권장): `server.js`에 `/api/gemini` 엔드포인트 추가, 서버에서 API 키 관리
2. 최소한 `Authorization: Bearer` 헤더 사용 (Gemini API 지원 시)
3. API 키 사용량 제한/모니터링 설정

### 5.2 [CRITICAL] XSS (Cross-Site Scripting) 취약점

**공격 벡터**: AI 응답에 악성 HTML이 포함될 경우, 또는 저장된 회의 데이터가 조작된 경우

**취약 코드 예시** (`ui.js:592-596`):
```javascript
div.innerHTML = `
  <span class="transcript-text">${line.text}</span>
`;
```

`line.text`가 `<img src=x onerror=alert(1)>`인 경우 스크립트 실행됨.

**안전한 코드 vs 취약한 코드**:
- `chat.js:101` — model 응답에 `renderMarkdown()` 사용, 이 함수는 HTML 이스케이프 후 변환 → **안전**
- `chat.js:102` — user 메시지에 `textContent` 사용 → **안전**
- `meeting-prep.js:305,420` — `escapeHtml()` 적용 → **안전**
- `ui.js:417,441,592,688` — 이스케이프 **미적용** → **취약**

**영향**: localStorage에 저장된 XSS → 지속적(Persistent) XSS로 발전 가능. 매번 회의 뷰어 열 때마다 실행.

**대응 방안**:
1. 모든 `innerHTML` 할당에서 `escapeHtml()` 적용
2. 또는 `textContent` 사용으로 전환
3. CSP(Content Security Policy) 헤더 추가: `script-src 'self'`

### 5.3 [CRITICAL] Path Traversal (server.js)

**위치**: `server.js:23`
```javascript
let filePath = join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
```

**공격**: `GET /../../../etc/passwd` → 서버 파일 시스템 임의 읽기

**대응 방안**:
```javascript
const resolved = path.resolve(path.join(__dirname, url.pathname));
if (!resolved.startsWith(__dirname)) {
  res.writeHead(403); res.end('Forbidden'); return;
}
```

### 5.4 [HIGH] localStorage 데이터 평문 저장

**위치**: `storage.js` 전체

**위험**:
- API 키가 Base64로 저장 → `atob()` 한 줄로 복호화
- 회의 내용(민감 정보 가능)이 평문 저장
- 같은 도메인의 다른 스크립트가 접근 가능
- XSS와 결합 시 모든 데이터 탈취 가능

**대응 방안**:
1. API 키는 서버 측으로 이동 (가장 좋음)
2. 민감 데이터는 Web Crypto API로 암호화
3. 최소한 `sessionStorage` 사용 검토 (세션 종료 시 삭제)

### 5.5 [MEDIUM] Slack Webhook URL 노출

**위치**: `app.js:513-525`

Slack Webhook URL이 클라이언트에서 직접 호출됨 → URL 노출 시 채널 스팸 가능.

---

## 6. 성능 분석 및 최적화 방안

### 6.1 렌더링 성능

**현재 상태**:
- 트랜스크립트 라인이 하나씩 DOM에 추가 (`appendChild`) → O(n) DOM 조작
- `renderHistoryGrid`, `renderMeetingViewer` 등에서 대량 `innerHTML` 교체

**문제 시나리오**:
- 2시간 회의 → ~200+ 트랜스크립트 라인 → DOM 노드 과다
- 50개 회의 히스토리 → 각 카드에 10+ DOM 노드

**최적화 방안**:

| 방안 | 효과 | 난이도 |
|---|---|---|
| Virtual scrolling (transcript) | 대량 라인 렌더링 O(1) | 중 |
| DocumentFragment 배칭 | DOM reflow 최소화 | 하 |
| `requestAnimationFrame` 배칭 | 프레임 드롭 방지 | 하 |
| Intersection Observer | 비가시 영역 렌더링 지연 | 중 |

### 6.2 데이터 성능

**현재 상태** (`storage.js`):
```
loadAll() → JSON.parse(전체 데이터) → 수정 → JSON.stringify(전체 데이터) → 저장
```

**문제**:
- `saveMeeting()` 내에서 `loadAll()` 1회 + `saveAll()` 내 `getStorageUsage()` 1회 = **매 저장마다 3+ 직렬화**
- 30초마다 자동 저장 → 30초마다 전체 데이터 직렬화/역직렬화
- 50개 회의 × 200 라인 = ~2MB JSON → 파싱에 50-100ms 소요 가능

**최적화 방안**:

| 방안 | 효과 | 난이도 |
|---|---|---|
| 메모리 캐싱 (loadAll 결과) | 반복 파싱 제거 | 하 |
| IndexedDB 마이그레이션 | 5MB 한계 해소, 구조적 쿼리 | 중 |
| 회의별 개별 키 저장 | 부분 업데이트 가능 | 하 |
| Debounced 자동 저장 | 불필요한 직렬화 감소 | 하 |

### 6.3 네트워크 성능

**현재 상태**:
- Gemini API 호출 시 전체 프롬프트를 매번 전송
- 재시도 시 1초 고정 대기 (지수 백오프 없음)
- 에러 시 전체 결과 폐기 (부분 결과 미활용)

**최적화 방안**:
- streaming 응답 사용 (`streamGenerateContent` 엔드포인트)
- AbortController로 중복 요청 취소
- 지수 백오프 재시도 (1s → 2s → 4s)

### 6.4 CSS 성능

**현재 상태**:
- 1,617줄 단일 CSS 파일 → 적절한 크기
- CSS 변수 활용한 테마 시스템 → 효율적
- `transition: all` 사용 부분 → 불필요한 속성까지 트랜지션

**참고**: CSS 크기는 현재 수준에서 성능 문제 없음.

### 6.5 localStorage 5MB 대응 전략

**현재 대응**:
- `getStorageUsage()` — 80% 경고 (storage.js:6)
- `autoCleanup()` — 50개 초과 시 오래된 회의 삭제 (storage.js:48-55)
- `QuotaExceededError` catch → 자동 정리 후 재시도 (storage.js:34-43)

**한계**:
- 단일 회의가 5MB 초과 가능 (3시간 회의, 분석 히스토리 20+)
- 자동 삭제가 사용자 동의 없이 진행

**권장 대응**:
1. **단기**: 회의별 개별 키 저장 (`meeting-{id}` 패턴)
2. **중기**: IndexedDB 마이그레이션 (50MB+ 저장 가능)
3. **장기**: 서버 사이드 저장 + 로컬 캐시

---

## 7. 리팩토링 로드맵

### 7.1 단기 (1-2주) — 보안 및 안정성

**목표**: P0 보안 취약점 해결, 기본 안정성 확보

1. **XSS 수정** (1일)
   - `ui.js`의 모든 `innerHTML` 사용처에 `escapeHtml()` 적용
   - 영향 범위: `renderHighlights`, `renderAnalysisHistory`, `renderMeetingViewer`, `renderViewerAnalysis`, `renderHistoryGrid`
   - chat.js의 `renderMarkdown()`은 이미 이스케이프 적용 → 유지

2. **Path Traversal 수정** (30분)
   - `server.js`에 경로 검증 로직 추가

3. **API 키 프록시** (2-3일)
   - `server.js`에 `/api/gemini` 프록시 엔드포인트 추가
   - 환경 변수로 API 키 관리 (`process.env.GEMINI_API_KEY`)
   - 클라이언트 코드에서 프록시 경유하도록 수정

4. **dead code 제거** (30분)
   - `app.js:629`, `settings.js:407`의 `require()` 호출 제거

5. **이벤트 리스너 정리** (1일)
   - `showWelcomeModal()`의 ESC 핸들러가 `closeWelcomeModal` 시 제거되지 않는 케이스 수정
   - `stt.js` 무한 재시작 방지: 최대 재시작 횟수 추가

### 7.2 중기 (3-6주) — 아키텍처 개선

**목표**: 확장성, 유지보수성 향상

1. **State 관리 개선** (3일)
   - `state` 객체를 Proxy 또는 getter/setter로 래핑
   - 변경 추적 및 불변성 강화
   ```javascript
   // Before
   export const state = { ... };
   // After
   const _state = { ... };
   export const state = new Proxy(_state, { set: (t, k, v) => { t[k] = v; emit('state:change', { key: k }); return true; } });
   ```

2. **Storage 레이어 리팩토링** (3일)
   - IndexedDB 기반 스토리지 어댑터
   - 메모리 캐시 레이어 추가
   - 회의별 개별 저장

3. **Gemini API 모듈 통합** (1일)
   - `ai.js`와 `chat.js`의 공통 코드를 `gemini-client.js`로 추출
   - `getGeminiUrl`, API 호출, 응답 파싱 공통화

4. **마크다운 렌더러 교체** (1일)
   - `chat.js`의 커스텀 `renderMarkdown()`을 `marked` + DOMPurify로 교체
   - 번들 사이즈 vs 안전성 트레이드오프 → DOMPurify 필수

5. **UI 성능 최적화** (3일)
   - 트랜스크립트 가상 스크롤링
   - scroll 이벤트 쓰로틀링
   - DOM 업데이트 배칭

6. **에러 핸들링 통합** (2일)
   - 전역 에러 바운더리 (`window.onerror`, `unhandledrejection`)
   - 구조화된 에러 로깅
   - 사용자 친화적 에러 메시지

### 7.3 장기 (2-3개월) — 아키텍처 전환

**목표**: 프로덕션 레디 아키텍처

1. **TypeScript 마이그레이션** (섹션 9 참조)
2. **번들러 도입** (Vite)
   - 코드 스플리팅
   - Tree shaking
   - 환경 변수 관리
3. **서버 사이드 기능 확장**
   - API 키 관리
   - 회의 데이터 서버 저장
   - 사용자 인증
4. **PWA 지원**
   - Service Worker
   - 오프라인 지원
   - 푸시 알림

---

## 8. 테스트 및 자동화 파이프라인 설계

### 8.1 테스트 전략

현재 테스트가 전무하므로 단계적 도입이 필요하다.

#### Phase 1: 단위 테스트 (Vitest)

**우선 대상** (순수 함수, 부작용 없음):
```
ai.js      → buildTranscriptText(), parseGeminiResponse()
i18n.js    → t(), detectLanguage(), setLanguage()
storage.js → loadAll(), saveMeeting(), getStorageUsage()
ui.js      → escapeHtml(), applyTypoCorrections(), formatTime()
meeting-prep.js → getChosung(), matchChosung(), parseTime()
```

**예상 커버리지 목표**: 핵심 로직 80%+

**테스트 예시**:
```javascript
// ai.test.js
import { describe, it, expect } from 'vitest';

describe('parseGeminiResponse', () => {
  it('parses valid JSON', () => {
    const result = parseGeminiResponse('{"summary":"test","context":""}');
    expect(result.summary).toBe('test');
  });

  it('extracts JSON from markdown fence', () => {
    const result = parseGeminiResponse('```json\n{"summary":"fenced"}\n```');
    expect(result.summary).toBe('fenced');
  });

  it('falls back on invalid JSON', () => {
    const result = parseGeminiResponse('Just plain text');
    expect(result.summary).toBe('Just plain text');
  });
});
```

#### Phase 2: 통합 테스트

**대상**: 모듈 간 상호작용
- Pub/Sub 이벤트 흐름 (emit → handler → state 변경)
- Storage CRUD (localStorage 모킹)
- STT → Transcript → Analysis 파이프라인

#### Phase 3: E2E 테스트 (Playwright)

**핵심 시나리오**:
1. 앱 로드 → Welcome 모달 표시
2. Quick Start → 녹음 시작 (Web Speech API 모킹)
3. Demo 데이터 로드 → 분석 실행 → 결과 표시
4. 설정 변경 → 저장 → 새로고침 후 유지
5. 회의 종료 → 내보내기 → 히스토리 확인

### 8.2 CI/CD 파이프라인 설계

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx eslint . --ext .js
      - run: npx stylelint "*.css"

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx vitest run --coverage
      - uses: codecov/codecov-action@v4

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      - run: npx eslint-plugin-security .

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test

  deploy:
    needs: [lint, test, security, e2e]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 8.3 필요한 개발 도구 추가

```json
// package.json (확장)
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "playwright": "^1.45.0",
    "eslint": "^9.0.0",
    "eslint-plugin-security": "^3.0.0",
    "stylelint": "^16.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "lint": "eslint . && stylelint '*.css'",
    "prepare": "husky"
  }
}
```

---

## 9. TypeScript 마이그레이션 계획

### 9.1 마이그레이션 전략: Incremental (점진적)

JavaScript와 TypeScript 공존 방식으로 진행. `allowJs: true` 설정.

### 9.2 단계별 계획

#### Phase 0: 인프라 설정 (1일)

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "allowJs": true,
    "checkJs": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "esModuleInterop": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"]
}
```

- Vite + `vite-plugin-checker` 도입
- `src/` 디렉토리로 소스 이동

#### Phase 1: 타입 정의 (2-3일)

독립 모듈부터 `.ts` 변환:

```typescript
// types.ts
export interface TranscriptLine {
  id: string;
  text: string;
  timestamp: number;
  bookmarked: boolean;
}

export interface Memo {
  id: string;
  text: string;
  timestamp: number;
}

export interface AnalysisResult {
  summary: string;
  context: string;
  openQuestions: string[];
  actionItems: string[];
  suggestions: string[];
  timestamp: number;
  transcriptLength?: number;
}

export interface MeetingData {
  id: string;
  title: string;
  startTime: number;
  duration: string;
  preset: string;
  location: string;
  meetingContext: string;
  transcript: TranscriptLine[];
  memos: Memo[];
  analysisHistory: AnalysisResult[];
  chatHistory: ChatMessage[];
  userInsights: string[];
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface AppSettings {
  geminiKey: string;
  geminiModel: string;
  chatModel: string;
  language: string;
  autoAnalysis: boolean;
  analysisInterval: number;
  tokenStrategy: 'smart' | 'recent' | 'full';
  recentMinutes: number;
  meetingPreset: string;
  meetingContext: string;
  customPrompt: string;
  chatSystemPrompt: string;
  slackWebhook: string;
  theme: 'light' | 'dark';
  uiLanguage: 'auto' | 'en' | 'ko';
  aiLanguage: 'auto' | 'en' | 'ko';
  customPresets: Record<string, string>;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
}

export interface AppState {
  isRecording: boolean;
  meetingStartTime: number | null;
  meetingId: string | null;
  meetingLocation: string;
  transcript: TranscriptLine[];
  memos: Memo[];
  analysisHistory: AnalysisResult[];
  settings: AppSettings;
  currentAnalysis: AnalysisResult | null;
  chatHistory: ChatMessage[];
  userInsights: string[];
  tags: string[];
  meetingEnded: boolean;
}
```

#### Phase 2: Leaf 모듈 변환 (3-5일)

변환 순서 (의존성 적은 것부터):
1. `i18n.ts` ← 외부 의존성 없음
2. `storage.ts` ← 외부 의존성 없음
3. `stt.ts` ← i18n만 의존
4. `ai.ts` ← i18n만 의존

#### Phase 3: 코어 모듈 변환 (5-7일)

5. `chat.ts` ← app, i18n 의존
6. `meeting-prep.ts` ← app, chat, storage, i18n 의존
7. `ui.ts` ← app, i18n, storage 의존
8. `settings.ts` ← app, storage, ai, i18n 의존
9. `app.ts` ← 모든 모듈 의존 (최후에 변환)

#### Phase 4: Strict 모드 강화 (2-3일)

- `strict: true` 하위 옵션 모두 활성화
- `any` 타입 제거
- null 안전성 검증
- 커버리지 100% 달성

### 9.3 주요 타입 안전성 개선 포인트

| 현재 코드 | 문제 | TS 해결 |
|---|---|---|
| `state.settings.geminiKey` | 항상 string인지 불확실 | `AppSettings` 인터페이스로 보장 |
| `analysis[key]` | any 타입 | `keyof AnalysisResult`로 타입 안전 |
| `localStorage.getItem()` | null 가능 | strictNullChecks로 강제 핸들링 |
| `e.target.value` | EventTarget에 value 없음 | `(e.target as HTMLInputElement).value` |
| `$('#foo')` | null 가능 | 반환 타입 `Element | null` 강제 |

---

## 10. 결론 및 권고사항

### 종합 평가

Meeting AI는 **MVP 수준에서 매우 잘 구현된 프로젝트**이다. 모듈 분리, Pub/Sub 아키텍처, i18n, 반응형 UI, 다양한 내보내기 옵션 등 기능적 완성도가 높다. 그러나 **보안**과 **데이터 안정성** 측면에서 프로덕션 배포 전 반드시 해결해야 할 P0 이슈들이 존재한다.

### Top 5 즉시 실행 권고사항

| 순위 | 항목 | 예상 소요 | ROI |
|---|---|---|---|
| 1 | **XSS 수정** — ui.js의 innerHTML 취약점 패치 | 2-4시간 | 최고 |
| 2 | **API 키 프록시** — server.js에 Gemini 프록시 추가 | 1일 | 최고 |
| 3 | **Path Traversal 수정** — server.js 경로 검증 | 30분 | 최고 |
| 4 | **Storage 캐싱** — loadAll() 결과 메모리 캐시 | 2시간 | 높음 |
| 5 | **기본 테스트 추가** — 핵심 유틸 함수 단위 테스트 | 1일 | 높음 |

### 코드 품질 스코어카드

| 항목 | 점수 (10점) | 비고 |
|---|---|---|
| 아키텍처 | 7/10 | 모듈 분리 양호, 순환 의존성 존재 |
| 코드 가독성 | 8/10 | 일관된 네이밍, 적절한 주석 |
| 보안 | 3/10 | XSS, API 키 노출, Path Traversal |
| 성능 | 6/10 | 소규모에서 문제 없으나 스케일 한계 |
| 테스트 | 0/10 | 테스트 전무 |
| 에러 핸들링 | 5/10 | try-catch 있으나 silent catch 다수 |
| 접근성 | 6/10 | aria-label, focus-visible 있으나 불완전 |
| 유지보수성 | 7/10 | 모듈화 양호, TypeScript 미적용 |
| **종합** | **5.3/10** | MVP → Production 전환 필요 |

---

*본 보고서는 정적 코드 분석 기반으로 작성되었으며, 런타임 프로파일링/침투 테스트는 포함되지 않았습니다.*
