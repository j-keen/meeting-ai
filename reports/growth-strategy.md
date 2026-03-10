# Meeting AI - Growth Hacking & Marketing Strategy Report

> 작성일: 2026-03-11 | 작성자: Growth Hacker Agent
> 프로젝트: Meeting AI (웹 기반 AI 회의 보조 도구)

---

## 1. Executive Summary

Meeting AI는 브라우저 기반 실시간 회의 녹취 + AI 분석 도구로, Gemini API를 활용한 자동 요약/액션 아이템 추출/AI 채팅 기능을 제공한다. 현재 **BYOK(Bring Your Own Key) 모델**로 서버 비용 없이 운영 가능하며, 한국어/영어 완전 지원이라는 차별점을 보유하고 있다.

### 핵심 기회
- **AI 회의 도구 시장**: 2025년 기준 CAGR 7.4%로 2033년 75.4억 달러 규모 예상
- **경쟁사 대비 강점**: 설치 불필요(웹 기반), 무료(BYOK), 한국어 특화, 프라이버시(로컬 스토리지)
- **경쟁사 대비 약점**: 브랜드 인지도 부재, 바이럴 메커니즘 미구축, Zoom/Teams 직접 연동 미지원

### 90일 목표
- **North Star Metric**: 주간 활성 회의 수 (Weekly Active Meetings)
- **Week 12 목표**: WAM 500+, 월 방문자 5,000+

---

## 2. 제품 그로스 진단

### 2.1 현재 온보딩 플로우 분석

```
방문 → Welcome Modal → [Quick Start / Meeting Prep / Search]
                            ↓
                     API 키 입력 (Settings)
                            ↓
                     첫 녹음 시작 (REC 버튼)
                            ↓
                     첫 AI 분석 (30초 자동)
                            ↓
                     내보내기/Slack 전송
```

**진단 결과:**

| 항목 | 현재 상태 | 등급 | 개선 필요 |
|------|----------|------|----------|
| Time-to-Value | API 키 입력 필요 → 높은 진입장벽 | C | API 키 없이 데모 체험 가능하게 |
| 온보딩 가이드 | Welcome Modal 3가지 선택지 | B | 첫 방문자 투어 추가 |
| 바이럴 요소 | 없음 (Export에 브랜딩 없음) | F | 워터마크, 공유 URL 추가 |
| 리텐션 트리거 | 자동 저장, 회의 히스토리 | B- | 이메일 리마인더, 위클리 리포트 |
| 공유 기능 | Slack Webhook, Email | C+ | 공유 링크, 팀 협업 기능 |

### 2.2 핵심 마찰 포인트 (Friction Points)

1. **API 키 벽**: Gemini API 키 없으면 AI 기능 전체 사용 불가 → 첫 경험이 빈 화면
2. **가치 인지 지연**: 데모 버튼은 있으나 눈에 띄지 않음. 방문자가 제품 가치를 느끼기 전에 이탈
3. **공유 불가**: 회의 결과를 팀원과 공유할 URL 생성 기능 없음
4. **재방문 동기 부족**: 푸시 알림, 이메일 리마인더 없음

### 2.3 리텐션 트리거 식별

- **기존**: 회의 히스토리 자동 저장 (localStorage), 이전 회의 컨텍스트 연결
- **잠재적**: 주간 회의 리포트 생성, 액션 아이템 리마인더, 회의 패턴 분석

---

## 3. North Star Metric 정의

### Primary Metric: **Weekly Active Meetings (WAM)**
> "지난 7일간 AI 분석이 1회 이상 실행된 회의 수"

**선정 근거:**
- 단순 방문이 아닌 **실제 가치 경험**을 측정
- 녹음 → AI 분석까지 완료 = 핵심 가치 전달 완료
- 반복 사용 (주간 회의 등)과 직결

### Supporting Metrics

| 메트릭 | 설명 | 목표 (Week 12) |
|--------|------|---------------|
| 신규 방문자 수 | 주간 유니크 방문자 | 1,500+ |
| API 키 설정률 | 방문자 중 API 키 입력 비율 | 25%+ |
| 첫 녹음 전환율 | API 키 입력 후 첫 녹음 | 70%+ |
| 첫 분석 전환율 | 첫 녹음 후 AI 분석 실행 | 90%+ |
| 7일 리텐션 | 첫 사용 후 7일 내 재방문 | 30%+ |
| 내보내기/공유율 | 회의당 내보내기 실행 비율 | 20%+ |

---

## 4. PLG 퍼널 설계

### 4.1 퍼널 단계별 최적화

```
[인지] → [방문] → [데모 체험] → [API 키 입력] → [첫 녹음] → [첫 AI 분석] → [내보내기/공유] → [반복 사용] → [바이럴 공유]
  SEO     랜딩     자동 데모      온보딩 가이드    Quick Start   자동 30초     CTA 강화        히스토리       워터마크+링크
```

### 4.2 단계별 전환율 최적화 방안

#### Stage 1: 방문 → 데모 체험 (목표: 60%)
**현재 문제**: 방문자가 API 키 없이는 아무것도 할 수 없음
**해결책**:
- 자동 데모 실행: 첫 방문 시 데모 데이터 + 시뮬레이션 분석 자동 재생
- **코드 수정**: `app.js` > `showWelcomeModal()` 함수에서 "Try Demo" 버튼을 최상단 primary로 배치

```javascript
// app.js:851-887 (showWelcomeModal 함수)
// welcomeQuickStart 대신 데모를 primary CTA로 변경
// welcomeModal에 "See it in action" 데모 자동 재생 추가
```

#### Stage 2: 데모 체험 → API 키 입력 (목표: 40%)
**해결책**:
- 데모 완료 후 "자신의 회의에 사용하려면 API 키를 입력하세요" CTA
- API 키 발급 가이드 링크 추가 (Google AI Studio 직접 링크)
- **코드 수정**: `settings.js` > Gemini API Key 입력 필드 옆에 "무료 API 키 받기" 링크 추가

#### Stage 3: API 키 입력 → 첫 녹음 (목표: 70%)
**해결책**:
- API 키 입력 즉시 "지금 녹음 시작" CTA 표시
- Quick Start 프리셋 추천 (가장 많이 사용되는 "주간 회의" 디폴트)
- **코드 수정**: `settings.js` > `$('#inputGeminiKey')` change 이벤트에서 설정 패널 닫고 녹음 시작 유도

#### Stage 4: 첫 AI 분석 → 내보내기/공유 (목표: 30%)
**해결책**:
- 분석 완료 후 "이 결과를 팀에 공유하세요" CTA 자동 표시
- 원클릭 Slack 전송, 공유 URL 생성
- **코드 수정**: `ui.js` > `renderAnalysis()` 함수 내 분석 결과 하단에 공유 버튼 추가

#### Stage 5: 바이럴 공유 (신규 트리거)
**해결책**:
- Markdown 내보내기에 Meeting AI 브랜딩 추가
- 공유 가능한 URL 생성 (Base64 인코딩 요약 데이터)
- Slack 메시지에 "Powered by Meeting AI" 링크 삽입

---

## 5. 채널 매트릭스

| 채널 | 예상 CAC | 월간 볼륨 | 난이도 | 시작 시점 | 우선순위 |
|------|---------|----------|--------|----------|---------|
| SEO (블로그) | $0 | 1,000-5,000 | 중 | Week 1 | **P0** |
| Product Hunt | $0 | 500-3,000 (1회성) | 중 | Week 3 | **P0** |
| 디스콰이엇 | $0 | 200-500 | 하 | Week 2 | **P1** |
| 긱뉴스 | $0 | 300-800 | 하 | Week 2 | **P1** |
| Reddit (r/productivity) | $0 | 200-1,000 | 중 | Week 4 | **P1** |
| Hacker News | $0 | 500-5,000 | 상 | Week 5 | **P2** |
| Twitter/X | $0 | 100-500/월 | 중 | Week 1 | **P1** |
| LinkedIn | $0 | 100-300/월 | 중 | Week 2 | **P1** |
| 네이버 블로그 | $0 | 200-1,000/월 | 하 | Week 1 | **P0** |
| AI 디렉토리 | $0-50 | 50-200/월 | 하 | Week 1 | **P1** |
| Chrome Web Store | $5 (등록비) | 100-500/월 | 상 | Week 8 | **P2** |

---

## 6. SEO 키워드 전략

### 6.1 핵심 키워드 매트릭스

#### 한국어 키워드 (우선순위 높음 - 경쟁 낮음)

| 키워드 | 예상 검색량 | 경쟁 | 의도 | 콘텐츠 타입 |
|--------|-----------|------|------|-----------|
| AI 회의록 | 중 | 중 | 정보/거래 | 랜딩 페이지 |
| 회의록 자동화 | 중 | 낮음 | 거래 | 제품 페이지 |
| AI 회의 요약 | 중 | 낮음 | 정보/거래 | 블로그 + 랜딩 |
| 무료 회의록 앱 | 높음 | 중 | 거래 | 비교 글 |
| 회의 녹음 텍스트 변환 | 낮음 | 낮음 | 정보 | 튜토리얼 |
| 실시간 회의 기록 | 낮음 | 낮음 | 거래 | 제품 페이지 |
| Gemini API 회의록 | 매우 낮음 | 매우 낮음 | 정보 | 기술 블로그 |
| 회의 액션 아이템 추출 | 낮음 | 매우 낮음 | 정보/거래 | 블로그 |
| STT 회의록 작성 | 낮음 | 낮음 | 정보 | 튜토리얼 |
| Otter.ai 대안 한국어 | 낮음 | 매우 낮음 | 거래 | 비교 글 |

#### 영어 키워드 (장기 전략)

| 키워드 | 예상 검색량 | 경쟁 | 의도 | 콘텐츠 타입 |
|--------|-----------|------|------|-----------|
| free AI meeting notes | 높음 | 높음 | 거래 | 랜딩 페이지 |
| AI meeting assistant open source | 중 | 중 | 거래 | GitHub + 블로그 |
| browser meeting transcription | 낮음 | 낮음 | 거래 | 제품 페이지 |
| Otter.ai alternative free | 중 | 중 | 거래 | 비교 글 |
| Fireflies.ai alternative | 중 | 중 | 거래 | 비교 글 |
| AI meeting notes no installation | 낮음 | 매우 낮음 | 거래 | 블로그 |
| real-time meeting analysis AI | 낮음 | 낮음 | 정보 | 기술 블로그 |
| BYOK AI meeting tool | 매우 낮음 | 매우 낮음 | 정보 | 블로그 |
| meeting action items AI | 중 | 중 | 정보 | 블로그 |

### 6.2 SEO 콘텐츠 전략

#### 블로그 콘텐츠 캘린더 (첫 12주)

**Week 1-4: 기초 콘텐츠**
1. "AI 회의록 자동화 완벽 가이드 (2026년 최신)" - 필러 콘텐츠
2. "무료 AI 회의록 앱 비교: Meeting AI vs Clova Note vs Callabo" - 비교 글
3. "Gemini API로 나만의 회의 비서 만들기" - 기술 블로그 (개발자 타겟)
4. "회의 시간 50% 줄이는 AI 활용법" - 생산성 팁

**Week 5-8: 롱테일 공략**
5. "Otter.ai 한국어 안 되는 이유와 대안" - 경쟁사 비교
6. "팀 주간 회의 효율적으로 하는 법 + AI 템플릿" - 유즈 케이스
7. "1:1 미팅 기록 자동화: 매니저를 위한 AI 도구" - 유즈 케이스
8. "브레인스토밍 회의 기록 및 아이디어 정리 자동화" - 유즈 케이스

**Week 9-12: 권위 구축**
9. "AI 회의 도구 시장 분석 2026" - 인더스트리 리포트
10. "Meeting AI 오픈소스로 회의 문화 혁신하기" - 사례 연구
11. "원격 근무 팀의 필수 회의 도구 10선" - 리스트 글
12. "회의록 AI 분석으로 조직 의사결정 개선하기" - 사고 리더십

### 6.3 랜딩 페이지 최적화

**필수 메타 태그 추가** (`index.html`):
```html
<!-- index.html <head> 섹션에 추가 필요 -->
<meta name="description" content="Free AI meeting assistant. Real-time transcription, AI-powered summary, action items, and smart analysis. No installation required. Korean & English supported.">
<meta name="keywords" content="AI meeting notes, 회의록 자동화, meeting transcription, AI 회의 요약">
<meta property="og:title" content="Meeting AI - Free AI Meeting Assistant">
<meta property="og:description" content="Transform your meetings with real-time AI transcription and analysis. No sign-up, no installation.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

**구조화된 데이터 (JSON-LD)** 추가:
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Meeting AI",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web Browser",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "AI-powered meeting assistant with real-time transcription and analysis"
}
```

---

## 7. 바이럴 루프 설계도

### 7.1 바이럴 루프 #1: 내보내기 워터마크

**메커니즘**: 모든 Markdown/JSON 내보내기에 Meeting AI 브랜딩 추가
**예상 K-factor**: 0.05-0.1

**코드 수정 포인트**:

**파일: `app.js` > `generateMarkdownFull()` (라인 407-442)**
```javascript
// 현재: md 끝에 아무 브랜딩 없음
// 변경: 푸터에 브랜딩 추가
// generateMarkdownFull() 함수 마지막 return 전에 추가:
md += '\n---\n';
md += '*Generated by [Meeting AI](https://your-domain.com) - Free AI Meeting Assistant*\n';
```

**파일: `app.js` > `generateMarkdownSummary()` (라인 444-466)**
```javascript
// 동일하게 푸터 브랜딩 추가
md += '\n---\n';
md += '*Generated by [Meeting AI](https://your-domain.com) - Free AI Meeting Assistant*\n';
```

**파일: `app.js` > `generateMarkdownHighlights()` (라인 468-481)**
```javascript
// 동일하게 푸터 브랜딩 추가
md += '\n---\n';
md += '*Generated by [Meeting AI](https://your-domain.com) - Free AI Meeting Assistant*\n';
```

### 7.2 바이럴 루프 #2: Slack 메시지 브랜딩

**메커니즘**: Slack 전송 시 "Powered by Meeting AI" 링크 자동 삽입
**예상 K-factor**: 0.1-0.2 (Slack 팀 채널 효과)

**코드 수정 포인트**:

**파일: `app.js` > `sendToSlack()` (라인 516-529)**
```javascript
// 현재: text만 전송
// 변경: 브랜딩 푸터 추가

async function sendToSlack(text) {
  const webhook = state.settings.slackWebhook;
  if (!webhook) { showToast(t('toast.slack_no_url'), 'warning'); return; }

  // 브랜딩 추가
  const brandedText = text + '\n\n---\n_Powered by <https://your-domain.com|Meeting AI> - Free AI Meeting Assistant_';

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: brandedText }),
    });
    showToast(t('toast.slack_sent'), 'success');
  } catch (err) {
    showToast(t('toast.slack_fail') + err.message, 'error');
  }
}
```

### 7.3 바이럴 루프 #3: 공유 URL 생성

**메커니즘**: 회의 요약을 공유 가능한 URL로 생성 (데이터를 URL hash에 인코딩)
**예상 K-factor**: 0.15-0.3

**구현 방안**: 새 Export 옵션 "Share Link" 추가

**코드 수정 포인트**:

**파일: `index.html` > Export Modal (라인 370-386)**
```html
<!-- 기존 export 버튼들 아래에 추가 -->
<hr>
<button class="btn btn-block export-btn" data-format="share-link">
  Share Link - Generate shareable URL
</button>
```

**파일: `app.js` > `handleExport()` (라인 536-547)**
```javascript
// 새 케이스 추가:
case 'share-link': generateShareLink(); break;

// 새 함수 추가:
function generateShareLink() {
  const summary = state.currentAnalysis;
  if (!summary) { showToast('No analysis to share', 'warning'); return; }

  const shareData = {
    title: t('meeting_title', {
      date: new Date(state.meetingStartTime).toLocaleDateString(),
      time: new Date(state.meetingStartTime).toLocaleTimeString()
    }),
    summary: summary.summary,
    actionItems: summary.actionItems,
    openQuestions: summary.openQuestions,
    duration: getElapsedTimeStr(),
    generatedBy: 'Meeting AI'
  };

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
  const shareUrl = `${window.location.origin}${window.location.pathname}#share=${encoded}`;

  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Share link copied!', 'success');
  });
}
```

### 7.4 바이럴 루프 #4: Email 시그니처 연동

**메커니즘**: 이메일 내보내기에 "이 회의록은 Meeting AI로 생성되었습니다" 추가

**코드 수정 포인트**:

**파일: `app.js` > `sendEmail()` (라인 531-534)**
```javascript
function sendEmail(subject, body) {
  const brandedBody = body + '\n\n---\nGenerated by Meeting AI (https://your-domain.com) - Free AI Meeting Assistant';
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(brandedBody)}`;
  window.open(mailto);
}
```

### 7.5 바이럴 플라이휠 다이어그램

```
사용자 A가 회의 녹음 & AI 분석
        ↓
요약을 Slack/Email로 공유 (브랜딩 포함)
        ↓
팀원 B, C가 "Meeting AI" 링크 클릭
        ↓
랜딩 페이지 → 데모 체험 → API 키 입력
        ↓
팀원 B, C가 자기 회의에서 사용
        ↓
다시 공유 → 새로운 사용자 유입
```

---

## 8. 커뮤니티 런칭 플레이북

### 8.1 Product Hunt 런칭 전략

**타이밍**: Week 3-4 (제품 개선 후)
**목표**: Top 5 Daily, 500+ upvotes

**사전 준비 (Week 1-2)**:
- [ ] Product Hunt 계정 생성 및 프로필 완성
- [ ] 커뮤니티 활동 시작 (다른 제품 리뷰/댓글)
- [ ] 티저 페이지 또는 "Coming Soon" 등록
- [ ] 제품 스크린샷 5장 이상 준비 (GIF 포함)
- [ ] 30초 데모 비디오 제작
- [ ] Early supporter 네트워크 구축 (100명+)

**런칭 에셋**:
- **Tagline**: "Free AI Meeting Assistant - No Sign-up, No Installation, BYOK"
- **First Comment** (제작자 글): 개발 배경, 기존 도구의 문제점, 차별점 설명

**핵심 메시지 프레임**:
1. "Otter.ai는 월 $20. 우리는 무료."
2. "설치 없이 브라우저에서 바로 회의 녹음 + AI 분석"
3. "API 키 하나로 시작. 데이터는 당신의 브라우저에만."
4. "한국어 완벽 지원하는 유일한 무료 AI 회의 도구"

**런칭 당일 체크리스트**:
- [ ] 00:01 PST (한국시간 17:01)에 런칭
- [ ] 소셜 미디어 동시 공지 (Twitter, LinkedIn, 네이버)
- [ ] 사전 연락한 서포터들에게 DM으로 알림
- [ ] 모든 댓글에 30분 내 답변
- [ ] 런칭 후 12시간 동안 실시간 모니터링

### 8.2 디스콰이엇 런칭

**타이밍**: Week 2 (Product Hunt 전)
**목표**: 주간 인기 프로젝트

**전략**:
- 프로젝트 등록 + 빌더 로그 시작
- "사이드 프로젝트로 AI 회의 비서 만들기" 스토리 중심
- 기술 스택 (Vanilla JS, Gemini API, Web Speech API) 설명
- 한국 개발자 커뮤니티 특성상 기술적 접근이 효과적

### 8.3 긱뉴스 (GeekNews)

**타이밍**: Week 2
**포맷**: Show GN (Show HN 스타일)

**제목 예시**: "Show GN: 브라우저만으로 실시간 회의 녹음 + AI 분석 (오픈소스)"
**핵심 어필 포인트**:
- 서버리스 아키텍처 (순수 클라이언트 사이드)
- BYOK 모델의 프라이버시 이점
- Vanilla JS (프레임워크 없음) 설계 철학
- Web Speech API 활용 사례

### 8.4 Hacker News

**타이밍**: Week 5-6
**포맷**: Show HN

**제목**: "Show HN: Meeting AI - Browser-based AI meeting assistant with BYOK model"
**핵심 메시지**:
- Zero server cost, all processing client-side
- Privacy-first: data never leaves the browser
- Uses Web Speech API + Gemini API
- Fully open-source, no vendor lock-in

### 8.5 Reddit

**대상 서브레딧**:
- r/productivity (3M+ members)
- r/SideProject
- r/webdev
- r/artificial
- r/remotework

**전략**: 직접 홍보가 아닌 "가치 제공" 게시물
- "I built a free AI meeting tool because Otter.ai was too expensive for my startup"
- "How I automated my weekly meeting notes with browser-based AI"

---

## 9. 90일 그로스 스프린트 계획

### Phase 1: Foundation (Week 1-4)

#### Week 1: 기반 구축
- [ ] 제품 개선: 자동 데모 모드 강화 (API 키 없이 체험)
- [ ] SEO: `index.html`에 메타 태그, OG 태그, JSON-LD 추가
- [ ] 바이럴: Export 브랜딩 워터마크 구현 (3개 마크다운 함수 수정)
- [ ] 바이럴: Slack 메시지 브랜딩 추가
- [ ] 콘텐츠: 블로그 #1 "AI 회의록 자동화 완벽 가이드" 작성
- [ ] 채널: 네이버 블로그 개설 및 첫 포스트
- [ ] 분석: Google Analytics 또는 간단한 분석 스크립트 삽입

#### Week 2: 커뮤니티 시드
- [ ] 디스콰이엇 프로젝트 등록 + 빌더 로그
- [ ] 긱뉴스 Show GN 게시
- [ ] Twitter/X 계정 개설, 첫 스레드 작성
- [ ] LinkedIn 프로필 업데이트 및 첫 포스트
- [ ] 콘텐츠: 블로그 #2 "무료 AI 회의록 앱 비교" 작성
- [ ] AI 디렉토리 등록 시작 (There's An AI For That, AI Tools Directory 등)

#### Week 3: Product Hunt 준비
- [ ] Product Hunt 티저 페이지 생성
- [ ] 데모 비디오 30초 + 스크린샷 5장 제작
- [ ] Early supporter 네트워크 구축 (50명+)
- [ ] 제품 개선: 공유 URL 생성 기능 구현
- [ ] 콘텐츠: 블로그 #3 "Gemini API로 회의 비서 만들기" (개발자 타겟)

#### Week 4: Product Hunt 런칭
- [ ] Product Hunt 런칭 실행
- [ ] 소셜 미디어 동시 공지
- [ ] 런칭 후 24시간 모니터링 + 댓글 응대
- [ ] 콘텐츠: 블로그 #4 "회의 시간 50% 줄이는 AI 활용법"

### Phase 2: Growth (Week 5-8)

#### Week 5-6: 채널 확대
- [ ] Hacker News Show HN 게시
- [ ] Reddit r/productivity, r/SideProject 게시
- [ ] 콘텐츠: 블로그 #5-6 (경쟁사 비교, 유즈 케이스)
- [ ] 이메일 내보내기 브랜딩 추가
- [ ] 사용자 피드백 수집 및 제품 개선
- [ ] 네이버 블로그 주 2회 포스팅

#### Week 7-8: 최적화
- [ ] 온보딩 플로우 A/B 테스트
- [ ] SEO 성과 분석 및 키워드 조정
- [ ] 콘텐츠: 블로그 #7-8 (유즈 케이스 심화)
- [ ] Chrome Web Store 확장 프로그램 개발 시작 (선택)
- [ ] 리텐션 개선: 주간 리포트 기능 설계

### Phase 3: Scale (Week 9-12)

#### Week 9-10: 파트너십 및 확장
- [ ] AI 디렉토리 추가 등록 (10개+)
- [ ] 콘텐츠: 블로그 #9-10 (인더스트리 리포트, 사례 연구)
- [ ] 게스트 포스트 or 콜라보 콘텐츠 2건
- [ ] GitHub 오픈소스 커뮤니티 활성화

#### Week 11-12: 정리 및 다음 분기 계획
- [ ] 콘텐츠: 블로그 #11-12
- [ ] 전체 퍼널 성과 분석
- [ ] 다음 분기 OKR 설정
- [ ] 유료 티어 설계 검토 (프리미엄 기능 기획)

---

## 10. 실험 백로그 (ICE 스코어 테이블)

| # | 실험명 | 가설 | Impact (1-10) | Confidence (1-10) | Ease (1-10) | ICE Score | 우선순위 |
|---|--------|------|:---:|:---:|:---:|:---:|:---:|
| 1 | Export 워터마크 추가 | Markdown 내보내기에 브랜딩 → 신규 유입 5% 증가 | 7 | 7 | 9 | **7.7** | P0 |
| 2 | Slack 메시지 브랜딩 | Slack 전송 시 링크 → 팀 단위 바이럴 | 8 | 6 | 9 | **7.7** | P0 |
| 3 | 자동 데모 강화 | 첫 방문 시 데모 자동 실행 → 데모 체험률 60%+ | 8 | 7 | 7 | **7.3** | P0 |
| 4 | SEO 메타 태그 추가 | 검색 노출 → 오가닉 트래픽 증가 | 7 | 8 | 9 | **8.0** | P0 |
| 5 | Product Hunt 런칭 | Top 5 진입 → 500+ 신규 사용자 | 9 | 5 | 6 | **6.7** | P0 |
| 6 | 공유 URL 생성 | 요약 공유 링크 → 바이럴 K-factor 0.15+ | 8 | 5 | 6 | **6.3** | P1 |
| 7 | API 키 발급 가이드 | 온보딩 마찰 감소 → API 키 설정률 +15% | 6 | 7 | 9 | **7.3** | P1 |
| 8 | 네이버 블로그 SEO | 한국어 검색 트래픽 확보 | 6 | 6 | 8 | **6.7** | P1 |
| 9 | 디스콰이엇/긱뉴스 런칭 | 한국 개발자/스타트업 커뮤니티 노출 | 6 | 6 | 8 | **6.7** | P1 |
| 10 | Email 브랜딩 추가 | 이메일 전달 시 브랜딩 노출 | 5 | 6 | 9 | **6.7** | P1 |
| 11 | Reddit 게시물 | r/productivity 등 커뮤니티 노출 | 7 | 4 | 7 | **6.0** | P1 |
| 12 | HN Show HN 게시 | 개발자/얼리어답터 커뮤니티 | 8 | 3 | 6 | **5.7** | P2 |
| 13 | 온보딩 투어 추가 | 첫 방문자 가이드 → 전환율 개선 | 6 | 5 | 5 | **5.3** | P2 |
| 14 | Chrome 확장 프로그램 | Chrome Web Store 노출 → 새 채널 | 7 | 4 | 3 | **4.7** | P2 |
| 15 | 주간 리포트 이메일 | 리텐션 개선 → 7일 리텐션 +10% | 7 | 5 | 4 | **5.3** | P2 |
| 16 | 다국어 지원 (일본어) | 일본 시장 진출 → TAM 확대 | 6 | 4 | 4 | **4.7** | P3 |

---

## 11. KPI 대시보드 설계

### 11.1 추적 메트릭 및 도구

현재 서버가 없으므로 클라이언트 사이드 분석을 구현해야 한다.

**Option A: 간단한 이벤트 트래킹 (권장)**

```javascript
// analytics.js - 간단한 이벤트 트래킹 모듈
// Google Analytics 4 또는 Plausible Analytics 연동

const EVENTS = {
  PAGE_VIEW: 'page_view',
  DEMO_START: 'demo_start',
  API_KEY_SET: 'api_key_set',
  RECORDING_START: 'recording_start',
  ANALYSIS_RUN: 'analysis_run',
  EXPORT_MD: 'export_markdown',
  EXPORT_SLACK: 'export_slack',
  EXPORT_EMAIL: 'export_email',
  SHARE_LINK: 'share_link_created',
  MEETING_END: 'meeting_end',
  RETURN_VISIT: 'return_visit',
};
```

### 11.2 대시보드 구성

| 섹션 | 메트릭 | 측정 방법 | 주기 |
|------|--------|----------|------|
| **Acquisition** | 총 방문자, 소스별 유입 | GA4 / Plausible | 일간 |
| **Activation** | 데모 체험률, API 키 설정률 | 커스텀 이벤트 | 일간 |
| **Engagement** | WAM, 세션당 분석 횟수 | 커스텀 이벤트 | 주간 |
| **Retention** | D1/D7/D30 리텐션 | 커스텀 이벤트 | 주간 |
| **Revenue** | N/A (현재 무료) | - | - |
| **Referral** | 공유 링크 클릭, Export 횟수 | 커스텀 이벤트 | 주간 |
| **SEO** | 키워드 순위, 오가닉 트래픽 | Google Search Console | 주간 |

### 11.3 주간 리뷰 템플릿

```markdown
## Weekly Growth Review - Week N

### Key Numbers
- WAM: ___  (vs 목표: ___)
- 신규 방문: ___
- API 키 설정률: ___%
- 7일 리텐션: ___%

### Top Channel Performance
1. ___: ___ visitors
2. ___: ___ visitors

### Experiments This Week
- [실험명]: [결과] → [의사결정]

### Next Week Priority
1. ___
2. ___
```

---

## 12. 결론 및 우선순위 권고

### 즉시 실행 (This Week)
1. **SEO 기초**: `index.html`에 메타 태그, OG 태그, JSON-LD 추가
2. **바이럴 워터마크**: `app.js`의 3개 Markdown 생성 함수에 브랜딩 추가 (30분 작업)
3. **Slack 브랜딩**: `app.js`의 `sendToSlack()` 함수에 브랜딩 추가 (15분 작업)
4. **이메일 브랜딩**: `app.js`의 `sendEmail()` 함수에 브랜딩 추가 (10분 작업)
5. **데모 강화**: 첫 방문 시 데모 데이터 자동 로드 검토

### 단기 (2주 내)
6. API 키 발급 가이드 페이지/링크 추가
7. 디스콰이엇 + 긱뉴스 런칭
8. 네이버 블로그 + 첫 콘텐츠 2개 발행
9. 분석 도구 연동 (GA4 or Plausible)

### 중기 (1달 내)
10. Product Hunt 런칭
11. 공유 URL 생성 기능 구현
12. 블로그 콘텐츠 4개 발행
13. Twitter/X, LinkedIn 콘텐츠 시작

### 핵심 원칙
- **Zero-cost first**: 서버 비용 없이 성장할 수 있는 전략 우선
- **Content-led + Product-led**: 콘텐츠로 유입, 제품으로 전환 및 바이럴
- **한국어 시장 선점**: 경쟁이 낮은 한국어 AI 회의 도구 시장에서 먼저 포지셔닝
- **개발자 커뮤니티 활용**: 오픈소스/기술적 차별점으로 얼리어답터 확보

---

*이 보고서는 Meeting AI 프로젝트의 현재 코드베이스 분석과 시장 조사를 기반으로 작성되었습니다.*
*최종 업데이트: 2026-03-11*
