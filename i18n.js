// i18n.js - Internationalization module

const translations = {
  en: {
    // Header
    'header.timer': '00:00:00',
    'header.theme_tooltip': 'Toggle theme (Ctrl+T)',
    'header.theme_dark': 'Dark',
    'header.theme_light': 'Light',
    'header.history': 'History',
    'header.settings': 'Settings',
    'header.history_tooltip': 'Meeting history',
    'header.settings_tooltip': 'Settings',

    // Transcript panel
    'panel.transcript': 'Transcript',
    'panel.highlights': 'Highlights',
    'panel.correct': 'Correct',
    'panel.export': 'Export',
    'transcript.empty': 'Start recording to see the transcript here.',
    'transcript.empty_hint': 'Press the record button or Ctrl+R to begin.',
    'transcript.bookmark_tooltip': 'Bookmark (Ctrl+B)',
    'transcript.edit_tooltip': 'Edit',
    'transcript.delete_tooltip': 'Delete',

    // AI panel
    'panel.ai': 'AI Analysis',
    'panel.analyze': 'Analyze Now',
    'panel.analysis_history': 'History',
    'panel.prompt_settings': 'AI Analysis Settings',
    'ai.empty': 'AI analysis results will appear here.',
    'ai.empty_hint': 'Analysis runs automatically during recording.',
    'ai.waiting': 'Please wait...',
    'ai.waiting_hint': 'Auto-analyzes every {n}s during recording.',

    // Bottom bar
    'record.label': 'REC',
    'record.stop': 'STOP',
    'record.status_recording': 'Recording...',
    'record.status_stopped': 'Stopped',
    'record.status_ended': 'Meeting ended - Resume or start a new meeting',
    'stt.engine_label': 'Web Speech',
    'stt.unsupported': 'Web Speech API is not supported. Please use Chrome or Edge.',
    'stt.mic_permission_denied': 'Microphone permission denied. Please allow microphone access.',
    'stt.no_mic_input': 'No microphone input detected. Please check your microphone.',
    'stt.restart_failed': 'Speech recognition stopped unexpectedly. Please restart recording.',
    'stt.network_timeout': 'Cannot connect to speech recognition server. Please check your network.',
    'stt.connection_failed': 'Speech recognition keeps failing. Please check your network and restart Chrome.',
    'stt.engine': 'STT Engine',
    'stt.engine_webspeech': 'Web Speech (Free)',
    'stt.engine_deepgram': 'Deepgram Nova-3 (Paid, High Accuracy)',
    'stt.deepgram_key_missing': 'Deepgram API key not configured. Please set DEEPGRAM_API_KEY on the server.',
    'stt.fallback_webspeech': 'Falling back to Web Speech.',
    'stt.fallback_warning': 'Deepgram connection failed. Switched to Web Speech.',
    'stt.test_connection': 'Test',
    'stt.test_success': 'Connection successful!',
    'stt.test_fail': 'Connection failed.',
    'stt.test_fail_browser': 'Web Speech API not supported in this browser.',
    'stt.recording_locked': 'Stop recording to change STT engine.',
    'stt.status_idle': 'Idle',
    'stt.status_connecting': 'Connecting...',
    'stt.status_active': 'Active',
    'stt.status_fallback': 'Fallback',
    'stt.status_error': 'Error',
    'stt.no_events': 'No events yet',
    'stt.log_starting': 'Starting {engine}...',
    'stt.log_stopped': 'Recording stopped',
    'stt.log_compare_start': 'Comparison mode started',
    'stt.log_compare_end': 'Comparison mode ended',
    'stt.log_copied': 'Log copied to clipboard',
    'stt.compare_mode': 'Compare Engines',
    'stt.compare_title': 'Engine Comparison',
    'stt.compare_hint': 'Speak to compare recognition results',
    'stt.compare_stop': 'Stop Comparison',
    'stt.copy_log': 'Copy Log',
    'privacy.badge': 'Private',
    'privacy.tooltip': 'All data stays local. AI analysis via Vertex AI (not used for training).',
    'privacy.proxy_hint': 'Cloud AI active — API key not required. Your data is never used for AI training.',
    'memo.placeholder': 'Add a memo... (Ctrl+M)',
    'memo.add': 'Add',
    'meeting.end': 'End Meeting',
    'meeting.resume': 'Resume',
    'meeting.new': 'New Meeting',

    // Settings
    'settings.title': 'Settings',
    'settings.api_keys': 'API Keys',
    'settings.gemini_key': 'Gemini API Key',
    'settings.gemini_placeholder': 'Enter API key',
    'settings.stt': 'STT Settings',
    'settings.language': 'Language',
    'settings.lang_ko': 'Korean',
    'settings.lang_en': 'English',
    'settings.lang_ja': 'Japanese',
    'settings.lang_zh': 'Chinese',
    'settings.ai_analysis': 'AI Analysis',
    'settings.auto_analysis': 'Auto Analysis',
    'settings.auto_correction': 'AI Correction',
    'settings.analysis_interval': 'Analysis Interval:',
    'settings.token_strategy': 'Token Strategy',
    'settings.strategy_smart': 'Smart (Summary + Recent)',
    'settings.strategy_full': 'Full Transcript',
    'settings.recent_minutes': 'Recent Minutes:',
    'settings.meeting_type': 'Meeting Type',
    'settings.preset_general': 'General',
    'settings.preset_weekly': 'Weekly Meeting',
    'settings.preset_brainstorm': 'Brainstorming',
    'settings.preset_sales': 'Sales/Client',
    'settings.preset_1on1': '1-on-1',
    'settings.preset_kickoff': 'Kickoff',
    'settings.preset_custom': 'Custom',
    'settings.meeting_context': 'Meeting Context',
    'settings.context_placeholder': 'Describe the meeting context, goals, participants...',
    'settings.analysis_prompt': 'Analysis Prompt',
    'settings.prompt_placeholder': 'Custom analysis prompt...',
    'settings.reset_prompt': 'Reset to Default',
    'settings.chat_prompt': 'Chat System Prompt',
    'settings.chat_prompt_placeholder': 'Custom chat system prompt...',
    'settings.reset_chat_prompt': 'Reset to Default',
    'settings.integrations': 'Integrations',
    'settings.slack_webhook': 'Slack Webhook URL',
    'settings.ui_language': 'UI Language',
    'settings.ui_lang_auto': 'Auto (Browser)',
    'settings.ui_lang_en': 'English',
    'settings.ui_lang_ko': 'Korean',
    'settings.ai_language': 'AI Analysis Language',
    'settings.ai_lang_auto': 'Same as UI',
    'settings.ai_lang_en': 'English',
    'settings.ai_lang_ko': 'Korean',

    // Context popup
    'context.edit_text': 'Edit Text',
    'context.bookmark': 'Toggle Bookmark',
    'context.delete': 'Delete',
    'context.engine': 'STT Engine',

    // Export modal
    'export.title': 'Export Meeting',
    'export.md_full': 'Markdown - Full Report',
    'export.md_summary': 'Markdown - Summary',
    'export.md_highlights': 'Markdown - Highlights & Memos',
    'export.json': 'JSON - Full Data',
    'export.slack': 'Send to Slack',
    'export.email': 'Send via Email',

    // History modal
    'history.title': 'Meeting History',
    'history.search': 'Search meetings...',
    'history.view': 'View',
    'history.export': 'Export',
    'history.delete': 'Delete',
    'history.no_meetings': 'No meetings found.',
    'history.untitled': 'Untitled Meeting',
    // Analysis history modal
    'analysis_history.title': 'Analysis History',
    'analysis_history.empty': 'No analysis history yet.',
    'analysis_history.initial': 'Initial Analysis',
    'analysis_history.add_memo': 'Add memo...',
    'analysis_history.memo_placeholder': 'Write a memo for this analysis...',
    'analysis_history.view_detail': 'View Details',

    // Highlights modal
    'highlights.title': 'Highlights & Memos',
    'highlights.all': 'All',
    'highlights.bookmarks': 'Bookmarks',
    'highlights.memos': 'Memos',
    'highlights.empty': 'No highlights yet.',

    // Meeting viewer
    'viewer.title': 'Meeting Details',
    'viewer.no_analysis': 'No analysis data.',
    'viewer.no_chat': 'No chat history.',

    // AI cards
    'card.summary': 'Summary',
    'card.context': 'Current Context',
    'card.openQuestions': 'Open Questions',
    'card.actionItems': 'Action Items',
    'card.suggestions': 'AI Suggestions',
    'card.no_items': 'No items yet.',
    'card.no_data': 'No data yet.',
    'card.expand': 'Expand',
    'card.toggle': 'Toggle',

    // Toast / messages
    'toast.no_api_key': 'Gemini API key not set. Go to Settings.',
    'toast.no_transcript': 'No transcript to analyze.',
    'toast.meeting_saved': 'Meeting saved.',
    'toast.meeting_deleted': 'Meeting deleted.',
    'toast.storage_high': 'Storage usage is high. Consider deleting old meetings.',
    'toast.storage_usage': 'Storage usage: {pct}%. Consider cleaning up.',
    'toast.record_fail': 'Failed to start recording: ',
    'toast.analysis_fail': 'Analysis failed: ',
    'toast.slack_sent': 'Sent to Slack!',
    'toast.slack_fail': 'Failed to send to Slack: ',
    'toast.slack_no_url': 'Slack webhook URL not set.',
    'toast.correcting': 'AI correcting transcript...',
    'toast.correction_done': 'Correction complete.',
    'toast.meeting_resumed': 'Meeting resumed.',
    'confirm.delete_meeting': 'Delete this meeting?',

    // Markdown export
    'md.meeting_notes': '# Meeting Notes',
    'md.date': 'Date',
    'md.duration': 'Duration',
    'md.participants': 'Participants',
    'md.transcript': '## Transcript',
    'md.memos': '## Memos',
    'md.summary': '## Summary',
    'md.action_items': '## Action Items',
    'md.open_questions': '## Open Questions',
    'md.suggestions': '## Suggestions',
    'md.meeting_summary': '# Meeting Summary',
    'md.context': '## Context',
    'md.highlights_title': '# Highlights & Memos',
    'md.bookmarks': '## Bookmarks',
    'md.no_analysis': '# No analysis available',

    // Chat panel
    'panel.chat': 'AI Chat',
    'chat.placeholder': 'Ask AI about this meeting...',
    'chat.send': 'Send',
    'chat.empty': 'Ask AI about the meeting, add insights, or request analysis.',
    'chat.error': 'Chat error',
    'chat.file_attached': 'File attached: {name}',
    'chat.context_added': 'Context added to analysis.',
    'chat.memo_added': 'Memo added to transcript.',
    'chat.rerunning_analysis': 'Re-running analysis with updated context...',
    'chat.waiting_hint': 'Ask questions about the meeting in progress.',
    'chat.suggestion_1': 'Summarize the discussion so far',
    'chat.suggestion_2': 'List action items',
    'chat.suggestion_3': 'What are the key decisions?',

    // Settings tabs
    'settings.tab_general': 'General',
    'settings.tab_analysis': 'Analysis',
    'settings.tab_chat': 'Chat',
    'settings.tab_profile': 'Profile',
    'settings.tab_connect': 'Connect',

    // Profile
    'settings.profile_hint': 'This information will be used by AI analysis and chat to provide personalized insights.',
    'settings.profile_name': 'Name',
    'settings.profile_name_ph': 'e.g. John Doe',
    'settings.profile_title': 'Title / Position',
    'settings.profile_title_ph': 'e.g. Product Manager',
    'settings.profile_team': 'Team / Department',
    'settings.profile_team_ph': 'e.g. Product Team',
    'settings.profile_notes': 'Additional Notes',
    'settings.profile_notes_ph': 'Anything else AI should know about you...',
    'settings.profile_file': 'Attach File',
    'settings.profile_file_view': 'View',
    'settings.profile_ai_chat': 'Fill with AI Chat',
    'settings.profile_ai_chat_title': 'Fill Profile with AI',
    'settings.profile_ai_chat_ph': 'Answer the question...',
    'settings.profile_ai_apply': 'Apply to Profile',
    'settings.profile_applied': 'Profile updated!',
    'settings.profile_chat_incomplete': 'Please complete the conversation first.',

    // Strategy descriptions
    'strategy.smart_desc': 'Previous summary + recent N minutes. Best for long meetings. Uses fewer tokens.',
    'strategy.full_desc': 'Sends entire transcript. Most accurate but uses more tokens.',

    // History filters
    'history.filter_all': 'All Types',
    'history.filter_date_from': 'From date',
    'history.filter_date_to': 'To date',

    // Context sources
    'context.direct': 'Direct Input',
    'context.previous': 'Previous Meeting',
    'context.file': 'File (.txt/.md)',

    // Preset editing
    'preset.edit': 'Edit prompt',
    'preset.save': 'Save as Preset',
    'preset.reset': 'Reset',
    'preset.name_prompt': 'Enter preset name:',

    // Prompt presets
    'settings.prompt_preset': 'Prompt Preset',
    'settings.prompt_preset_select': 'Select a preset...',

    // Welcome modal
    'welcome.title': 'Meeting AI',
    'welcome.subtitle': 'What would you like to do?',
    'welcome.quick_start': 'Quick Start',
    'welcome.quick_start_desc': 'Start recording immediately with default settings',
    'welcome.meeting_prep': 'Meeting Prep',
    'welcome.meeting_prep_desc': 'AI-guided setup for your meeting',
    'welcome.search': 'Search Meetings',
    'welcome.search_desc': 'Browse and search past meetings',

    // Meeting prep
    'prep.step_type': 'What kind of meeting is this?',
    'prep.step_agenda': 'What\'s on the agenda today?',
    'prep.step_time': 'How long will this meeting be?',
    'prep.step_attendees': 'Who\'s attending?',
    'prep.step_prompt': 'Any special instructions for AI analysis?',
    'prep.step_standby': 'Meeting setup complete!',
    'prep.type_general': 'General',
    'prep.type_weekly': 'Weekly',
    'prep.type_brainstorm': 'Brainstorm',
    'prep.type_sales': 'Sales/Client',
    'prep.type_1on1': '1-on-1',
    'prep.type_kickoff': 'Kickoff',
    'prep.skip': 'Skip',
    'prep.use_default': 'Use Default',
    'prep.edit_prompt': 'Edit',
    'prep.no_limit': 'No limit',
    'prep.minutes': '{n} min',
    'prep.start_meeting': 'Start Meeting',
    'prep.save_preset': 'Save as Preset',
    'prep.edit_settings': 'Edit Settings',
    'prep.add_memo': 'Add Memo',
    'prep.summary_type': 'Type',
    'prep.summary_agenda': 'Agenda',
    'prep.summary_time': 'Time',
    'prep.summary_attendees': 'Attendees',
    'prep.summary_prompt': 'AI Prompt',
    'prep.preset_name': 'Enter preset name:',
    'prep.preset_saved': 'Preset saved!',
    'prep.load_preset': 'Load Preset',
    'prep.or_type': 'Or type your own...',
    'prep.type_names': 'Type names separated by commas...',
    'prep.confirm_attendees': 'Confirm',

    // Contacts
    'contacts.title': 'Contacts',
    'contacts.search': 'Search contacts...',
    'contacts.add': 'Add Contact',
    'contacts.name': 'Name',
    'contacts.company': 'Company',
    'contacts.no_contacts': 'No contacts yet.',
    'contacts.save': 'Save',
    'contacts.cancel': 'Cancel',

    // Meeting quick start
    'meeting.quick_start_title': 'Start a new meeting',
    'meeting.quick_start': 'Quick Start',
    'meeting.manual_setup': 'Setup & Start',
    'toast.recording_started': 'Recording started. Speak to transcribe.',
    'transcript.waiting': 'Listening for speech...',
    'transcript.waiting_hint': 'Speak and it will be transcribed automatically.',

    // Analysis countdown
    'analysis.countdown': '{n}s',
    'analysis.analyzing': 'Analyzing...',
    'analysis.paused': 'Paused',
    'panel.pause_analysis': 'Pause',
    'panel.resume_analysis': 'Resume',

    // End Meeting Modal
    'end_meeting.title': 'Save Meeting',
    'end_meeting.meeting_title': 'Meeting Title',
    'end_meeting.tags': 'Tags',
    'end_meeting.categories': 'Categories',
    'end_meeting.importance': 'Importance',
    'end_meeting.participants': 'Participants',
    'end_meeting.location': 'Location',
    'end_meeting.save': 'Save',
    'end_meeting.cancel': 'Cancel',
    'end_meeting.generating': 'Generating AI suggestions...',
    'end_meeting.add_tag': 'Add tag...',
    'end_meeting.add_participant': 'Add name...',
    'end_meeting.no_participants': 'No contacts registered.',

    // Panel bookmarks
    'panel.bookmarks': 'Bookmarks',

    // Settings Data tab
    'settings.tab_data': 'Data',
    'settings.participants': 'Participants',
    'settings.locations': 'Locations',
    'settings.categories': 'Categories',
    'settings.add': 'Add',
    'settings.no_items': 'No items yet.',
    'settings.placeholder_name': 'Name',
    'settings.placeholder_company': 'Company',
    'settings.placeholder_location': 'Location name',
    'settings.placeholder_category': 'Category name',

    // History filters
    'history.filter_all_categories': 'All Categories',
    'history.filter_all_ratings': 'All Ratings',
    'history.filter_tag': 'Filter by tag...',

    // Meeting title placeholder
    'meeting.title_placeholder': 'Meeting title...',

    // Chat presets
    'settings.chat_presets': 'Chat Preset Questions',
    'settings.chat_preset_placeholder': 'Enter preset question...',
    'settings.reset_defaults': 'Reset Defaults',

    // Settings footer & modal
    'settings.save_settings': 'Save',
    'settings.close': 'Close',
    'settings.reset_all': 'Reset All',
    'settings.unsaved_changes': 'Unsaved changes',
    'settings.unsaved_modal_text': 'You have unsaved changes. What would you like to do?',
    'settings.save_and_close': 'Save',
    'settings.discard': "Don't Save",
    'settings.cancel': 'Cancel',
    'settings.saved': 'Settings saved.',
    'settings.reset_confirm': 'Reset all settings to defaults? This cannot be undone.',
    'settings.reset_done': 'All settings reset to defaults.',

    // Copy & Compare
    'panel.copy_md': 'Copy',
    'panel.compare': 'Compare',
    'toast.copied_md': 'Copied as Markdown!',
    'compare.title': 'Prompt A/B Compare',
    'compare.prompt_a': 'Prompt A',
    'compare.prompt_b': 'Prompt B',
    'compare.run': 'Run Comparison',
    'compare.running': 'Analyzing...',
    'compare.current_prompt': '(Current Prompt)',
    'compare.error': 'Analysis failed',
    'compare.set_default': 'Set as Default Prompt',
    'compare.set_default_success': 'Prompt set as default',
    'compare.progress_a_done': 'A \u2713 / B analyzing...',
    'compare.progress_b_done': 'A analyzing... / B \u2713',

    // Custom prompt presets
    'preset.delete_confirm': 'Delete this preset?',

    // Onboarding
    'onboarding.q_name': 'What\'s your name?',
    'onboarding.q_title': 'What\'s your job title?',
    'onboarding.q_team': 'Which team or department?',
    'onboarding.q_role': 'What\'s your usual meeting role?',
    'onboarding.q_interests': 'What topics interest you most?',
    'onboarding.ph_name': 'e.g. John Kim',
    'onboarding.ph_title': 'e.g. Product Manager',
    'onboarding.ph_team': 'e.g. Platform Team',
    'onboarding.ph_interests': 'e.g. UX, backend architecture',
    'onboarding.benefit': 'Just 5 quick questions to dramatically improve your meeting notes quality.',
    'onboarding.next': 'Next',
    'onboarding.skip': 'Skip',
    'onboarding.skip_all': 'Skip All',
    'onboarding.role_attendee': 'Attendee',
    'onboarding.role_facilitator': 'Facilitator',
    'onboarding.role_presenter': 'Presenter',
    'onboarding.role_observer': 'Observer',
    'onboarding.complete_title': 'All set!',
    'onboarding.complete_desc': 'Meeting AI analyzes your meetings in real-time with <b>Gemini 2.0 Flash</b>, providing summaries, action items, and insights tailored to your role.',
    'onboarding.privacy': '\uD83D\uDD12 Your data is stored locally on this device only. AI analysis uses Vertex AI, which does not train on your data.',
    'onboarding.start': 'Get Started',

    // Guards
    'guard.idle_warning': 'No speech detected for 15 minutes. Recording will auto-stop in 5 minutes.',
    'guard.idle_auto_stopped': 'Recording auto-stopped due to 20 minutes of silence.',
    'guard.max_duration': 'Recording auto-stopped after 6 hours.',
    'guard.strategy_fallback': 'Transcript is long — switched to smart strategy for this analysis.',
    'guard.chat_large_confirm': 'Transcript is very large ({lines} lines). Send to AI?',

    // Misc
    'minutes': '{n} minutes',
    'meeting_title': 'Meeting {date} {time}',
  },

  ko: {
    // Header
    'header.timer': '00:00:00',
    'header.theme_tooltip': '테마 전환 (Ctrl+T)',
    'header.theme_dark': '다크테마',
    'header.theme_light': '라이트테마',
    'header.history': '지난회의기록',
    'header.settings': '설정',
    'header.history_tooltip': '회의 기록',
    'header.settings_tooltip': '설정',

    // Transcript panel
    'panel.transcript': '회의록',
    'panel.highlights': '하이라이트',
    'panel.correct': '교정',
    'panel.export': '내보내기',
    'transcript.empty': '녹음을 시작하면 여기에 회의록이 표시됩니다.',
    'transcript.empty_hint': '녹음 버튼 또는 Ctrl+R을 눌러 시작하세요.',
    'transcript.bookmark_tooltip': '북마크 (Ctrl+B)',
    'transcript.edit_tooltip': '편집',
    'transcript.delete_tooltip': '삭제',

    // AI panel
    'panel.ai': 'AI 분석',
    'panel.analyze': '즉시 분석',
    'panel.analysis_history': '히스토리',
    'panel.prompt_settings': 'AI 분석 설정',
    'ai.empty': 'AI 분석 결과가 여기에 표시됩니다.',
    'ai.empty_hint': '녹음 중 자동으로 분석이 실행됩니다.',
    'ai.waiting': '잠시만 기다려주세요...',
    'ai.waiting_hint': '녹음 중 {n}초마다 자동으로 분석됩니다.',

    // Bottom bar
    'record.label': 'REC',
    'record.stop': 'STOP',
    'record.status_recording': '녹음 중...',
    'record.status_stopped': '중지됨',
    'record.status_ended': '회의 종료됨 - 재개하거나 새 회의를 시작하세요',
    'stt.engine_label': 'Web Speech',
    'stt.unsupported': 'Web Speech API가 지원되지 않습니다. Chrome 또는 Edge를 사용해주세요.',
    'stt.mic_permission_denied': '마이크 권한이 거부되었습니다. 마이크 접근을 허용해주세요.',
    'stt.no_mic_input': '마이크 입력이 감지되지 않습니다. 마이크를 확인해주세요.',
    'stt.restart_failed': '음성 인식이 예기치 않게 중단되었습니다. 녹음을 다시 시작해주세요.',
    'stt.network_timeout': '음성 인식 서버에 연결할 수 없습니다. 네트워크를 확인해주세요.',
    'stt.connection_failed': '음성 인식이 계속 실패합니다. 네트워크를 확인하고 Chrome을 재시작해주세요.',
    'stt.engine': 'STT 엔진',
    'stt.engine_webspeech': 'Web Speech (무료)',
    'stt.engine_deepgram': 'Deepgram Nova-3 (유료, 높은 정확도)',
    'stt.deepgram_key_missing': 'Deepgram API 키가 설정되지 않았습니다. 서버에 DEEPGRAM_API_KEY를 설정해주세요.',
    'stt.fallback_webspeech': 'Web Speech로 전환합니다.',
    'stt.fallback_warning': 'Deepgram 연결 실패. Web Speech로 자동 전환되었습니다.',
    'stt.test_connection': '테스트',
    'stt.test_success': '연결 성공!',
    'stt.test_fail': '연결 실패.',
    'stt.test_fail_browser': '이 브라우저에서 Web Speech API를 지원하지 않습니다.',
    'stt.recording_locked': '녹음을 중지한 후 STT 엔진을 변경하세요.',
    'stt.status_idle': '대기',
    'stt.status_connecting': '연결 중...',
    'stt.status_active': '활성',
    'stt.status_fallback': 'Fallback',
    'stt.status_error': '오류',
    'stt.no_events': '이벤트 없음',
    'stt.log_starting': '{engine} 시작 중...',
    'stt.log_stopped': '녹음 중지됨',
    'stt.log_compare_start': '비교 모드 시작',
    'stt.log_compare_end': '비교 모드 종료',
    'stt.log_copied': '로그가 클립보드에 복사되었습니다',
    'stt.compare_mode': '엔진 비교',
    'stt.compare_title': '엔진 비교',
    'stt.compare_hint': '말씀하시면 인식 결과를 비교합니다',
    'stt.compare_stop': '비교 종료',
    'stt.copy_log': '로그 복사',
    'privacy.badge': '비공개',
    'privacy.tooltip': '모든 데이터는 로컬에 저장됩니다. AI 분석은 Vertex AI 경유 (학습에 사용되지 않음).',
    'privacy.proxy_hint': 'Cloud AI 활성 — API 키 없이 사용 가능. 데이터는 AI 학습에 사용되지 않습니다.',
    'memo.placeholder': '메모 추가... (Ctrl+M)',
    'memo.add': '추가',
    'meeting.end': '회의 종료',
    'meeting.resume': '재개',
    'meeting.new': '새 회의',

    // Settings
    'settings.title': '설정',
    'settings.api_keys': 'API 키',
    'settings.gemini_key': 'Gemini API 키',
    'settings.gemini_placeholder': 'API 키 입력',
    'settings.stt': 'STT 설정',
    'settings.language': '언어',
    'settings.lang_ko': '한국어',
    'settings.lang_en': '영어',
    'settings.lang_ja': '일본어',
    'settings.lang_zh': '중국어',
    'settings.ai_analysis': 'AI 분석',
    'settings.auto_analysis': '자동 분석',
    'settings.auto_correction': 'AI 교정',
    'settings.analysis_interval': '분석 주기:',
    'settings.token_strategy': '토큰 전략',
    'settings.strategy_smart': '스마트 (요약 + 최근)',
    'settings.strategy_full': '전체 회의록',
    'settings.recent_minutes': '최근 시간(분):',
    'settings.meeting_type': '회의 유형',
    'settings.preset_general': '일반',
    'settings.preset_weekly': '주간 회의',
    'settings.preset_brainstorm': '브레인스토밍',
    'settings.preset_sales': '영업/고객',
    'settings.preset_1on1': '1:1 미팅',
    'settings.preset_kickoff': '킥오프',
    'settings.preset_custom': '사용자 정의',
    'settings.meeting_context': '회의 배경',
    'settings.context_placeholder': '회의 배경, 목표, 참석자를 설명하세요...',
    'settings.analysis_prompt': '분석 프롬프트',
    'settings.prompt_placeholder': '사용자 정의 분석 프롬프트...',
    'settings.reset_prompt': '기본값으로 초기화',
    'settings.chat_prompt': '챗 시스템 프롬프트',
    'settings.chat_prompt_placeholder': '사용자 정의 챗 시스템 프롬프트...',
    'settings.reset_chat_prompt': '기본값으로 초기화',
    'settings.integrations': '연동',
    'settings.slack_webhook': 'Slack Webhook URL',
    'settings.ui_language': 'UI 언어',
    'settings.ui_lang_auto': '자동 (브라우저)',
    'settings.ui_lang_en': 'English',
    'settings.ui_lang_ko': '한국어',
    'settings.ai_language': 'AI 분석 언어',
    'settings.ai_lang_auto': 'UI 언어와 동일',
    'settings.ai_lang_en': 'English',
    'settings.ai_lang_ko': '한국어',

    // Context popup
    'context.edit_text': '텍스트 편집',
    'context.bookmark': '북마크 토글',
    'context.delete': '삭제',
    'context.engine': 'STT 엔진',

    // Export modal
    'export.title': '회의 내보내기',
    'export.md_full': 'Markdown - 전체 보고서',
    'export.md_summary': 'Markdown - 요약',
    'export.md_highlights': 'Markdown - 하이라이트 & 메모',
    'export.json': 'JSON - 전체 데이터',
    'export.slack': 'Slack으로 전송',
    'export.email': '이메일로 전송',

    // History modal
    'history.title': '회의 기록',
    'history.search': '회의 검색...',
    'history.view': '보기',
    'history.export': '내보내기',
    'history.delete': '삭제',
    'history.no_meetings': '회의 기록이 없습니다.',
    'history.untitled': '제목 없는 회의',
    // Analysis history modal
    'analysis_history.title': '분석 기록',
    'analysis_history.empty': '분석 기록이 없습니다.',
    'analysis_history.initial': '초기 분석',
    'analysis_history.add_memo': '메모 추가...',
    'analysis_history.memo_placeholder': '이 분석에 대한 메모를 작성하세요...',
    'analysis_history.view_detail': '상세 보기',

    // Highlights modal
    'highlights.title': '하이라이트 & 메모',
    'highlights.all': '전체',
    'highlights.bookmarks': '북마크',
    'highlights.memos': '메모',
    'highlights.empty': '하이라이트가 없습니다.',

    // Meeting viewer
    'viewer.title': '회의 상세',
    'viewer.no_analysis': '분석 데이터가 없습니다.',
    'viewer.no_chat': '채팅 내역이 없습니다.',

    // AI cards
    'card.summary': '요약',
    'card.context': '현재 맥락',
    'card.openQuestions': '미해결 질문',
    'card.actionItems': '실행 항목',
    'card.suggestions': 'AI 제안',
    'card.no_items': '아직 항목이 없습니다.',
    'card.no_data': '아직 데이터가 없습니다.',
    'card.expand': '확대',
    'card.toggle': '접기/펼치기',

    // Toast / messages
    'toast.no_api_key': 'Gemini API 키가 설정되지 않았습니다. 설정으로 이동하세요.',
    'toast.no_transcript': '분석할 회의록이 없습니다.',
    'toast.meeting_saved': '회의가 저장되었습니다.',
    'toast.meeting_deleted': '회의가 삭제되었습니다.',
    'toast.storage_high': '저장 공간이 부족합니다. 오래된 회의를 삭제해 주세요.',
    'toast.storage_usage': '저장 공간 사용량: {pct}%. 정리를 권장합니다.',
    'toast.record_fail': '녹음 시작 실패: ',
    'toast.analysis_fail': '분석 실패: ',
    'toast.slack_sent': 'Slack으로 전송 완료!',
    'toast.slack_fail': 'Slack 전송 실패: ',
    'toast.slack_no_url': 'Slack webhook URL이 설정되지 않았습니다.',
    'toast.correcting': 'AI가 회의록을 교정 중...',
    'toast.correction_done': '교정이 완료되었습니다.',
    'toast.meeting_resumed': '회의가 재개되었습니다.',
    'confirm.delete_meeting': '이 회의를 삭제하시겠습니까?',

    // Markdown export
    'md.meeting_notes': '# 회의록',
    'md.date': '날짜',
    'md.duration': '소요 시간',
    'md.participants': '참석자',
    'md.transcript': '## 회의 내용',
    'md.memos': '## 메모',
    'md.summary': '## 요약',
    'md.action_items': '## 실행 항목',
    'md.open_questions': '## 미해결 질문',
    'md.suggestions': '## 제안',
    'md.meeting_summary': '# 회의 요약',
    'md.context': '## 맥락',
    'md.highlights_title': '# 하이라이트 & 메모',
    'md.bookmarks': '## 북마크',
    'md.no_analysis': '# 분석 결과 없음',

    // Chat panel
    'panel.chat': 'AI 채팅',
    'chat.placeholder': '회의에 대해 AI에게 질문하세요...',
    'chat.send': '전송',
    'chat.empty': '회의에 대해 질문하거나, 인사이트를 추가하거나, 분석을 요청하세요.',
    'chat.error': '채팅 오류',
    'chat.file_attached': '파일 첨부됨: {name}',
    'chat.context_added': '맥락이 분석에 추가되었습니다.',
    'chat.memo_added': '메모가 회의록에 추가되었습니다.',
    'chat.rerunning_analysis': '업데이트된 맥락으로 재분석 중...',
    'chat.waiting_hint': '진행 중인 회의에 대해 질문해보세요.',
    'chat.suggestion_1': '지금까지 논의를 요약해줘',
    'chat.suggestion_2': '액션 아이템을 정리해줘',
    'chat.suggestion_3': '주요 결정사항이 뭐야?',

    // Settings tabs
    'settings.tab_general': '일반',
    'settings.tab_analysis': '분석',
    'settings.tab_chat': '채팅',
    'settings.tab_profile': '내 프로필',
    'settings.tab_connect': '연동',

    // Profile
    'settings.profile_hint': '이 정보는 AI 분석과 채팅에서 맞춤형 인사이트를 제공하는 데 활용됩니다.',
    'settings.profile_name': '이름',
    'settings.profile_name_ph': '예: 홍길동',
    'settings.profile_title': '직책 / 직급',
    'settings.profile_title_ph': '예: 프로덕트 매니저',
    'settings.profile_team': '팀 / 부서',
    'settings.profile_team_ph': '예: 제품팀',
    'settings.profile_notes': '기타 메모',
    'settings.profile_notes_ph': 'AI가 알아야 할 추가 정보...',
    'settings.profile_file': '파일 첨부',
    'settings.profile_file_view': '보기',
    'settings.profile_ai_chat': 'AI 대화로 채우기',
    'settings.profile_ai_chat_title': 'AI와 대화로 프로필 작성',
    'settings.profile_ai_chat_ph': '질문에 답변하세요...',
    'settings.profile_ai_apply': '프로필에 반영',
    'settings.profile_applied': '프로필이 업데이트되었습니다!',
    'settings.profile_chat_incomplete': '대화를 먼저 완료해주세요.',

    // Strategy descriptions
    'strategy.smart_desc': '이전 요약 + 최근 N분. 긴 회의에 최적. 토큰 적게 사용.',
    'strategy.full_desc': '전체 회의록 전송. 가장 정확하지만 토큰 많이 사용.',

    // History filters
    'history.filter_all': '모든 유형',
    'history.filter_date_from': '시작일',
    'history.filter_date_to': '종료일',

    // Context sources
    'context.direct': '직접 입력',
    'context.previous': '이전 회의',
    'context.file': '파일 (.txt/.md)',

    // Preset editing
    'preset.edit': '프롬프트 편집',
    'preset.save': '프리셋으로 저장',
    'preset.reset': '초기화',
    'preset.name_prompt': '프리셋 이름을 입력하세요:',

    // Prompt presets
    'settings.prompt_preset': '프롬프트 프리셋',
    'settings.prompt_preset_select': '프리셋 선택...',

    // Welcome modal
    'welcome.title': 'Meeting AI',
    'welcome.subtitle': '무엇을 하시겠습니까?',
    'welcome.quick_start': '빠른 시작',
    'welcome.quick_start_desc': '기본 설정으로 바로 녹음 시작',
    'welcome.meeting_prep': '회의 준비',
    'welcome.meeting_prep_desc': 'AI 가이드로 회의 설정',
    'welcome.search': '회의 검색',
    'welcome.search_desc': '이전 회의 검색 및 조회',

    // Meeting prep
    'prep.step_type': '어떤 종류의 회의인가요?',
    'prep.step_agenda': '오늘 안건은 무엇인가요?',
    'prep.step_time': '회의 시간은 얼마나 되나요?',
    'prep.step_attendees': '참석자를 선택해주세요',
    'prep.step_prompt': 'AI 분석에 특별 지시사항이 있나요?',
    'prep.step_standby': '회의 준비가 완료되었습니다!',
    'prep.type_general': '일반',
    'prep.type_weekly': '주간 회의',
    'prep.type_brainstorm': '브레인스토밍',
    'prep.type_sales': '영업/고객',
    'prep.type_1on1': '1:1 미팅',
    'prep.type_kickoff': '킥오프',
    'prep.skip': '건너뛰기',
    'prep.use_default': '기본 사용',
    'prep.edit_prompt': '수정',
    'prep.no_limit': '제한 없음',
    'prep.minutes': '{n}분',
    'prep.start_meeting': '회의 시작',
    'prep.save_preset': '프리셋 저장',
    'prep.edit_settings': '설정 편집',
    'prep.add_memo': '메모 작성',
    'prep.summary_type': '유형',
    'prep.summary_agenda': '안건',
    'prep.summary_time': '시간',
    'prep.summary_attendees': '참석자',
    'prep.summary_prompt': 'AI 프롬프트',
    'prep.preset_name': '프리셋 이름을 입력하세요:',
    'prep.preset_saved': '프리셋이 저장되었습니다!',
    'prep.load_preset': '프리셋 불러오기',
    'prep.or_type': '또는 직접 입력...',
    'prep.type_names': '이름을 쉼표로 구분하여 입력...',
    'prep.confirm_attendees': '확인',

    // Contacts
    'contacts.title': '연락처',
    'contacts.search': '연락처 검색...',
    'contacts.add': '연락처 추가',
    'contacts.name': '이름',
    'contacts.company': '소속',
    'contacts.no_contacts': '연락처가 없습니다.',
    'contacts.save': '저장',
    'contacts.cancel': '취소',

    // Meeting quick start
    'meeting.quick_start_title': '새 회의 시작',
    'meeting.quick_start': '빠른 시작',
    'meeting.manual_setup': '설정 후 시작',
    'toast.recording_started': '녹음이 시작되었습니다. 말씀하시면 자동으로 기록됩니다.',
    'transcript.waiting': '음성을 인식하고 있습니다...',
    'transcript.waiting_hint': '말씀하시면 자동으로 기록됩니다.',

    // Analysis countdown
    'analysis.countdown': '{n}초',
    'analysis.analyzing': '분석 중...',
    'analysis.paused': '일시정지',
    'panel.pause_analysis': '일시정지',
    'panel.resume_analysis': '재개',

    // End Meeting Modal
    'end_meeting.title': '회의 저장',
    'end_meeting.meeting_title': '회의 제목',
    'end_meeting.tags': '태그',
    'end_meeting.categories': '카테고리',
    'end_meeting.importance': '중요도',
    'end_meeting.participants': '참석자',
    'end_meeting.location': '장소',
    'end_meeting.save': '저장',
    'end_meeting.cancel': '취소',
    'end_meeting.generating': 'AI 추천 생성 중...',
    'end_meeting.add_tag': '태그 추가...',
    'end_meeting.add_participant': '이름 추가...',
    'end_meeting.no_participants': '등록된 연락처가 없습니다.',

    // Panel bookmarks
    'panel.bookmarks': '북마크',

    // Settings Data tab
    'settings.tab_data': '데이터',
    'settings.participants': '참석자',
    'settings.locations': '장소',
    'settings.categories': '카테고리',
    'settings.add': '추가',
    'settings.no_items': '항목이 없습니다.',
    'settings.placeholder_name': '이름',
    'settings.placeholder_company': '회사',
    'settings.placeholder_location': '장소 이름',
    'settings.placeholder_category': '카테고리 이름',

    // History filters
    'history.filter_all_categories': '모든 카테고리',
    'history.filter_all_ratings': '모든 별점',
    'history.filter_tag': '태그로 필터...',

    // Meeting title placeholder
    'meeting.title_placeholder': '회의 제목...',

    // Chat presets
    'settings.chat_presets': '채팅 프리셋 질문',
    'settings.chat_preset_placeholder': '프리셋 질문 입력...',
    'settings.reset_defaults': '기본값 복원',

    // Settings footer & modal
    'settings.save_settings': '저장',
    'settings.close': '닫기',
    'settings.reset_all': '전체 초기화',
    'settings.unsaved_changes': '저장되지 않은 변경사항',
    'settings.unsaved_modal_text': '저장되지 않은 변경사항이 있습니다. 어떻게 하시겠습니까?',
    'settings.save_and_close': '저장',
    'settings.discard': '저장 안 함',
    'settings.cancel': '취소',
    'settings.saved': '설정이 저장되었습니다.',
    'settings.reset_confirm': '모든 설정을 기본값으로 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
    'settings.reset_done': '모든 설정이 기본값으로 초기화되었습니다.',

    // Copy & Compare
    'panel.copy_md': '복사',
    'panel.compare': '비교',
    'toast.copied_md': '마크다운으로 복사됨!',
    'compare.title': '프롬프트 A/B 비교',
    'compare.prompt_a': '프롬프트 A',
    'compare.prompt_b': '프롬프트 B',
    'compare.run': '비교 실행',
    'compare.running': '분석 중...',
    'compare.current_prompt': '(현재 프롬프트)',
    'compare.error': '분석 실패',
    'compare.set_default': '이 프롬프트를 기본으로 설정',
    'compare.set_default_success': '프롬프트가 기본으로 설정되었습니다',
    'compare.progress_a_done': 'A ✓ / B 분석 중...',
    'compare.progress_b_done': 'A 분석 중... / B ✓',

    // Custom prompt presets
    'preset.delete_confirm': '이 프리셋을 삭제하시겠습니까?',

    // Onboarding
    'onboarding.q_name': '이름이 어떻게 되세요?',
    'onboarding.q_title': '어떤 직책을 맡고 계세요?',
    'onboarding.q_team': '어느 팀/부서에서 일하세요?',
    'onboarding.q_role': '회의에서 주로 어떤 역할이세요?',
    'onboarding.q_interests': '관심 분야가 무엇인가요?',
    'onboarding.ph_name': '예: 김철수',
    'onboarding.ph_title': '예: 프로덕트 매니저',
    'onboarding.ph_team': '예: 플랫폼팀',
    'onboarding.ph_interests': '예: UX, 백엔드 아키텍처',
    'onboarding.benefit': '5가지 질문에 답하면 회의록 품질이 크게 향상됩니다.',
    'onboarding.next': '다음',
    'onboarding.skip': '건너뛰기',
    'onboarding.skip_all': '모두 건너뛰기',
    'onboarding.role_attendee': '참석자',
    'onboarding.role_facilitator': '진행자',
    'onboarding.role_presenter': '발표자',
    'onboarding.role_observer': '관찰자',
    'onboarding.complete_title': '준비 완료!',
    'onboarding.complete_desc': 'Meeting AI는 <b>Gemini 2.0 Flash</b>로 회의를 실시간 분석하여, 요약·액션 아이템·인사이트를 제공합니다.',
    'onboarding.privacy': '\uD83D\uDD12 데이터는 이 기기에만 로컬 저장됩니다. AI 분석은 Vertex AI를 사용하며, 데이터를 학습에 사용하지 않습니다.',
    'onboarding.start': '시작하기',

    // Guards
    'guard.idle_warning': '15분간 음성이 감지되지 않았습니다. 5분 후 녹음이 자동 중지됩니다.',
    'guard.idle_auto_stopped': '20분간 음성이 없어 녹음이 자동 중지되었습니다.',
    'guard.max_duration': '6시간 경과로 녹음이 자동 중지되었습니다.',
    'guard.strategy_fallback': '회의록이 길어 이번 분석은 스마트 전략으로 전환했습니다.',
    'guard.chat_large_confirm': '회의록이 매우 깁니다 ({lines}줄). AI에 전송하시겠습니까?',

    // Misc
    'minutes': '{n}분',
    'meeting_title': '회의 {date} {time}',
  }
};

// AI-specific prompts per language (Markdown output)
const AI_PROMPTS = {
  en: `You are an expert AI meeting analyst. You MUST respond ONLY in English regardless of the transcript language.

## Core Principle: Zero Compression
- Do NOT abbreviate or omit discussed content
- Preserve specific numbers, names, dates, and technical terms exactly as mentioned
- If a previous analysis is provided, RETAIN its content in full and APPEND new discussion points

Respond in well-structured **Markdown** format. Use headings, bullet points, and bold text for clarity. Structure your analysis with the following sections (adapt freely as needed):

## Headline
One-line summary of the meeting result — focus on what was decided.

## Decisions
What was confirmed/finalized in this meeting (irreversible-level decisions).

## Summary
Chronological account of the discussion flow. For each topic: who said what, decisions made, specific numbers/examples. If a previous summary exists, retain and append. Mark [DECIDED] or [PENDING] next to each topic. (Minimum 5-10 sentences)

## Action Items
- **[Assignee]** Task description — Deadline (if known)

## Pending Issues
Items without conclusion — why unresolved, who needs to resolve them.

## Risks
Things that could become problems if missed — be specific.

## Next Steps
What to prepare before the next meeting, or agenda items for follow-up.

Rules:
- Write summary as CUMULATIVE: preserve previous content and add new discussion
- Record specific numbers, dates, names, and technical terms exactly as stated
- Describe ACTUAL content instead of abstract statements like "discussed X"
- CRITICAL: All output MUST be in English, REGARDLESS of transcript language.`,

  ko: `당신은 AI 회의 기록 전문가입니다. 회의록이 어떤 언어이든 반드시 한국어로만 응답하세요.

## 핵심 원칙: 압축 금지 (Zero Compression)
- 논의된 내용을 축약하거나 생략하지 마십시오
- 참여자가 언급한 구체적 수치, 이름, 날짜, 기술 용어를 그대로 보존하십시오
- 이전 분석 내용이 제공된 경우, 해당 내용을 그대로 유지하면서 새로운 내용을 추가하십시오

잘 구조화된 **Markdown** 형식으로 응답하세요. 제목, 불릿 포인트, 볼드체를 활용해 가독성을 높이세요. 아래 섹션을 기본으로 하되, 필요에 따라 자유롭게 조정하세요:

## 한줄 요약
회의 결과를 한 줄로 — 무엇이 결정되었는지 중심으로.

## 결정사항
이번 회의에서 확정된 것들 (번복 불가 수준의 결정).

## 회의 요약
논의 흐름을 시간순으로 상세히 기술. 각 주제별로 누가 무엇을 말했는지, 결정 내용, 구체적 수치/사례를 포함. 이전 요약이 있다면 유지하면서 새로운 논의를 추가. 각 주제에 [결정] 또는 [미결] 마커 표시. (최소 5-10문장)

## 실행 항목 (To-Do)
- **[담당자]** 할 일 — 기한 (파악 가능한 경우)

## 미결 사항
결론이 나지 않은 것들 — 왜 결론이 안 났는지, 누가 해결해야 하는지.

## 리스크
놓치면 문제될 것들 — 구체적 리스크를 서술.

## 다음 단계
다음 회의 전 준비사항 또는 다음 회의 안건.

규칙:
- 요약은 누적형으로 작성: 이전 내용을 보존하면서 새로운 논의를 추가
- 구체적 수치, 날짜, 이름, 기술 용어는 반드시 그대로 기록
- "~에 대해 논의함" 같은 추상적 요약 대신, 실제 논의된 구체적 내용을 서술
- 중요: 모든 분석 결과를 반드시 한국어로 작성하세요.`
};

// Prompt presets for quick selection
const AI_PROMPT_PRESETS = {
  en: {
    default: { name: 'Default (Comprehensive)', prompt: null },
    decision: { name: 'Decision-Focused', prompt: `You are an AI meeting analyst focused on DECISIONS. Respond in English using Markdown.

## Headline
One sentence: what was decided today.

## Key Decisions
List each decision with context and rationale.

## Action Items
- **[Owner]** Task — Deadline

## Unresolved
What still needs to be decided, and blockers.

## Risks & Dependencies
What could go wrong, what depends on what.

Rules: Be specific. Use exact numbers, names, dates. Cumulative — preserve previous content.` },
    actionItems: { name: 'Action Items Only', prompt: `You are an AI meeting assistant focused on ACTION ITEMS. Respond in English using Markdown.

## Meeting Summary
2-3 sentence overview of what was discussed.

## Action Items
For each action item:
- **[Owner]** Specific task description — **Deadline** (if mentioned)
- Priority: High/Medium/Low (infer from context)

## Blockers
Issues preventing progress on any items.

## Follow-ups Needed
Questions or topics that need follow-up.

Rules: Be specific. Include exact names, deadlines, numbers. Cumulative.` },
    brainstorm: { name: 'Brainstorm / Ideas', prompt: `You are an AI meeting analyst for BRAINSTORMING sessions. Respond in English using Markdown.

## Session Theme
What problem/topic was being brainstormed.

## Ideas Generated
Group and list all ideas discussed, with brief descriptions.

## Top Ideas
Which ideas got the most support or discussion — and why.

## Concerns Raised
Pushback, feasibility issues, or risks mentioned.

## Next Steps
How to evaluate or prototype the top ideas.

Rules: Capture ALL ideas, even brief ones. Be specific. Cumulative.` },
  },
  ko: {
    default: { name: '기본 (종합 분석)', prompt: null },
    decision: { name: '의사결정 중심', prompt: `당신은 의사결정에 집중하는 AI 회의 분석가입니다. 한국어 마크다운으로 응답하세요.

## 한줄 요약
오늘 무엇이 결정되었는지 한 문장.

## 주요 결정사항
각 결정의 내용, 배경, 근거를 정리.

## 실행 항목
- **[담당자]** 할 일 — 기한

## 미결 사항
아직 결정되지 않은 것과 그 원인.

## 리스크 & 의존성
무엇이 잘못될 수 있는지, 무엇에 의존하는지.

규칙: 구체적으로. 수치, 이름, 날짜 정확히. 누적형 작성.` },
    actionItems: { name: '액션아이템 중심', prompt: `당신은 실행 항목에 집중하는 AI 회의 어시스턴트입니다. 한국어 마크다운으로 응답하세요.

## 회의 요약
2-3문장으로 논의 개요.

## 실행 항목
각 항목별:
- **[담당자]** 구체적 업무 내용 — **기한** (언급된 경우)
- 우선순위: 높음/보통/낮음 (맥락에서 추론)

## 장애 요소
진행을 막는 이슈들.

## 후속 필요 사항
후속 조치가 필요한 질문이나 주제.

규칙: 구체적으로. 이름, 기한, 수치 정확히. 누적형 작성.` },
    brainstorm: { name: '브레인스토밍', prompt: `당신은 브레인스토밍 세션을 위한 AI 분석가입니다. 한국어 마크다운으로 응답하세요.

## 세션 주제
어떤 문제/주제를 브레인스토밍했는지.

## 제안된 아이디어
논의된 모든 아이디어를 그룹별로 정리.

## 유력 아이디어
가장 많은 지지/논의를 받은 아이디어와 그 이유.

## 제기된 우려
반대 의견, 실현 가능성 이슈, 리스크.

## 다음 단계
유력 아이디어를 평가하거나 프로토타입하는 방법.

규칙: 짧은 것도 포함해 모든 아이디어를 포착. 구체적으로. 누적형 작성.` },
  }
};

export function getPromptPresets() {
  const lang = getAiLanguage();
  return AI_PROMPT_PRESETS[lang] || AI_PROMPT_PRESETS.en;
}

const AI_PRESET_CONTEXTS = {
  en: {
    general: 'General meeting',
    weekly: 'Weekly team status meeting. Focus on progress updates, blockers, and action items.',
    brainstorm: 'Brainstorming session. Focus on ideas generated, evaluations, and next steps.',
    sales: 'Sales/client meeting. Focus on client needs, commitments, and follow-ups.',
    '1on1': '1-on-1 meeting. Focus on feedback, career development, and personal action items.',
    kickoff: 'Project kickoff meeting. Focus on goals, roles, timeline, and risks.',
    custom: '',
  },
  ko: {
    general: '일반 회의',
    weekly: '주간 팀 상황 회의. 진행 상황 업데이트, 장애 요소, 실행 항목에 집중.',
    brainstorm: '브레인스토밍 세션. 생성된 아이디어, 평가, 다음 단계에 집중.',
    sales: '영업/고객 회의. 고객 요구사항, 약속, 후속 조치에 집중.',
    '1on1': '1:1 미팅. 피드백, 경력 개발, 개인 실행 항목에 집중.',
    kickoff: '프로젝트 킥오프 회의. 목표, 역할, 일정, 리스크에 집중.',
    custom: '',
  }
};

let currentLang = 'en';
let currentAiLang = null; // null = same as UI lang

export function detectLanguage() {
  const nav = navigator.language || navigator.userLanguage || 'en';
  return nav.startsWith('ko') ? 'ko' : 'en';
}

export function setLanguage(lang) {
  currentLang = lang === 'auto' ? detectLanguage() : (lang || 'en');
  document.documentElement.lang = currentLang;
  applyTranslations();
  return currentLang;
}

export function getLanguage() {
  return currentLang;
}

export function setAiLanguage(lang) {
  currentAiLang = (lang === 'auto' || !lang) ? null : lang;
}

export function getAiLanguage() {
  return currentAiLang || currentLang;
}

export function t(key, params) {
  const lang = translations[currentLang] || translations.en;
  let text = lang[key] || translations.en[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v);
    });
  }
  return text;
}

export function getAiPrompt() {
  const lang = getAiLanguage();
  return AI_PROMPTS[lang] || AI_PROMPTS.en;
}

export function getAiPresetContext(preset) {
  const lang = getAiLanguage();
  const contexts = AI_PRESET_CONTEXTS[lang] || AI_PRESET_CONTEXTS.en;
  return contexts[preset] || '';
}

export function getDateLocale() {
  return currentLang === 'ko' ? 'ko-KR' : 'en-US';
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
}
