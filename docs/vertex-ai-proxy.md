# Gemini API 프록시 구조

## 개요
Gemini API 호출을 Vercel Serverless 프록시(`/api/gemini`)를 통해 라우팅한다.
서버 측 API 키를 사용하여 브라우저에 키가 노출되지 않도록 한다.

## 아키텍처

```
[브라우저]
   │
   └─ /api/gemini (Vercel Serverless)
        │
        └→ generativelanguage.googleapis.com (Gemini API)
           (GEMINI_API_KEY로 인증)
```

## 파일 구조

| 파일 | 역할 |
|------|------|
| `api/gemini.js` | Vercel serverless 프록시. 요청을 Gemini API로 전달 (스트리밍 지원) |
| `api/transcribe.js` | Deepgram 사전 녹음 전사 프록시 |
| `api/analytics.js` | 익명 사용 이벤트 수집 (Vercel KV) |
| `api/analytics-dashboard.js` | 애널리틱스 JSON/CSV API (secret 인증) |
| `api/dashboard.js` | 애널리틱스 HTML 대시보드 (secret 인증) |
| `gemini-api.js` | 클라이언트. `callGemini(model, body)` 함수 제공 |
| `ai.js` | 분석/태그/제목/오타교정 — `callGemini()` 사용 |
| `chat.js` | AI 채팅 — `callGemini()` 사용 |
| `app.js` | 앱 초기화 시 `checkProxyAvailable()` 호출 |
| `dev-server.js` | 로컬 개발 서버. `/api/*` 요청을 위 Vercel 핸들러로 그대로 위임 |

## 환경변수

| 이름 | 설명 | 필요한 곳 |
|------|------|----------|
| `GEMINI_API_KEY` | Google AI Studio 키(`AIza…`) 또는 Vertex AI Express 키(`AQ.…`); 접두사로 generativelanguage / aiplatform 엔드포인트 자동 선택 | `api/gemini.js` |
| `DEEPGRAM_API_KEY` | Deepgram API 키 (사전 녹음 전사) | `api/transcribe.js` |
| `KV_REST_API_URL` | Vercel KV(Upstash Redis) REST URL | rate limit, `api/analytics*.js`, `api/dashboard.js` |
| `KV_REST_API_TOKEN` | Vercel KV REST 토큰 | 위와 동일 |
| `ANALYTICS_SECRET` | 대시보드/애널리틱스 조회 API 인증용 시크릿 | `api/analytics-dashboard.js`, `api/dashboard.js` |

`KV_REST_API_URL`/`KV_REST_API_TOKEN`이 설정되지 않으면:
- `api/gemini.js`의 rate limit은 **fail-open**(요청을 무조건 허용)으로 동작한다 — 로컬 개발에서는 문제 없지만, 운영 환경에서 KV 설정을 빠뜨리면 rate limit이 전혀 적용되지 않는다는 뜻이다.
- `api/analytics.js`는 조용히 204를 반환하고 아무 것도 저장하지 않는다.
- `api/analytics-dashboard.js`, `api/dashboard.js`는 500 에러를 반환한다.

## 로컬 개발

```
npm run dev
```

`dev-server.js`는 정적 파일을 서빙하면서 `/api/*` 요청을 `api/` 아래의 실제 Vercel 핸들러로 그대로 위임한다(별도 로컬 구현 없음). `.env`, `.env.local`(있다면 `.env`보다 우선) 파일에서 위 환경변수를 읽는다.

## 보안
- API 키는 서버(Vercel 환경변수)에만 저장, 브라우저에 노출되지 않음
- 프록시에서 모델 화이트리스트 검증 (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`)
- Origin 체크 (`meeting-ai-seven.vercel.app`, `localhost`)

## 트러블슈팅

### "GEMINI_API_KEY not configured"
- Vercel 환경변수 이름이 `GEMINI_API_KEY` (대문자) 인지 확인
- 환경변수 추가 후 **Redeploy** 필요

### 429 Rate Limit
- API 키의 할당량 초과 — Google AI Studio 콘솔에서 확인
- 클라이언트에 지수 백오프 재시도 로직 내장 (최대 3회)
