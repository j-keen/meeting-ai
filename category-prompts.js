// category-prompts.js - Category-specific AI prompt guidance

const NAME_HANDLING_RULES = {
  ko: `[화자 처리 규칙]
- 이 트랜스크립트에는 화자 구분이 없습니다. 발언자를 확정적으로 귀속하지 마세요.
- 비슷한 이름은 동일인으로 추정하세요 (STT 오인식 가능).
- "~라는 의견이 제시됨", "~하기로 논의됨" 형태로 서술하세요.
- 이름이 명확히 지명된 경우에만 언급하되 "(추정)" 표기를 붙이세요.`,
  en: `[Speaker Handling Rules]
- This transcript has no speaker attribution. Do NOT definitively assign statements to specific speakers.
- Similar names likely refer to the same person (STT misrecognition possible).
- Use passive forms: "It was suggested that...", "It was discussed that..."
- Only mention names when explicitly stated in the transcript, with "(estimated)" notation.`,
};

// Built-in category prompt definitions
const CATEGORY_PROMPTS = {
  '정기회의': {
    analysis: {
      ko: '[정기회의 분석 관점]\n- 안건별 결론과 미결 사항을 명확히 추적하세요.\n- 이전 회의 대비 진행 상황 변화에 주목하세요.\n- 반복적으로 언급되는 이슈를 식별하세요.',
      en: '[Regular Meeting Analysis]\n- Track conclusions and pending items per agenda topic.\n- Note progress changes compared to previous discussions.\n- Identify recurring issues.',
    },
    minutes: {
      ko: '[정기회의 회의록 구조]\n- 안건별로 섹션을 나누고, 각 안건의 결론/미결 상태를 표시하세요.\n- 후속 조치(Action Items)를 명확히 정리하세요.',
      en: '[Regular Meeting Minutes Structure]\n- Organize sections by agenda item with conclusion/pending status.\n- Clearly list follow-up action items.',
    },
    chat: {
      ko: '당신은 회의 진행을 보조하는 비서입니다. 안건 추적, 미결 사항 정리, 후속 조치 확인에 집중하세요.',
      en: 'You are a meeting facilitation assistant. Focus on agenda tracking, pending items, and follow-up actions.',
    },
  },
  '브레인스토밍': {
    analysis: {
      ko: '[브레인스토밍 분석 관점]\n- 제시된 아이디어를 빠짐없이 수집하고 주제별로 그룹핑하세요.\n- 아이디어 간 연결점이나 시너지를 찾으세요.\n- 실행 가능성 기준으로 우선순위를 제안하세요.',
      en: '[Brainstorming Analysis]\n- Collect ALL ideas and group them by theme.\n- Find connections and synergies between ideas.\n- Suggest priorities based on feasibility.',
    },
    minutes: {
      ko: '[브레인스토밍 회의록 구조]\n- 아이디어 목록을 주제별로 그룹핑한 섹션을 추가하세요.\n- 각 아이디어에 실현 가능성(높음/중간/낮음)을 표시하세요.',
      en: '[Brainstorming Minutes Structure]\n- Add a section with ideas grouped by theme.\n- Mark feasibility (High/Medium/Low) for each idea.',
    },
    chat: {
      ko: '당신은 창의적 퍼실리테이터입니다. 아이디어를 발전시키고, 새로운 관점을 제시하며, 연결점을 찾아주세요.',
      en: 'You are a creative facilitator. Help develop ideas, offer new perspectives, and find connections.',
    },
  },
  '고객미팅': {
    analysis: {
      ko: '[고객미팅 분석 관점]\n- 고객의 요구사항과 기대를 정확히 추출하세요.\n- 약속된 사항(일정, 산출물 등)을 빠짐없이 추적하세요.\n- 고객의 감정/만족도 변화를 포착하세요.',
      en: '[Client Meeting Analysis]\n- Extract client requirements and expectations precisely.\n- Track ALL commitments (timelines, deliverables).\n- Capture shifts in client sentiment/satisfaction.',
    },
    minutes: {
      ko: '[고객미팅 회의록 구조]\n- 요구사항-대응 매핑 테이블을 포함하세요.\n- 약속 사항과 기한을 별도 섹션으로 정리하세요.',
      en: '[Client Meeting Minutes Structure]\n- Include a requirements-response mapping table.\n- List commitments and deadlines in a separate section.',
    },
    chat: {
      ko: '당신은 어카운트 매니저입니다. 고객 요구사항 정리, 약속 사항 확인, 후속 조치 계획에 집중하세요.',
      en: 'You are an account manager. Focus on organizing client needs, confirming commitments, and planning follow-ups.',
    },
  },
  '1:1': {
    analysis: {
      ko: '[1:1 면담 분석 관점]\n- 피드백 내용과 합의사항을 구분하세요.\n- 후속 조치와 기한을 명확히 추적하세요.\n- 감정적 톤이나 우려 사항에 주의하세요.',
      en: '[1:1 Meeting Analysis]\n- Distinguish feedback from agreements.\n- Track follow-up actions and deadlines clearly.\n- Note emotional tone or concerns.',
    },
    minutes: {
      ko: '[1:1 면담 회의록 구조]\n- 면담 내용 요약 + 합의사항 섹션으로 구성하세요.\n- 후속 조치를 담당자별로 정리하세요.',
      en: '[1:1 Meeting Minutes Structure]\n- Structure as discussion summary + agreements section.\n- Organize follow-ups by responsible person.',
    },
    chat: {
      ko: '당신은 코칭 어드바이저입니다. 피드백 정리, 성장 포인트 식별, 합의사항 확인에 집중하세요.',
      en: 'You are a coaching advisor. Focus on organizing feedback, identifying growth points, and confirming agreements.',
    },
  },
  '프로젝트': {
    analysis: {
      ko: '[프로젝트 회의 분석 관점]\n- 마일스톤 진행 상황과 지연 요소를 추적하세요.\n- 리스크와 의존성을 식별하세요.\n- 리소스 할당이나 병목 현상에 주목하세요.',
      en: '[Project Meeting Analysis]\n- Track milestone progress and blockers.\n- Identify risks and dependencies.\n- Note resource allocation or bottlenecks.',
    },
    minutes: {
      ko: '[프로젝트 회의록 구조]\n- 진행현황 섹션 + 리스크 매트릭스를 포함하세요.\n- 의존성과 블로커를 별도로 정리하세요.',
      en: '[Project Minutes Structure]\n- Include progress status section + risk matrix.\n- List dependencies and blockers separately.',
    },
    chat: {
      ko: '당신은 프로젝트 코디네이터입니다. 일정 추적, 리스크 관리, 의존성 파악에 집중하세요.',
      en: 'You are a project coordinator. Focus on timeline tracking, risk management, and dependency mapping.',
    },
  },
  '교육': {
    analysis: {
      ko: '[교육/세미나 분석 관점]\n- 핵심 개념과 주요 내용을 체계적으로 정리하세요.\n- Q&A 내용을 질문-답변 쌍으로 정리하세요.\n- 학습 포인트와 실습 과제를 추출하세요.',
      en: '[Training/Seminar Analysis]\n- Systematically organize key concepts and content.\n- Structure Q&A as question-answer pairs.\n- Extract learning points and practical exercises.',
    },
    minutes: {
      ko: '[교육 회의록 구조]\n- 학습 내용 요약 + Q&A 테이블을 포함하세요.\n- 핵심 개념을 목록으로 정리하세요.',
      en: '[Training Minutes Structure]\n- Include learning summary + Q&A table.\n- List key concepts in bullet points.',
    },
    chat: {
      ko: '당신은 학습 도우미입니다. 개념 설명, 궁금한 점 해소, 학습 내용 복습에 도움을 주세요.',
      en: 'You are a learning assistant. Help explain concepts, answer questions, and review learned material.',
    },
  },
  '리뷰': {
    analysis: {
      ko: '[리뷰 분석 관점]\n- 피드백을 심각도(Critical/Major/Minor)로 분류하세요.\n- 승인/반려/조건부 승인 판정을 추적하세요.\n- 개선 권고사항을 구체적으로 정리하세요.',
      en: '[Review Analysis]\n- Classify feedback by severity (Critical/Major/Minor).\n- Track approval/rejection/conditional decisions.\n- List specific improvement recommendations.',
    },
    minutes: {
      ko: '[리뷰 회의록 구조]\n- 피드백 매트릭스(항목×심각도) + 최종 판정 섹션을 포함하세요.\n- 수정 필요 항목을 우선순위로 정리하세요.',
      en: '[Review Minutes Structure]\n- Include feedback matrix (item × severity) + final verdict section.\n- Prioritize items requiring revision.',
    },
    chat: {
      ko: '당신은 QA 파트너입니다. 리뷰 피드백 정리, 우선순위 판단, 개선 방안 제안에 집중하세요.',
      en: 'You are a QA partner. Focus on organizing review feedback, judging priorities, and suggesting improvements.',
    },
  },
  '보고': {
    analysis: {
      ko: '[보고 분석 관점]\n- KPI, 수치, 통계 데이터를 정확히 추출하세요.\n- 이슈와 대응 현황을 매핑하세요.\n- 트렌드나 변화 추이에 주목하세요.',
      en: '[Report Analysis]\n- Extract KPIs, figures, and statistics precisely.\n- Map issues to their response status.\n- Note trends and changes.',
    },
    minutes: {
      ko: '[보고 회의록 구조]\n- 수치 데이터 테이블 + 이슈-대응 매핑을 포함하세요.\n- 핵심 지표를 한눈에 볼 수 있게 정리하세요.',
      en: '[Report Minutes Structure]\n- Include data tables + issue-response mapping.\n- Present key metrics at a glance.',
    },
    chat: {
      ko: '당신은 데이터 분석가입니다. 수치 해석, 트렌드 분석, 데이터 기반 인사이트 제공에 집중하세요.',
      en: 'You are a data analyst. Focus on interpreting figures, analyzing trends, and providing data-driven insights.',
    },
  },
};

/**
 * Get combined guidance for selected categories.
 * @param {string[]} categoryNames - selected category names
 * @param {string} lang - 'ko' or 'en'
 * @param {Object} customHints - { categoryName: hintText } for custom categories
 * @returns {{ analysis: string, minutes: string, chat: string, nameRules: string }}
 */
export function getCategoryGuidance(categoryNames, lang = 'ko', customHints = {}) {
  if (!categoryNames || categoryNames.length === 0) {
    return { analysis: '', minutes: '', chat: '', nameRules: NAME_HANDLING_RULES[lang] || NAME_HANDLING_RULES.en };
  }

  const l = lang === 'ko' ? 'ko' : 'en';
  const analysisParts = [];
  const minutesParts = [];
  const chatParts = [];

  for (const name of categoryNames) {
    const builtin = CATEGORY_PROMPTS[name];
    if (builtin) {
      analysisParts.push(builtin.analysis[l]);
      minutesParts.push(builtin.minutes[l]);
      chatParts.push(builtin.chat[l]);
    } else if (customHints[name]) {
      // Custom category with user-provided hint
      const hint = customHints[name];
      analysisParts.push(l === 'ko'
        ? `[${name} 분석 관점]\n${hint}`
        : `[${name} Analysis]\n${hint}`);
      minutesParts.push(l === 'ko'
        ? `[${name} 회의록 참고]\n${hint}`
        : `[${name} Minutes Note]\n${hint}`);
      chatParts.push(hint);
    }
  }

  return {
    analysis: analysisParts.join('\n\n'),
    minutes: minutesParts.join('\n\n'),
    chat: chatParts.join('\n'),
    nameRules: NAME_HANDLING_RULES[l],
  };
}
