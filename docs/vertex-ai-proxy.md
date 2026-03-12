# Vertex AI 프록시 구조

## 개요
GenAI App Builder 트라이얼 크레딧(₩1,472,045 / ~$1,000)을 활용하기 위해,
Gemini API 호출을 Vertex AI 엔드포인트(`aiplatform.googleapis.com`)를 통해 라우팅한다.

기존 AI Studio 직접 호출도 유지하여, API 키가 있으면 AI Studio, 없으면 Vertex AI 프록시를 사용한다.

## 아키텍처

```
[브라우저]
   │
   ├─ API 키 있음 → generativelanguage.googleapis.com (AI Studio 직접)
   │
   └─ API 키 없음 → /api/gemini (Vercel Serverless)
                        │
                        └→ aiplatform.googleapis.com (Vertex AI)
                           (VERTEX_API_KEY로 인증, 크레딧 차감)
```

## 파일 구조

| 파일 | 역할 |
|------|------|
| `api/gemini.js` | Vercel serverless 프록시. 요청을 Vertex AI로 전달 |
| `gemini-api.js` | 클라이언트 라우팅. `callGemini(model, body, apiKey)` 함수 제공 |
| `ai.js` | 분석/태그/제목/오타교정 — `callGemini()` 사용 |
| `chat.js` | AI 채팅 — `callGemini()` 사용 |
| `app.js` | 앱 초기화 시 `checkProxyAvailable()` 호출, API 키 가드 업데이트 |

## 환경변수 (Vercel)

| 이름 | 값 | 설명 |
|------|-----|------|
| `VERTEX_API_KEY` | GCP API 키 | GCP Console → API 및 서비스 → 사용자 인증 정보에서 생성 |

## 크레딧 적용 조건
- **반드시 `aiplatform.googleapis.com` 엔드포인트를 통해 호출해야 크레딧 차감됨**
- AI Studio(`generativelanguage.googleapis.com`) 호출은 크레딧 미적용
- 적용 가능 모델: Gemini 2.5 Flash, Flash Lite, Pro 등
- SKU 목록: https://cloud.google.com/skus/sku-groups/vertex-genai-offer-2025

## 보안
- API 키는 서버(Vercel 환경변수)에만 저장, 브라우저에 노출되지 않음
- 프록시에서 모델 화이트리스트 검증 (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`)
- Origin 체크 (`meeting-ai-seven.vercel.app`, `localhost`)

## AI Studio vs Vertex AI 차이점

| 항목 | AI Studio | Vertex AI |
|------|-----------|-----------|
| 엔드포인트 | `generativelanguage.googleapis.com` | `aiplatform.googleapis.com` |
| 인증 | API 키 (쿼리 파라미터) | API 키 또는 서비스 계정 |
| request/response body | 동일 | 동일 |
| `role` 필드 | 선택 | **필수** (`user` 또는 `model`) |
| 크레딧 적용 | X | O |

## 데이터 프라이버시
- **Vertex AI**: 고객 데이터를 모델 학습에 사용하지 않음 (기본 정책)
- AI Studio 무료 티어는 프롬프트가 학습에 사용될 수 있음
- Vertex AI 데이터 보존: 인메모리만 (24시간 TTL, 디스크 저장 없음)
- 출처: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention

### meeting-ai 앱의 프라이버시 구조
1. **회의록** → 브라우저 localStorage (서버 전송 없음)
2. **AI 분석** → Vertex AI 경유 (모델 학습에 사용되지 않음, 24시간 후 삭제)
3. **결론**: 회의 데이터가 어디에도 영구 저장되거나 학습에 사용되지 않음

## 크레딧으로 가능/불가능한 것

| 가능 (크레딧 적용) | 불가능 (크레딧 미적용) |
|---|---|
| Gemini에 이미지/동영상 넣고 **분석** | Imagen으로 이미지 **생성** |
| 텍스트 분석, 채팅, 코드 생성 | Veo로 영상 **생성** |
| Embeddings, Prompt Caching | |

> "이미지, 동영상 입출력 포함"은 Gemini의 멀티모달 **분석** 기능을 의미.
> 별도 생성 모델(Imagen, Veo)은 이 크레딧 SKU 목록에 포함되지 않음.

## 트러블슈팅

### "VERTEX_API_KEY not configured"
- Vercel 환경변수 이름이 `VERTEX_API_KEY` (대문자) 인지 확인
- 환경변수 추가 후 **Redeploy** 필요

### "Please use a valid role: user, model"
- Vertex AI는 contents에 `role` 필드 필수
- `gemini-api.js`의 `callGemini()`에서 자동으로 `role: 'user'` 추가 처리됨

### 크레딧이 차감되지 않는 경우
- AI Studio로 호출되고 있을 수 있음 (사용자가 API 키를 입력한 경우)
- 크레딧 확인: GCP Console → 결제 → 크레딧

## 참고 링크
- [Vertex AI Gemini API 공식 문서](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference)
- [Vertex AI 가격](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [적용 가능 SKU 목록](https://cloud.google.com/skus/sku-groups/vertex-genai-offer-2025)
