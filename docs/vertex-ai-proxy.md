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
| `api/gemini.js` | Vercel serverless 프록시. 요청을 Gemini API로 전달 |
| `gemini-api.js` | 클라이언트. `callGemini(model, body)` 함수 제공 |
| `ai.js` | 분석/태그/제목/오타교정 — `callGemini()` 사용 |
| `chat.js` | AI 채팅 — `callGemini()` 사용 |
| `app.js` | 앱 초기화 시 `checkProxyAvailable()` 호출 |

## 환경변수 (Vercel)

| 이름 | 설명 |
|------|------|
| `GEMINI_API_KEY` | Google AI Studio에서 발급한 Gemini API 키 |

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
