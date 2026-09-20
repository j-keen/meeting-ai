# Meeting AI

브라우저에서 바로 동작하는 회의 녹음/전사/AI 분석 SPA. 순수 ES 모듈(빌드 도구 없음) 프런트엔드 + Vercel 서버리스 함수(`api/`)로 구성된다. 오디오 녹음, Deepgram STT(실시간/사전 녹음), Gemini 기반 회의 분석·채팅, Supabase 동기화, 익명 사용 애널리틱스를 제공한다.

## 설치

```
npm install
```

## 환경변수

프로젝트 루트에 `.env`(로컬 전용, git에 커밋하지 않음) 파일을 만들고 다음 값을 채운다. 자세한 설명은 [`docs/vertex-ai-proxy.md`](docs/vertex-ai-proxy.md) 참고.

| 이름 | 설명 |
|------|------|
| `GEMINI_API_KEY` | Gemini API 키 — Google AI Studio 키(`AIza…`) 또는 Google Cloud API 키(`AQ.…`); 프로젝트에 Generative Language API가 켜져 있어야 함 (`api/gemini.js`) |
| `OPENAI_API_KEY` | OpenAI 키 — GPT 프록시(`api/openai.js`)와 고정확도 클라우드 STT 임시 토큰(`api/realtime-token.js`)에 사용. 없으면 앱 설정의 개인 OpenAI 키로 직접 호출 |
| `DEEPGRAM_API_KEY` | Deepgram API 키 (`api/transcribe.js`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV — rate limit, 애널리틱스 저장용 (없으면 rate limit은 fail-open) |
| `ANALYTICS_SECRET` | 애널리틱스 조회 API/대시보드 인증 시크릿 |

## 로컬 개발

```
npm run dev
```

`dev-server.js`가 정적 파일과 `/api/*` 요청(실제 `api/` 핸들러로 위임)을 함께 서빙한다. 기본 포트는 3000이며 `PORT` 환경변수로 변경 가능하다.

## 테스트 / 린트

```
npm test
npm run lint
```

## 배포

Vercel에 연결된 저장소를 push하면 자동 배포된다. `vercel.json`에 `api/gemini.js`, `api/transcribe.js`의 `maxDuration`(60초)과 정적 파일 rewrite 규칙이 정의되어 있다. Vercel 프로젝트 설정의 Environment Variables에 위 환경변수를 등록해야 한다.
