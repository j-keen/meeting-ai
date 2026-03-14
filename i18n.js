// i18n.js - Internationalization module

const translations = {
  en: {
    // Header
    'header.timer': '00:00:00',
    'header.theme_tooltip': 'Toggle theme (Ctrl+T)',
    'header.theme_dark': '🌙 Dark',
    'header.theme_light': '☀ Light',
    'header.history': '🔍 History',
    'header.settings': '⚙ Settings',
    'header.history_tooltip': 'Meeting history',
    'header.settings_tooltip': 'Settings',

    // Transcript panel
    'panel.transcript': 'Transcript',
    'panel.highlights': 'Highlights',
    'panel.correct': 'Correct',
    'panel.export': 'Transcript Export',
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
    'analysis_edit.hint': 'Editing analysis (Ctrl+S to save, Esc to cancel)',
    'analysis_edit.save': 'Save',
    'analysis_edit.cancel': 'Cancel',
    'block_edit.edit': 'Edit this block',
    'block_edit.hint': 'Ctrl+S save · Esc cancel',
    'block_edit.done': 'Save',
    'block_edit.cancel': 'Cancel',
    'ai.empty': 'AI analysis results will appear here.',
    'ai.empty_hint': 'Analysis runs automatically during recording.',
    'ai.waiting': 'Please wait...',
    'ai.waiting_hint': 'Auto-analyzes every {n}s during recording.',
    'ai.waiting_hint_chars': 'Auto-analyzes every {n} characters during recording.',

    // Bottom bar
    'record.label': 'Start Recording',
    'record.stop': 'STOP',
    'record.meeting_active': 'Pause',
    'record.paused': 'Resume',
    'record.status_recording': 'Recording...',
    'record.status_paused': 'Paused',
    'record.status_stopped': 'Stopped',
    'record.status_ended': 'Meeting ended - Resume or start a new meeting',
    'meeting.end_short': 'End Meeting',
    'stt.engine_label': 'Web Speech',
    'stt.unsupported': 'Web Speech API is not supported. Please use Chrome or Edge.',
    'stt.mic_permission_denied': 'Microphone permission denied. Please allow microphone access.',
    'stt.no_mic_input': 'No microphone input detected. Please check your microphone.',
    'stt.restart_failed': 'Speech recognition stopped unexpectedly. Please restart recording.',
    'stt.network_timeout': 'Cannot connect to speech recognition server. Please check your network.',
    'stt.connection_failed': 'Speech recognition keeps failing. Please check your network and restart Chrome.',
    'stt.deepgram_key_missing': 'Deepgram API key not configured. Falling back to Web Speech.',
    'stt.fallback_webspeech': 'Switching to Web Speech API.',
    'stt.mic_permission_denied_detail': 'Microphone permission denied. Tap the lock icon in the address bar → Site settings → Allow Microphone, then reload the page.',
    'stt.mic_not_found': 'No microphone found. Please connect a microphone and try again.',
    'privacy.badge': 'Private',
    'privacy.tooltip': 'All data stays local. AI analysis via Vertex AI (not used for training).',
    'privacy.proxy_hint': 'Cloud AI active — API key not required. Your data is never used for AI training.',
    'memo.placeholder': 'Add a memo... (Ctrl+M)',
    'memo.add': 'Add',
    'meeting.end': 'End Meeting',
    'meeting.resume': 'Resume',
    'meeting.export': 'Export',
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
    'settings.correction_dict': 'Correction Dictionary',
    'settings.correction_dict_hint': 'Corrections from your transcript edits are saved here and used by AI auto-correction.',
    'settings.correction_original': 'Original (STT)',
    'settings.correction_corrected': 'Corrected',
    'settings.correction_dict_open': 'Open Correction Dictionary',
    'settings.correction_dict_search': 'Search corrections...',
    'settings.correction_dict_export': 'Export',
    'settings.correction_dict_import': 'Import',
    'settings.correction_dict_imported': 'Imported {count} entries',
    'settings.correction_dict_import_error': 'Invalid file format',
    'settings.correction_dict_empty_export': 'No entries to export',
    'settings.ui_language': 'UI Language',
    'settings.ui_language_hint': 'Language shown in menus and buttons',
    'settings.ui_lang_auto': 'Auto (Browser)',
    'settings.ui_lang_en': 'English',
    'settings.ui_lang_ko': 'Korean',
    'settings.stt_hint': 'Converts your speech to text',
    'settings.stt_language_hint': 'Language spoken in the meeting',
    'settings.ai_language': 'AI Analysis Language',
    'settings.ai_language_hint': 'Language AI writes analysis results in',
    'settings.ai_lang_auto': 'Auto (Browser)',
    'settings.ai_lang_en': 'English',
    'settings.ai_lang_ko': 'Korean',
    'settings.analysis_prompt_hint': 'Instructions sent to AI for analysis',
    'settings.prompt_preset_hint': 'Pre-made instruction templates',
    'settings.chat_prompt_hint': 'Defines AI chat\'s role and behavior',
    'settings.chat_presets_hint': 'Quick question buttons shown in chat',
    'settings.contacts_hint': 'People available as meeting participants',
    'settings.locations_hint': 'Places available for meeting location',
    'settings.categories_hint': 'Tags used to classify meetings',
    'settings.correction_dict_section_hint': 'Auto-corrects speech recognition errors',

    // Context popup
    'context.edit_text': 'Edit Text',
    'context.bookmark': 'Toggle Bookmark',
    'context.delete': 'Delete',

    // Export modal
    'export.title': 'Transcript Export',
    'export.content_full': 'Full Report',
    'export.content_summary': 'Summary',
    'export.content_highlights': 'Highlights & Memos',
    'export.clipboard': 'Copy',
    'export.copied': 'Copied to clipboard!',
    'export.copy_fail': 'Failed to copy',
    'export.generating': 'Generating...',

    // History modal
    'history.title': 'Meeting History',
    'history.search': 'Title, location, transcript, summary, chat, tags...',
    'history.view': 'View',
    'history.export': 'Export',
    'history.delete': 'Delete',
    'history.no_meetings': 'No meetings found.',
    'history.untitled': 'Untitled Meeting',
    'history.load': 'Load',

    // Loaded meeting
    'loaded.banner': 'Loaded: {title}',
    'loaded.save_title': 'Save Changes?',
    'loaded.save_desc': 'This meeting has been modified. How would you like to proceed?',
    'loaded.overwrite': 'Overwrite Original',
    'loaded.save_copy': 'Save as Copy',
    'loaded.discard': 'Discard Changes',
    'loaded.no_changes': 'No changes detected. Closing.',
    'loaded.recording_block': 'Cannot record while a past meeting is loaded. Close the loaded meeting first.',
    'loaded.saved': 'Changes saved.',
    'loaded.saved_copy': 'Saved as a new copy.',
    'loaded.discarded': 'Changes discarded.',

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
    'viewer.meta_date': 'Date',
    'viewer.meta_duration': 'Duration',
    'viewer.meta_type': 'Type',
    'viewer.meta_location': 'Location',
    'viewer.meta_context': 'Context',
    'viewer.meta_tags': 'Tags',
    'viewer.chat_title': 'AI Chat',
    'viewer.memo_badge': 'MEMO',
    'viewer.load': 'Load',
    'history.add_tag': '+ tag',
    'history.enter_tag': 'Enter tag:',

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
    'toast.generating_final_minutes': 'Generating final meeting minutes...',
    'toast.final_minutes_done': 'Final meeting minutes generated.',
    'toast.final_minutes_fail': 'Failed to generate final minutes: ',
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
    'chat.regenerate': 'Regenerate',
    'chat.edit': 'Edit',
    'chat.file_unsupported': 'Unsupported file type. Please attach text files (.txt, .md, .json, etc.)',
    'chat.suggestion_1': 'Summarize the discussion so far',
    'chat.suggestion_2': 'List action items',
    'chat.suggestion_3': 'What are the key decisions?',

    // Settings tabs
    'settings.tab_general': 'General',
    'settings.tab_analysis': 'Analysis',
    'settings.tab_chat': 'Chat',

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
    'welcome.privacy_desc': 'Your data is safe.',
    'welcome.privacy_detail': 'All meeting data is stored locally on your device.<br>AI analysis is powered by Google Vertex AI,<br>which does not use your data for training.',
    'welcome.get_started': 'Get Started',

    // Meeting prep
    'prep.wizard_type': 'Type',
    'prep.wizard_agenda': 'Agenda',
    'prep.wizard_attendees': 'Attendees',
    'prep.wizard_reference': 'Reference',
    'prep.wizard_files': 'Files',
    'prep.btn_next': 'Next \u2192',
    'prep.btn_back': '\u2190 Back',
    'prep.participant_hint': 'Name/Title then space (e.g. John/Manager)',
    'prep.file_guide': 'Attach meeting materials, reference docs, or previous meeting notes.',
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
    'prep.form_title': 'Meeting Prep',
    'prep.agenda_placeholder': 'What topics will be discussed?',
    'prep.reference_meeting': 'Reference Meeting',
    'prep.files_label': 'Files',
    'prep.file_drop_hint': 'Drop files here or click to browse',
    'prep.notes_label': 'Notes',
    'prep.notes_placeholder': 'Additional notes or instructions for AI...',
    'prep.save_for_later': 'Save for Later',
    'prep.save_to_contacts': 'Save to Contacts',
    'prep.scan_card': 'Scan',
    'prep.scanning': 'Scanning...',
    'prep.scan_failed': 'Card scan failed',
    'prep.card_saved': 'Contact saved!',
    'prep.prepared_meeting': 'Prepared Meeting',
    'prep.n_participants': '{n} participants',
    'prep.prepared_saved': 'Meeting saved for later!',
    'prep.camera_permission': 'Camera permission required',
    'prep.select_preset': 'Select a preset...',
    'prep.delete_preset': 'Delete Preset',
    'prep.type_general_desc': 'Free-form meeting',
    'prep.type_weekly_desc': 'Regular weekly report',
    'prep.type_brainstorm_desc': 'Idea brainstorming',
    'prep.type_sales_desc': 'Sales/client meeting',
    'prep.type_1on1_desc': '1:1 coaching/review',
    'prep.type_kickoff_desc': 'Project kickoff',
    'prep.agenda_goal': 'What is the goal of this meeting?',
    'prep.agenda_goal_hint': 'Goals to achieve...',
    'prep.agenda_context': 'Background/context?',
    'prep.agenda_context_hint': 'Relevant background info...',
    'prep.agenda_topics': 'Key topics to discuss?',
    'prep.agenda_topics_hint': 'List main agenda items...',
    'prep.agenda_outcomes': 'Expected outcomes/decisions?',
    'prep.agenda_outcomes_hint': 'Expected decisions or conclusions...',
    'prep.photo_card': 'Photo',
    'prep.photo_upload': 'Upload image file',
    'prep.photo_camera': 'Take photo',
    'prep.find_reference': 'Find past meeting',
    'prep.ref_search_title': 'Find past meeting',
    'prep.ref_search_placeholder': 'Search by title...',
    'prep.ref_confirm': 'Select',
    'prep.ref_suggest_loading': 'Generating agenda suggestions...',
    'prep.ref_suggest_label': 'Follow-up suggestions:',
    'prep.recent_attendees': 'Recent attendees',
    'prep.group_all': 'All',
    'prep.contact_search': 'Search contacts...',
    'prep.group_select_all': 'Select All',
    'prep.add_attendee': '+ Add',
    'prep.ocr_attendee': 'Photo OCR',
    'prep.add_new_contact': 'Add new contact',
    'prep.new_contact_hint': 'Name/Title then Enter (e.g. John/Manager)',
    'prep.no_group': 'No group',
    'prep.ocr_title': 'Business card OCR',
    'prep.ocr_capture': 'Capture',
    'prep.ocr_result': 'OCR Result — Edit before adding',
    'prep.ocr_confirm': 'Add contact',
    'prep.ocr_retry': 'Retry',
    'prep.manage_group': 'Manage group',
    'prep.group_name_hint': 'Group name...',
    'prep.save_group': 'Save',
    'prep.delete_group': 'Delete',
    'prep.no_contacts': 'No contacts yet. Add one!',
    'prep.group_created': 'Group created!',
    'prep.group_saved': 'Group saved!',
    'prep.group_deleted': 'Group deleted!',
    'prep.contact_added': 'Contact added!',

    // Contacts
    'contacts.title': 'Contacts',
    'contacts.search': 'Search contacts...',
    'contacts.add': 'Add Contact',
    'contacts.name': 'Name',
    'contacts.company': 'Company',
    'contacts.no_contacts': 'No contacts yet.',
    'contacts.save': 'Save',
    'contacts.cancel': 'Cancel',


    // Analyze cooldown
    'toast.analyze_cooldown': 'Please wait before analyzing again.',

    // Meeting quick start
    'meeting.quick_start_title': 'Start a new meeting',
    'meeting.quick_start': 'Quick Start',
    'meeting.quick_start_desc': 'Start recording immediately',
    'meeting.meeting_prep': 'Meeting Prep',
    'meeting.meeting_prep_desc': 'Set up meeting details step by step',
    'meeting.meeting_search': 'Search Meetings',
    'meeting.meeting_search_desc': 'Browse past meeting records',
    'meeting.preset_start': 'Preset',
    'meeting.preset_start_desc': 'Start from saved preset',
    'meeting.no_presets': 'No presets',
    'toast.recording_started': 'Recording started. Speak to transcribe.',
    'transcript.connecting': 'Connecting to speech service...',
    'transcript.connecting_hint': 'This may take a moment on mobile networks.',
    'transcript.waiting': 'Listening for speech...',
    'transcript.waiting_hint': 'Speak and it will be transcribed automatically.',
    'stt.connected': 'Speech service connected.',

    // End Meeting Modal
    'end_meeting.title': 'Save Meeting',
    'end_meeting.meeting_title': 'Meeting Title',
    'end_meeting.tags': 'Tags',
    'end_meeting.categories': 'Categories',
    'end_meeting.importance': 'Importance',
    'end_meeting.participants': 'Participants',
    'end_meeting.location': 'Location',
    'end_meeting.datetime': 'Date / Time',
    'end_meeting.model': 'AI Model',
    'end_meeting.model_flash_desc': 'Fast',
    'end_meeting.model_pro_desc': 'High quality',
    'end_meeting.export_minutes': 'Export Minutes',
    'end_meeting.save': 'Save',
    'end_meeting.cancel': 'Cancel',
    'end_meeting.generating': 'Generating AI suggestions...',
    'end_meeting.add_tag': 'Add tag...',
    'end_meeting.add_participant': 'Add name...',
    'end_meeting.no_participants': 'No contacts registered.',

    // Minutes Generation Modal
    'minutes.title': 'Generating Meeting Minutes',
    'minutes.generating': 'AI is writing the meeting minutes...',
    'minutes.done': 'Meeting minutes generated successfully!',
    'minutes.skip': 'Skip',
    'minutes.generate': 'Generate',
    'minutes.continue_in_bg': 'Continue in background',

    // Panel bookmarks
    'panel.bookmarks': 'Bookmarks',

    // Settings Data tab
    'settings.tab_data': 'Data',
    'settings.participants': 'Participants',
    'settings.contacts_title': 'Contacts',
    'settings.scan_card': 'Scan Business Card',
    'settings.placeholder_title': 'Title/Position',
    'settings.locations': 'Locations',
    'settings.categories': 'Categories',
    'settings.add': 'Add',
    'settings.no_items': 'No items yet.',
    'settings.placeholder_name': 'Name',
    'settings.placeholder_company': 'Company',
    'settings.placeholder_location': 'Location name',
    'settings.placeholder_category': 'Category name',
    'settings.open_contacts': 'Manage Contacts',
    'settings.open_locations': 'Manage Locations',
    'settings.open_categories': 'Manage Categories',
    'settings.search_contacts': 'Search contacts...',
    'settings.click_to_edit_detail': 'Click to edit details',
    'settings.add_contacts_from_group': 'Add Contacts',

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
    'header.theme_dark': '🌙 다크',
    'header.theme_light': '☀ 라이트',
    'header.history': '🔍 지난회의검색',
    'header.settings': '⚙ 설정',
    'header.history_tooltip': '회의 기록',
    'header.settings_tooltip': '설정',

    // Transcript panel
    'panel.transcript': '녹취록',
    'panel.highlights': '하이라이트',
    'panel.correct': '교정',
    'panel.export': '녹취록 내보내기',
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
    'analysis_edit.hint': '분석 편집 중 (Ctrl+S 저장, Esc 취소)',
    'analysis_edit.save': '저장',
    'analysis_edit.cancel': '취소',
    'block_edit.edit': '이 블록 편집',
    'block_edit.hint': 'Ctrl+S 저장 · Esc 취소',
    'block_edit.done': '저장',
    'block_edit.cancel': '취소',
    'ai.empty': 'AI 분석 결과가 여기에 표시됩니다.',
    'ai.empty_hint': '녹음 중 자동으로 분석이 실행됩니다.',
    'ai.waiting': '잠시만 기다려주세요...',
    'ai.waiting_hint': '녹음 중 {n}초마다 자동으로 분석됩니다.',
    'ai.waiting_hint_chars': '녹음 중 {n}자마다 자동으로 분석됩니다.',

    // Bottom bar
    'record.label': '녹음 시작',
    'record.stop': 'STOP',
    'record.meeting_active': '일시정지',
    'record.paused': '녹음 재개',
    'record.status_recording': '녹음 중...',
    'record.status_paused': '일시정지됨',
    'record.status_stopped': '중지됨',
    'record.status_ended': '회의 종료됨 - 재개하거나 새 회의를 시작하세요',
    'meeting.end_short': '미팅 종료',
    'stt.engine_label': 'Web Speech',
    'stt.unsupported': 'Web Speech API가 지원되지 않습니다. Chrome 또는 Edge를 사용해주세요.',
    'stt.mic_permission_denied': '마이크 권한이 거부되었습니다. 마이크 접근을 허용해주세요.',
    'stt.no_mic_input': '마이크 입력이 감지되지 않습니다. 마이크를 확인해주세요.',
    'stt.restart_failed': '음성 인식이 예기치 않게 중단되었습니다. 녹음을 다시 시작해주세요.',
    'stt.network_timeout': '음성 인식 서버에 연결할 수 없습니다. 네트워크를 확인해주세요.',
    'stt.connection_failed': '음성 인식이 계속 실패합니다. 네트워크를 확인하고 Chrome을 재시작해주세요.',
    'stt.deepgram_key_missing': 'Deepgram API 키가 설정되지 않았습니다. Web Speech로 전환합니다.',
    'stt.fallback_webspeech': 'Web Speech API로 전환합니다.',
    'stt.mic_permission_denied_detail': '마이크 권한이 거부되었습니다. 주소창의 자물쇠 아이콘 → 사이트 설정 → 마이크 허용으로 변경한 후 페이지를 새로고침해주세요.',
    'stt.mic_not_found': '마이크를 찾을 수 없습니다. 마이크를 연결한 후 다시 시도해주세요.',
    'privacy.badge': '비공개',
    'privacy.tooltip': '모든 데이터는 로컬에 저장됩니다. AI 분석은 Vertex AI 경유 (학습에 사용되지 않음).',
    'privacy.proxy_hint': 'Cloud AI 활성 — API 키 없이 사용 가능. 데이터는 AI 학습에 사용되지 않습니다.',
    'memo.placeholder': '메모 추가... (Ctrl+M)',
    'memo.add': '추가',
    'meeting.end': '회의 종료',
    'meeting.resume': '재개',
    'meeting.export': '내보내기',
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
    'settings.correction_dict': '교정 사전',
    'settings.correction_dict_hint': '녹취록을 수정하면 자동으로 여기에 저장되어 AI 교정 시 참고됩니다.',
    'settings.correction_original': '원문 (STT)',
    'settings.correction_corrected': '교정문',
    'settings.correction_dict_open': '교정 사전 열기',
    'settings.correction_dict_search': '교정 항목 검색...',
    'settings.correction_dict_export': '내보내기',
    'settings.correction_dict_import': '가져오기',
    'settings.correction_dict_imported': '{count}개 항목을 가져왔습니다',
    'settings.correction_dict_import_error': '잘못된 파일 형식입니다',
    'settings.correction_dict_empty_export': '내보낼 항목이 없습니다',
    'settings.ui_language': 'UI 언어',
    'settings.ui_language_hint': '앱 화면에 표시되는 언어',
    'settings.ui_lang_auto': '자동 (브라우저)',
    'settings.ui_lang_en': 'English',
    'settings.ui_lang_ko': '한국어',
    'settings.stt_hint': '음성을 텍스트로 변환하는 설정',
    'settings.stt_language_hint': '회의에서 사용하는 언어',
    'settings.ai_language': 'AI 분석 언어',
    'settings.ai_language_hint': 'AI가 분석 결과를 작성하는 언어',
    'settings.ai_lang_auto': '자동 (브라우저)',
    'settings.ai_lang_en': 'English',
    'settings.ai_lang_ko': '한국어',
    'settings.analysis_prompt_hint': 'AI에게 보내는 분석 지시문',
    'settings.prompt_preset_hint': '미리 만들어둔 지시문 템플릿',
    'settings.chat_prompt_hint': 'AI 채팅의 역할과 성격을 정하는 지시문',
    'settings.chat_presets_hint': '채팅창에 표시되는 빠른 질문 버튼',
    'settings.contacts_hint': '회의 준비 시 참석자로 선택할 수 있는 목록',
    'settings.locations_hint': '회의 장소로 선택할 수 있는 목록',
    'settings.categories_hint': '회의 분류에 사용되는 태그',
    'settings.correction_dict_section_hint': '음성 인식 오류를 자동으로 고쳐주는 단어 목록',

    // Context popup
    'context.edit_text': '텍스트 편집',
    'context.bookmark': '북마크 토글',
    'context.delete': '삭제',

    // Export modal
    'export.title': '녹취록 내보내기',
    'export.content_full': '전체 보고서',
    'export.content_summary': '요약',
    'export.content_highlights': '하이라이트 & 메모',
    'export.clipboard': '복사',
    'export.copied': '클립보드에 복사되었습니다!',
    'export.copy_fail': '복사에 실패했습니다',
    'export.generating': '생성 중...',

    // History modal
    'history.title': '회의 기록',
    'history.search': '제목, 장소, 녹취록, 요약, 채팅, 태그 검색...',
    'history.view': '보기',
    'history.export': '내보내기',
    'history.delete': '삭제',
    'history.no_meetings': '회의 기록이 없습니다.',
    'history.untitled': '제목 없는 회의',
    'history.load': '불러오기',

    // Loaded meeting
    'loaded.banner': '불러옴: {title}',
    'loaded.save_title': '변경사항 저장',
    'loaded.save_desc': '이 회의가 수정되었습니다. 어떻게 하시겠습니까?',
    'loaded.overwrite': '원본에 덮어쓰기',
    'loaded.save_copy': '복사본으로 저장',
    'loaded.discard': '변경사항 버리기',
    'loaded.no_changes': '변경사항이 없습니다. 닫습니다.',
    'loaded.recording_block': '과거 회의가 로드된 상태에서는 녹음할 수 없습니다. 먼저 로드된 회의를 닫으세요.',
    'loaded.saved': '변경사항이 저장되었습니다.',
    'loaded.saved_copy': '새 복사본으로 저장되었습니다.',
    'loaded.discarded': '변경사항이 버려졌습니다.',

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
    'viewer.meta_date': '날짜',
    'viewer.meta_duration': '시간',
    'viewer.meta_type': '유형',
    'viewer.meta_location': '장소',
    'viewer.meta_context': '맥락',
    'viewer.meta_tags': '태그',
    'viewer.chat_title': 'AI 채팅',
    'viewer.memo_badge': '메모',
    'viewer.load': '불러오기',
    'history.add_tag': '+ 태그',
    'history.enter_tag': '태그 입력:',

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
    'toast.generating_final_minutes': '최종 회의록 생성 중...',
    'toast.final_minutes_done': '최종 회의록이 생성되었습니다.',
    'toast.final_minutes_fail': '최종 회의록 생성 실패: ',
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
    'chat.regenerate': '다시 생성',
    'chat.edit': '수정',
    'chat.file_unsupported': '지원되지 않는 파일 형식입니다. 텍스트 파일(.txt, .md, .json 등)을 사용해주세요.',
    'chat.suggestion_1': '지금까지 논의를 요약해줘',
    'chat.suggestion_2': '액션 아이템을 정리해줘',
    'chat.suggestion_3': '주요 결정사항이 뭐야?',

    // Settings tabs
    'settings.tab_general': '일반',
    'settings.tab_analysis': '분석',
    'settings.tab_chat': '채팅',

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
    'welcome.privacy_desc': '데이터가 안전합니다.',
    'welcome.privacy_detail': '모든 회의 데이터는 이 기기에만 저장됩니다.<br>AI 분석은 Google Vertex AI를 사용하며,<br>데이터를 학습에 사용하지 않습니다.',
    'welcome.get_started': '시작하기',

    // Meeting prep
    'prep.wizard_type': '유형',
    'prep.wizard_agenda': '안건',
    'prep.wizard_attendees': '참석자',
    'prep.wizard_reference': '참조',
    'prep.wizard_files': '파일',
    'prep.btn_next': '다음 \u2192',
    'prep.btn_back': '\u2190 이전',
    'prep.participant_hint': '이름/직함 입력 후 스페이스 (예: 홍길동/부장)',
    'prep.file_guide': '회의 자료, 참고 문서, 이전 회의록 등을 첨부하세요.',
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
    'prep.form_title': '회의 준비',
    'prep.agenda_placeholder': '어떤 주제를 논의하나요?',
    'prep.reference_meeting': '이전 회의 참조',
    'prep.files_label': '파일 첨부',
    'prep.file_drop_hint': '파일을 드래그하거나 클릭하여 선택',
    'prep.notes_label': '메모',
    'prep.notes_placeholder': 'AI를 위한 추가 메모나 지시사항...',
    'prep.save_for_later': '나중에 시작',
    'prep.save_to_contacts': '연락처 저장',
    'prep.scan_card': '스캔',
    'prep.scanning': '스캔 중...',
    'prep.scan_failed': '명함 스캔 실패',
    'prep.card_saved': '연락처가 저장되었습니다!',
    'prep.prepared_meeting': '준비된 회의',
    'prep.n_participants': '참석자 {n}명',
    'prep.prepared_saved': '회의가 저장되었습니다!',
    'prep.camera_permission': '카메라 권한이 필요합니다',
    'prep.select_preset': '프리셋 선택...',
    'prep.delete_preset': '프리셋 삭제',
    'prep.type_general_desc': '자유 주제 회의',
    'prep.type_weekly_desc': '정기 주간 보고',
    'prep.type_brainstorm_desc': '아이디어 발산 토론',
    'prep.type_sales_desc': '영업/고객 미팅',
    'prep.type_1on1_desc': '1:1 면담/코칭',
    'prep.type_kickoff_desc': '프로젝트 시작',
    'prep.agenda_goal': '이 회의의 목표는?',
    'prep.agenda_goal_hint': '달성해야 할 목표...',
    'prep.agenda_context': '배경/맥락은?',
    'prep.agenda_context_hint': '관련 배경 정보...',
    'prep.agenda_topics': '주요 논의할 안건은?',
    'prep.agenda_topics_hint': '주요 안건을 나열해주세요...',
    'prep.agenda_outcomes': '기대하는 결론/결정사항은?',
    'prep.agenda_outcomes_hint': '예상되는 결정이나 결론...',
    'prep.photo_card': '사진',
    'prep.photo_upload': '이미지 파일 업로드',
    'prep.photo_camera': '카메라 촬영',
    'prep.find_reference': '이전 회의 찾기',
    'prep.ref_search_title': '이전 회의 찾기',
    'prep.ref_search_placeholder': '제목으로 검색...',
    'prep.ref_confirm': '선택',
    'prep.ref_suggest_loading': '안건 제안 생성 중...',
    'prep.ref_suggest_label': '후속 안건 제안:',
    'prep.recent_attendees': '최근 참석자',
    'prep.group_all': '전체',
    'prep.contact_search': '연락처 검색...',
    'prep.group_select_all': '전체 선택',
    'prep.add_attendee': '+ 추가',
    'prep.ocr_attendee': '📷 사진 OCR',
    'prep.add_new_contact': '새 연락처 추가',
    'prep.new_contact_hint': '이름/직함 입력 후 엔터 (예: 홍길동/부장)',
    'prep.no_group': '그룹 없음',
    'prep.ocr_title': '명함 OCR',
    'prep.ocr_capture': '촬영',
    'prep.ocr_result': 'OCR 결과 — 수정 후 추가하세요',
    'prep.ocr_confirm': '연락처 추가',
    'prep.ocr_retry': '다시 시도',
    'prep.manage_group': '그룹 관리',
    'prep.group_name_hint': '그룹 이름...',
    'prep.save_group': '저장',
    'prep.delete_group': '삭제',
    'prep.no_contacts': '연락처가 없습니다. 추가해보세요!',
    'prep.group_created': '그룹이 생성되었습니다!',
    'prep.group_saved': '그룹이 저장되었습니다!',
    'prep.group_deleted': '그룹이 삭제되었습니다!',
    'prep.contact_added': '연락처가 추가되었습니다!',

    // Contacts
    'contacts.title': '연락처',
    'contacts.search': '연락처 검색...',
    'contacts.add': '연락처 추가',
    'contacts.name': '이름',
    'contacts.company': '소속',
    'contacts.no_contacts': '연락처가 없습니다.',
    'contacts.save': '저장',
    'contacts.cancel': '취소',


    // Analyze cooldown
    'toast.analyze_cooldown': '잠시 후 다시 분석해주세요.',

    // Meeting quick start
    'meeting.quick_start_title': '새 회의 시작',
    'meeting.quick_start': '빠른 시작',
    'meeting.quick_start_desc': '바로 녹음을 시작합니다',
    'meeting.meeting_prep': '회의 준비',
    'meeting.meeting_prep_desc': '단계별로 회의를 설정합니다',
    'meeting.meeting_search': '회의 검색',
    'meeting.meeting_search_desc': '지난 회의 기록을 찾아봅니다',
    'meeting.preset_start': '프리셋',
    'meeting.preset_start_desc': '저장된 프리셋으로 시작',
    'meeting.no_presets': '프리셋 없음',
    'toast.recording_started': '녹음이 시작되었습니다. 말씀하시면 자동으로 기록됩니다.',
    'transcript.connecting': '음성 서비스 연결 중...',
    'transcript.connecting_hint': '모바일 네트워크에서는 잠시 시간이 걸릴 수 있습니다.',
    'transcript.waiting': '음성을 인식하고 있습니다...',
    'transcript.waiting_hint': '말씀하시면 자동으로 기록됩니다.',
    'stt.connected': '음성 서비스에 연결되었습니다.',

    // End Meeting Modal
    'end_meeting.title': '회의 저장',
    'end_meeting.meeting_title': '회의 제목',
    'end_meeting.tags': '태그',
    'end_meeting.categories': '카테고리',
    'end_meeting.importance': '중요도',
    'end_meeting.participants': '참석자',
    'end_meeting.location': '장소',
    'end_meeting.datetime': '회의 일시',
    'end_meeting.model': 'AI 모델',
    'end_meeting.model_flash_desc': '빠름',
    'end_meeting.model_pro_desc': '고품질',
    'end_meeting.export_minutes': '회의록 내보내기',
    'end_meeting.save': '저장',
    'end_meeting.cancel': '취소',
    'end_meeting.generating': 'AI 추천 생성 중...',
    'end_meeting.add_tag': '태그 추가...',
    'end_meeting.add_participant': '이름 추가...',
    'end_meeting.no_participants': '등록된 연락처가 없습니다.',

    // Minutes Generation Modal
    'minutes.title': '회의록 작성 중',
    'minutes.generating': 'AI가 회의록을 작성하고 있습니다...',
    'minutes.done': '회의록이 성공적으로 생성되었습니다!',
    'minutes.skip': '건너뛰기',
    'minutes.generate': '생성',
    'minutes.continue_in_bg': '백그라운드에서 계속',

    // Panel bookmarks
    'panel.bookmarks': '북마크',

    // Settings Data tab
    'settings.tab_data': '데이터',
    'settings.participants': '참석자',
    'settings.contacts_title': '연락처 관리',
    'settings.scan_card': '명함 스캔',
    'settings.placeholder_title': '직함/직급',
    'settings.locations': '장소',
    'settings.categories': '카테고리',
    'settings.add': '추가',
    'settings.no_items': '항목이 없습니다.',
    'settings.placeholder_name': '이름',
    'settings.placeholder_company': '회사',
    'settings.placeholder_location': '장소 이름',
    'settings.placeholder_category': '카테고리 이름',
    'settings.open_contacts': '연락처 관리',
    'settings.open_locations': '장소 관리',
    'settings.open_categories': '카테고리 관리',
    'settings.search_contacts': '연락처 검색...',
    'settings.click_to_edit_detail': '클릭하여 편집',
    'settings.add_contacts_from_group': '연락처 추가',

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
    const val = t(key);
    if (val.includes('<')) el.innerHTML = val;
    else el.textContent = val;
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
