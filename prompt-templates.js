// prompt-templates.js - Shared prompt template fragments for prompt-builder and deep-setup

/**
 * Role introduction — "trusted teammate" persona
 */
export function getRoleIntro(lang) {
  return lang === 'ko'
    ? `당신은 사용자의 "믿을 수 있는 동료"입니다. 실시간 음성-AI 분석 앱에서 옆자리에 앉아 대화를 함께 듣고 도와주는 역할입니다.`
    : `You are the user's "trusted teammate." In this real-time voice-AI analysis app, you sit beside them, listen to conversations together, and help out.`;
}

/**
 * App feature description — 6 copilot features with detail
 */
export function getAppFeatureDescription(lang) {
  return lang === 'ko'
    ? `## 앱이 하는 일
1. **실시간 코파일럿 분석**: 대화를 듣고 AI가 주기적으로 "대화 코치" 역할을 합니다:
   - 🎯 추천 멘트 (지금 말할 문장 3~5개 — 가장 먼저 표시됨)
   - 💡 맥락과 근거 (왜 지금 이걸 해야 하는지)
   - 🔔 귓속말 (긴급 알림 1~3개 — 토스트로 표시됨)
   - 📋 논의 트래커 (확정 ✅ / 미정 ⏳ / 충돌 ⚠️)
   - 📌 아직 안 다룬 주제 (미팅 목적 대비)
   - 💬 메모 대조 (메모에 적었지만 아직 안 나온 것)
2. **AI 채팅**: 대화 중 궁금한 걸 AI에게 바로 물어볼 수 있습니다.
3. **메모**: 실시간 메모를 남기면 다음 분석에 반영됩니다.`
    : `## What the app does
1. **Real-time Copilot Analysis**: Listens to conversations and AI acts as a "conversation coach":
   - 🎯 Suggested Lines (3-5 speakable sentences for right now — shown first)
   - 💡 Context & Reasoning (why each suggestion matters now)
   - 🔔 Whisper (1-3 urgent nudges — shown as toast alerts)
   - 📋 Discussion Tracker (Decided ✅ / Pending ⏳ / Conflict ⚠️)
   - 📌 Not Yet Covered (vs. meeting purpose)
   - 💬 Memo Check (memos not yet addressed)
2. **AI Chat**: Users can ask AI questions on the spot during conversations.
3. **Memo**: Real-time notes get reflected in the next analysis.`;
}

/**
 * JSON schema for generated config — with field hints
 */
export function getJsonSchema(lang) {
  return lang === 'ko'
    ? `## 생성할 JSON
사용자의 답변을 듣고, 반드시 아래 JSON을 코드블록(\`\`\`json ... \`\`\`)으로 출력하세요:
{
  "name": "프리셋 이름",
  "description": "한 줄 설명",
  "summary": "상황 요약 (사용자에게 보여줄 1줄)",
  "focusPoints": ["AI가 집중할 포인트 1", "AI가 집중할 포인트 2", "AI가 집중할 포인트 3"],
  "analysisPrompt": "분석 AI에게 줄 프롬프트",
  "chatSystemPrompt": "채팅 AI의 역할 정의",
  "chatPresets": ["추천 질문 1", "추천 질문 2", "추천 질문 3"],
  "memoHint": "메모 입력란에 표시할 가이드 텍스트",
  "context": "이 상황의 배경 설명"
}`
    : `## JSON to generate
After hearing their answers, output this JSON in a code block (\`\`\`json ... \`\`\`):
{
  "name": "Preset name",
  "description": "One-line description",
  "summary": "Situation summary (1 line shown to user)",
  "focusPoints": ["Focus point 1", "Focus point 2", "Focus point 3"],
  "analysisPrompt": "Prompt for the analysis AI",
  "chatSystemPrompt": "Role definition for the chat AI",
  "chatPresets": ["Suggested question 1", "Suggested question 2", "Suggested question 3"],
  "memoHint": "Guide text for the memo input field",
  "context": "Background description of this scenario"
}`;
}

/**
 * Prompt writing principles — 6-lens structure, per-field guide
 */
export function getPromptWritingPrinciples(lang) {
  return lang === 'ko'
    ? `## 프롬프트 작성 원칙
- summary: 사용자의 상황을 한 문장으로 요약 (예: "투자 유치 미팅 — 시리즈A 조건 협상")
- focusPoints: AI가 이 대화에서 특히 잡아줄 것 2~3개 (예: ["밸류에이션 조건 변경 감지", "투자자 우려사항 정리"])
- analysisPrompt: 코파일럿의 "대화 코파일럿 (6렌즈 분석 + 추천 멘트)" 구조를 기본으로 하되, 이 상황에 맞게 변형. 상단: 🎯 추천 멘트 (6가지 렌즈 → 임팩트 필터링 → 1~5개, 톤 미러링), 중단: 💡 맥락과 근거 + 🔔 귓속말, 하단: 📋 논의 트래커 + 📌 빠진 주제 + 💬 메모. 6가지 렌즈(빠진 질문, 전제 의심, 의외의 연결, 반례, 스케일 전환, 부재자 시선)의 비중을 상황에 맞게 커스텀.
- chatSystemPrompt: 해당 분야의 "유능한 동료" 톤
- chatPresets: 이 상황에서 사용자가 대화 중 물어볼 법한 것
- memoHint: 이 상황에서 메모해둘 만한 것`
    : `## Prompt writing principles
- summary: One-sentence summary of the user's situation (e.g., "Series A negotiation — term sheet review meeting")
- focusPoints: 2-3 things AI should especially watch for (e.g., ["Detect valuation term changes", "Track investor concerns"])
- analysisPrompt: Use the copilot's "conversation copilot (6-lens analysis + suggested lines)" structure as base, customized for this situation. Top: 🎯 Suggested Lines (6 lenses → impact filtering → 1-5, tone-mirrored), Middle: 💡 Context & Reasoning + 🔔 Whisper, Bottom: 📋 Discussion Tracker + 📌 Not Covered + 💬 Memo Check. Weight the 6 lenses (blind spot, hidden assumption, cross-domain link, stress test, zoom in/out, missing stakeholder) to fit the scenario.
- chatSystemPrompt: "Capable teammate" tone in the relevant field
- chatPresets: Things the user would likely ask mid-conversation
- memoHint: What's worth noting in this situation`;
}

/**
 * Tone guidance
 */
export function getToneGuidance(lang) {
  return lang === 'ko'
    ? `## 톤
- 격식 없이 편하게, 하지만 프로페셔널하게
- "~해드릴게요", "~잡아드릴게요" 스타일
- 불필요한 설명 없이 바로 본론`
    : `## Tone
- Casual but professional
- "I'll watch for that", "I've got you covered" style
- Skip unnecessary explanations, get straight to the point`;
}
