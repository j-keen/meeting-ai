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
    'panel.analysis_style': 'Analysis Style',
    'panel.prompt_settings': 'AI Analysis Settings',
    'analysis_edit.hint': 'Editing analysis (Ctrl+S to save, Esc to cancel)',
    'analysis_edit.save': 'Save',
    'analysis_edit.cancel': 'Cancel',
    'block_edit.edit': 'Edit this block',
    'block_edit.hint': 'Ctrl+S save · Esc cancel',
    'block_edit.done': 'Save',
    'block_edit.cancel': 'Cancel',
    'block_memo.placeholder': 'Leave a note for the next analysis...',
    'block_memo.save': 'Save memo',
    'block_memo.cancel': 'Cancel',
    'block_memo.remove': 'Remove memo',
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
    'memo.placeholder.0': 'Corrections, memos, opinions auto-reflected in AI! (Ctrl+M)',
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
    'settings.preset_copilot': 'Conversation Coach',
    'settings.preset_minutes': 'Meeting Minutes',
    'settings.preset_learning': 'Lecture Notes',
    'settings.preset_copilot_desc': 'Tells you what to say right now',
    'settings.preset_minutes_desc': 'Organizes decisions & action items',
    'settings.preset_learning_desc': 'Captures key concepts & review points',
    'settings.preset_copilot_fit': 'Client meetings, sales calls, consulting',
    'settings.preset_minutes_fit': 'Team meetings, weekly syncs, kickoffs',
    'settings.preset_learning_fit': 'Lectures, seminars, mentoring sessions',
    'settings.preset_custom': 'Custom',
    'settings.meeting_context': 'Meeting Context',
    'settings.context_placeholder': 'Describe the meeting context, goals, participants...',
    'settings.analysis_prompt': 'Analysis Prompt',
    'settings.prompt_placeholder': 'Custom analysis prompt...',
    'settings.reset_prompt': 'Reset to Default',
    'settings.preset_section': 'Analysis Presets',
    'settings.preset_section_hint': 'Choose how AI analyzes your conversations',
    'settings.custom_presets': 'Custom Presets',
    'settings.custom_presets_empty': 'No custom presets yet. Create one with AI!',
    'settings.add_custom_preset': '+ Create with AI',
    'settings.custom_preset_delete_confirm': 'Delete this custom preset?',
    'settings.custom_preset_deleted': 'Custom preset deleted!',
    'settings.preset_detail': 'Preset Details',
    'settings.preset_analysis_prompt': 'Analysis Prompt',
    'settings.preset_chat_prompt': 'Chat System Prompt',
    'settings.preset_save_changes': 'Save Changes',
    'settings.preset_changes_saved': 'Preset changes saved!',
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
    'settings.contacts_hint': 'People you can select as meeting participants',
    'settings.locations_hint': 'Places available for meeting location',
    'settings.location_name_required': 'Enter a location name first',
    'settings.location_freq_suffix': 'x',
    'settings.location_edit_name': 'Edit location name:',
    'settings.location_edit_memo': 'Edit memo:',
    'settings.location_add_memo': 'Add memo...',
    'settings.placeholder_location_memo': 'Memo (optional)',
    'settings.search_locations': 'Search locations...',
    'settings.no_search_results': 'No results found',
    'settings.click_to_edit': 'Click to edit',
    'settings.categories_hint': 'Tags used to classify meetings',
    'settings.correction_dict_section_hint': 'Auto-corrects speech recognition errors',

    // Context popup
    'context.edit_text': 'Edit Text',
    'context.bookmark': 'Toggle Bookmark',
    'context.delete': 'Delete',

    // Export modal
    'export.title': 'Transcript Export',
    'export.txt_title': 'Plain Text (.txt)',
    'export.txt_desc': 'Clean transcript only.\nGood for summaries or documents.',
    'export.srt_title': 'Subtitle (.srt)',
    'export.srt_desc': 'Includes timecodes.\nGood for video editing or captions.',
    'export.txt': 'Transcript',
    'export.srt': 'Subtitle',
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
    'history.interrupted': 'Interrupted',
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
    'loaded.resume_recording': '▶ Resume Recording',
    'loaded.resume_confirm': 'Continue recording from this meeting? New audio will be appended to the existing transcript.',
    'loaded.resume_confirm_yes': 'Resume Recording',
    'loaded.resumed': 'Resuming recording from loaded meeting.',

    // Analysis history modal
    'analysis_history.title': 'Analysis History',
    'analysis_history.empty': 'No analysis history yet.',
    'analysis_history.initial': 'Initial Analysis',
    'analysis_history.add_memo': 'Add memo...',
    'analysis_history.memo_placeholder': 'Write a memo for this analysis...',
    'analysis_history.view_detail': 'View Details',

    // Highlights modal
    'highlights.title': 'Inbox',
    'highlights.all': 'All',
    'highlights.bookmarks': 'Bookmarks',
    'highlights.memos': 'Memos',
    'highlights.empty': 'No items in your inbox yet.',
    'highlights.empty_guide': 'Press Ctrl+B to bookmark important moments, or Ctrl+M to add a memo.',
    'highlights.view_all': 'View all',
    'highlights.jump': 'Jump to line',
    'highlights.search_placeholder': 'Search inbox...',
    'highlights.item_count': '{n} items',
    'highlights.no_results': 'No results',

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
    'viewer.reanalyze': 'Re-analyze',
    'viewer.reanalyzing': 'Analyzing...',
    'viewer.reanalysis_done': 'Re-analysis complete!',
    'viewer.back_to_list': '← Back to list',
    'viewer.load_hint': 'Edit by loading',
    'viewer.load_confirm': 'Loading will replace the current meeting. Continue?',
    'viewer.prev': 'Previous meeting',
    'viewer.next': 'Next meeting',
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
    'toast.meeting_deleted': 'Moved to trash.',
    'toast.line_deleted': 'Line deleted.',
    'toast.memo_deleted': 'Memo deleted.',
    'toast.storage_high': 'Storage usage is high. Consider deleting old meetings.',
    'toast.storage_usage': 'Storage usage: {pct}%. Consider cleaning up.',
    'toast.record_fail': 'Failed to start recording: ',
    'toast.analysis_fail': 'Analysis failed: ',
    'toast.rate_limit': 'API request limit exceeded. Please wait a moment and try again.',
    'toast.slack_sent': 'Sent to Slack!',
    'toast.slack_fail': 'Failed to send to Slack: ',
    'toast.slack_no_url': 'Slack webhook URL not set.',
    'toast.correcting': 'AI correcting transcript...',
    'toast.correction_done': 'Correction complete.',
    'toast.meeting_resumed': 'Meeting resumed.',
    'confirm.delete_meeting': 'Delete this meeting?',

    // Trash
    'trash.undo': 'Undo',
    'trash.title': 'Trash',
    'trash.empty': 'Trash is empty.',
    'trash.restore': 'Restore',
    'trash.permanent_delete': 'Delete permanently',
    'trash.confirm_permanent': 'Permanently delete this meeting? This cannot be undone.',
    'trash.restored': 'Meeting restored.',
    'trash.permanently_deleted': 'Meeting permanently deleted.',
    'trash.deleted_at': 'Deleted {time}',
    'trash.select_all': 'Select all',
    'trash.restore_selected': 'Restore {n} selected',
    'trash.selected_count': '{n} selected',

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
    'md.highlights_title': '# Inbox',
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
    'chat.faq_btn': 'FAQ',
    'chat.faq_search_placeholder': 'Search questions...',
    'chat.faq_add_placeholder': 'Add new question...',
    'chat.faq_empty': 'No saved questions yet.',
    'chat.faq_no_match': 'No matching questions.',
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


    // Meeting prep
    'prep.wizard_type': 'Type',
    'prep.wizard_agenda': 'Agenda',
    'prep.wizard_attendees': 'Attendees',
    'prep.wizard_reference': 'Reference',
    'prep.wizard_files': 'Files',
    'prep.btn_next': 'Next \u2192',
    'prep.btn_back': '\u2190 Back',
    'prep.participant_hint': 'Name/Title then space (e.g. John/Manager)',
    'prep.file_guide': 'Attach reference docs, materials, or previous session notes.',
    'prep.step_type': 'What\'s the situation?',
    'prep.step_agenda': 'What\'s on the agenda today?',
    'prep.step_time': 'How long will this session be?',
    'prep.step_attendees': 'Who\'s attending?',
    'prep.step_prompt': 'Any special instructions for AI analysis?',
    'prep.step_standby': 'Session setup complete!',
    'prep.type_copilot': 'Conversation Coach',
    'prep.type_minutes': 'Meeting Minutes',
    'prep.type_learning': 'Lecture Notes',
    'prep.skip': 'Skip',
    'prep.use_default': 'Use Default',
    'prep.edit_prompt': 'Edit',
    'prep.no_limit': 'No limit',
    'prep.minutes': '{n} min',
    'prep.start_meeting': 'Start Session',
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
    'prep.form_title': 'Listen Prep',
    'prep.agenda_placeholder': 'What topics will be discussed?',
    'prep.reference_meeting': 'Reference Session',
    'prep.files_label': 'Files',
    'prep.file_drop_hint': 'Drop files here or click to browse',
    'prep.notes_label': 'Notes',
    'prep.notes_placeholder': 'Additional notes or instructions for AI...',
    'prep.save_for_later': 'Save for Later',
    'prep.save_to_contacts': 'Save to People',
    'prep.scan_card': 'Scan',
    'prep.scanning': 'Scanning...',
    'prep.scan_failed': 'Card scan failed',
    'prep.card_saved': 'Person saved!',
    'prep.prepared_meeting': 'Prepared Session',
    'prep.n_participants': '{n} participants',
    'prep.prepared_saved': 'Session saved for later!',
    'prep.camera_permission': 'Camera permission required',
    'prep.select_preset': 'Select a preset...',
    'prep.delete_preset': 'Delete Preset',
    'prep.type_copilot_desc': 'Tells you what to say right now',
    'prep.type_minutes_desc': 'Decisions & action items',
    'prep.type_learning_desc': 'Key concepts & review points',
    'prep.type_copilot_tooltip': '6-lens analysis, recommended remarks, tone mirroring, discussion tracker',
    'prep.type_minutes_tooltip': 'Summary, key discussions, decisions, action items',
    'prep.type_learning_tooltip': 'Key concepts, comprehension check, questions to explore',
    'prep.agenda_goal': 'What is the goal?',
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
    'prep.find_reference': 'Find past session',
    'prep.ref_search_title': 'Find past session',
    'prep.ref_search_placeholder': 'Search by title, tag, attendee...',
    'prep.ref_confirm': 'Select',
    'prep.ref_suggest_loading': 'Generating agenda suggestions...',
    'prep.ref_suggest_label': 'Follow-up suggestions:',
    'prep.ref_viewer_transcript': 'Transcript',
    'prep.ref_viewer_analysis': 'AI Analysis',
    'prep.ref_no_transcript': 'No transcript available.',
    'prep.ref_no_analysis': 'No analysis available.',
    'prep.ref_participants_more': 'and {n} more',
    'prep.recent_attendees': 'Recent attendees',
    'prep.group_all': 'All',
    'prep.contact_search': 'Search people...',
    'prep.group_select_all': 'Select All',
    'prep.add_attendee': '+ Add',
    'prep.ocr_attendee': 'Photo OCR',
    'prep.add_new_contact': 'Add new person',
    'prep.new_contact_hint': 'Name/Title then Enter (e.g. John/Manager)',
    'prep.no_group': 'No group',
    'prep.ocr_title': 'Business card OCR',
    'prep.ocr_capture': 'Capture',
    'prep.ocr_result': 'OCR Result — Edit before adding',
    'prep.ocr_confirm': 'Add person',
    'prep.ocr_retry': 'Retry',
    'prep.manage_group': 'Manage group',
    'prep.group_name_hint': 'Group name...',
    'prep.save_group': 'Save',
    'prep.delete_group': 'Delete',
    'prep.no_contacts': 'No people yet. Add one!',
    'prep.group_created': 'Group created!',
    'prep.group_saved': 'Group saved!',
    'prep.group_deleted': 'Group deleted!',
    'prep.contact_added': 'Person added!',

    // People
    'contacts.title': 'People',
    'contacts.search': 'Search people...',
    'contacts.add': 'Add Person',
    'contacts.name': 'Name',
    'contacts.company': 'Company',
    'contacts.no_contacts': 'No contacts yet.',
    'contacts.save': 'Save',
    'contacts.cancel': 'Cancel',


    // Analyze cooldown
    'toast.analyze_cooldown': 'Please wait before analyzing again.',

    // Session quick start
    'meeting.quick_start_title': 'Start a new session',
    'meeting.quick_start': 'Quick Start',
    'meeting.quick_start_desc': 'AI sets up for your situation',
    'meeting.meeting_prep': 'Listen Prep',
    'meeting.meeting_prep_desc': 'Deep setup, step by step',
    'meeting.meeting_search': 'Search Sessions',
    'meeting.meeting_search_desc': 'Browse past session records',
    'meeting.preset_start': 'Preset',
    'meeting.preset_start_desc': 'Start from saved preset',
    'meeting.no_presets': 'No presets',
    'meeting.ai_setup': 'Quick Start',
    'meeting.ai_setup_desc': 'AI sets up for your situation',
    'meeting.deep_setup': 'Listen Prep',
    'meeting.deep_setup_desc': 'Deep setup, step by step',
    'pb.title': 'Quick Start',
    'pb.input_placeholder': 'Tell me about your situation...',
    'pb.back_to_chat': '← Back to Chat',
    'pb.save_preset': '💾 Save as Preset',
    'pb.start': '▶ Start',
    'pb.greeting': 'What conversation are you heading into today?\nI\'ll be right beside you, catching what you might miss 💪\n\nJust give me a quick rundown!',
    'pb.or_describe': 'Or describe your situation:',
    'pb.generating': 'Setting things up for you...',
    'pb.saved': 'Saved as preset!',
    'pb.no_api': 'AI proxy not available. Please check settings.',
    'pb.card_name': 'Preset Name',
    'pb.card_description': 'Description',
    'pb.card_analysis': 'Analysis Prompt',
    'pb.card_chat': 'Chat AI Role',
    'pb.card_presets': 'Suggested Questions',
    'pb.card_memo': 'Memo Guide',
    'pb.card_context': 'Context',
    'pb.chip_work': 'Work Meeting',
    'pb.chip_consult': 'Consultation',
    'pb.chip_present': 'Presentation/Interview',
    'pb.chip_brainstorm': 'Brainstorming',
    'pb.chip_learn': 'Learning/Lecture',

    // Document Generator
    'dg.button_label': 'AI Document',
    'dg.title': 'AI Document Generator',
    'dg.input_placeholder': 'What document would you like?',
    'dg.greeting': 'What document would you like me to create from this meeting?\n\nFor example:\n• "Draft a proposal"\n• "Write an email draft"\n• "Organize as a report"\n\nJust tell me the format!',
    'dg.chip_email': 'Email',
    'dg.chip_proposal': 'Proposal',
    'dg.chip_report': 'Report',
    'dg.chip_action_list': 'Action List',
    'dg.chip_summary_mail': 'Summary Email',
    'dg.chip_followup': 'Follow-up Email',
    'dg.back_to_chat': '← Back to Chat',
    'dg.new_doc': '+ New Document',
    'dg.copy': 'Copy',
    'dg.copied': 'Copied!',
    'dg.download_md': 'MD',
    'dg.download_docx': 'Word',
    'dg.download_pdf': 'PDF',
    'dg.save': 'Save',
    'dg.saved': 'Document saved!',
    'dg.no_api': 'API proxy not available. Please check settings.',
    'dg.no_meeting': 'No meeting data available.',

    // Deep Setup
    'ds.title': 'Listen Prep',
    'ds.step1': 'Basic Info',
    'ds.step2': 'Context',
    'ds.step3': 'AI Setup',
    'ds.step4': 'Ready',
    'ds.step1_desc': 'Enter basic meeting info.',
    'ds.step2_desc': 'Add a brief description, reference meetings, or files.',
    'ds.step2_skip': 'Skip',
    'ds.step3_greeting': 'Analyzing your meeting info...',
    'ds.step3_context_card': 'What AI knows',
    'ds.step4_title': 'Ready to go!',
    'ds.btn_start': '▶ Start',
    'ds.btn_save_preset': '💾 Save as Preset',
    'ds.btn_edit': '← Edit',
    'ds.chip_skip': 'Skip',
    'ds.summary_situation': 'Situation',
    'ds.summary_attendees': 'Attendees',
    'ds.summary_focus': 'Focus Points',
    'ds.summary_datetime': 'Date & Time',
    'ds.summary_location': 'Location',
    'ds.summary_description': 'Description',
    'ds.summary_links': 'Linked Meetings',
    'ds.datetime': 'Date & Time',
    'ds.location': 'Location',
    'ds.location_placeholder': 'Search or enter location',
    'ds.attendees': 'Attendees',
    'ds.description': 'One-line description',
    'ds.description_placeholder': 'What is this meeting about?',
    'ds.ref_meetings': 'Reference Meetings',
    'ds.files': 'Files',
    // Meeting Links
    'link.title': 'Linked Meetings',
    'link.add': '+ Link',
    'link.search_placeholder': 'Search meetings to link...',
    'link.empty': 'No linked meetings',
    'link.unlink_confirm': 'Unlink this meeting?',

    // Analysis Style Modal
    'panel.analysis_style': 'Change Analysis Style',
    'asm.title': 'Change Analysis Style',
    'asm.presets_title': 'Saved Analysis Styles',
    'asm.presets_desc': 'Switch between built-in and custom styles',
    'asm.save_style': 'Save this style',
    'asm.ai_chat_label': 'Change direction with AI',
    'asm.ai_chat_desc': 'Not happy with the current analysis?',
    'asm.history_label': 'Analysis History',
    'asm.history_desc': 'Browse previous analysis results',
    'asm.saved_styles': 'Saved Styles',
    'asm.history_empty': 'No analysis results yet',
    'panel.copy_md_title': 'Copy as Markdown',
    'panel.analyze_title': 'Analyze now',

    // Prompt Adjuster
    'panel.prompt_adjust': 'Change Style',
    'pa.title': 'Change Analysis Style',
    'pa.input_placeholder': 'e.g., More concise, focus on action items...',
    'pa.greeting': 'What would you like to change about the AI analysis?\nFor example: "Too long", "Focus on key points", "Add sentiment analysis" — just tell me!',
    'pa.saved': 'Prompt updated!',
    'pa.reanalyzing': 'Re-analyzing with updated prompt...',
    'sh.title': 'Style History',
    'sh.current': 'Current Style',
    'sh.view_full': 'View full prompt',
    'sh.empty': 'No style change history yet.',
    'sh.restore': 'Restore',
    'sh.restore_reanalyze': 'Restore + Re-analyze',
    'sh.view': 'View prompt',
    'sh.delete': 'Delete',
    'sh.clear_all': 'Clear all history',
    'sh.back': 'Back',
    'preset_save.name_placeholder': 'Preset name',
    'preset_save.desc_placeholder': 'Brief description (optional)',
    'preset_save.save': 'Save',
    'preset_save.cancel': 'Cancel',
    'preset_save.success': 'Saved as preset!',
    'preset_save.name_required': 'Please enter a name',
    'preset_save.btn_tooltip': 'Save as preset',
    'toast.recording_started': 'Recording started. Speak to transcribe.',
    'transcript.connecting': 'Connecting to speech service...',
    'transcript.connecting_hint': 'This may take a moment on mobile networks.',
    'transcript.waiting': 'Listening for speech...',
    'transcript.waiting_hint': 'Speak and it will be transcribed automatically.',
    'transcript.idle': 'Ready to record',
    'transcript.idle_hint': 'Press the record button to start.',
    'ai.idle': 'Waiting for session',
    'ai.idle_hint': 'Start recording to enable AI analysis.',
    'chat.idle': 'Chat ready',
    'chat.idle_hint': 'Start a session to ask AI about your meeting.',
    'stt.connected': 'Speech service connected.',

    // End Meeting Modal
    'end_meeting.title': 'Save Meeting',
    'end_meeting.edit_title': 'Edit Meeting Info',
    'end_meeting.edit_info_btn': 'Save Info',
    'end_meeting.meeting_title': 'Meeting Title',
    'end_meeting.tags': 'Tags',
    'end_meeting.categories': 'Categories',
    'end_meeting.importance': 'Importance',
    'end_meeting.participants': 'Participants',
    'end_meeting.location': 'Location',
    'end_meeting.location_placeholder': 'Search or add location...',
    'end_meeting.recent_locations': 'Recent',
    'end_meeting.all_locations': 'All Locations',
    'end_meeting.add_location': 'Add',
    'end_meeting.datetime': 'Date / Time',
    'end_meeting.export_minutes': 'Export Minutes',
    'end_meeting.view_minutes': 'View Minutes',
    'end_meeting.export_transcript': 'Export Transcript',
    'end_meeting.export_generating': 'Generating minutes...',
    'end_meeting.generate_minutes': 'Generate Minutes',
    'end_meeting.save': 'Save',
    'end_meeting.cancel': 'Cancel',
    'end_meeting.title_hint': 'Select an AI suggestion or type your own',
    'end_meeting.title_generating': 'Generating suggestions...',
    'end_meeting.title_error': 'Failed to generate suggestions',
    'end_meeting.retry': 'Retry',
    'end_meeting.tags_generating': 'Generating tag suggestions...',
    'end_meeting.tags_error': 'Failed to generate tags',
    'end_meeting.title_placeholder': 'Enter meeting title',
    'end_meeting.add_tag': 'Add tag...',
    'end_meeting.add_participant': 'Add name...',
    'end_meeting.search_participant': 'Search name...',
    'end_meeting.tab_search': 'Search',
    'end_meeting.tab_register': 'Register',
    'end_meeting.participant_title': 'Title',
    'end_meeting.no_participants': 'No people registered.',
    'end_meeting.contacts': 'People',
    'end_meeting.recent_tags': 'Recent',
    'minutes_model.title': 'Select AI Model',
    'end_meeting.flash_desc': 'Fast and lightweight',
    'end_meeting.pro_desc': 'Detailed and precise',
    'end_meeting.minutes_quality': 'Minutes Quality',
    'end_meeting.generating_minutes': 'Generating minutes...',
    'end_meeting.close_background': 'Close (continue in background)',
    'end_meeting.minutes_complete': 'Minutes complete!',
    'end_meeting.minutes_error': 'Minutes generation failed',
    'end_meeting.close': 'Close',
    'end_meeting.saving': 'Saving...',
    'end_meeting.edit_saved': 'Meeting info updated!',
    'end_meeting.last_modified': 'Last modified',
    'end_meeting.save_complete': 'Meeting saved!',
    'end_meeting.post_view_minutes': 'View Minutes',
    'end_meeting.post_export': 'Export',
    'end_meeting.post_edit': 'Edit Info',
    'end_meeting.post_resume': 'Resume Meeting',
    'end_meeting.post_new': 'New Meeting',
    'end_meeting.post_close': 'Close',

    // Minutes Generation Modal
    'minutes.select_quality': 'Select Minutes Quality',
    'minutes.flash_desc': 'Summary',
    'minutes.flash_sub': 'Just the essentials',
    'minutes.pro_desc': 'In-depth',
    'minutes.pro_sub': 'Catches what you missed',
    'minutes.pro_usage': 'Used {n} times this month',
    'minutes.skip': 'Skip minutes',
    'minutes_preview.title': 'Meeting Minutes',
    'minutes_preview.prompt_edit': 'Change Minutes Style',
    'minutes_preview.export': 'Export',
    'minutes_preview.prev_versions': 'Versions',
    'minutes_preview.version_restore': 'Restore',
    'minutes_preview.prompt_reference': 'Reference Style',
    'minutes_preview.prompt_reference_hint': 'Paste reference minutes here. We\u2019ll generate in a similar format.',
    'minutes_preview.prompt_base': 'Base Prompt',
    'minutes_preview.prompt_instruction': 'User Instruction',
    'minutes_preview.prompt_instruction_hint': 'e.g., "Summarize key decisions", "Create action items table by attendee"',
    'minutes_preview.save_preset': 'Save Preset',
    'minutes_preview.delete_preset': 'Delete',
    'minutes_preview.preset_delete_confirm': 'Delete this preset?',
    'minutes_preview.preset_deleted': 'Preset deleted',
    'minutes_preview.preset_name': 'Preset name:',
    'minutes_preview.preset_saved': 'Preset saved',
    'minutes_preview.preset_select': 'Select preset',
    'minutes_preview.reset_default': 'Reset',
    'minutes_preview.apply': 'Apply',
    'minutes_preview.more_detail': 'More Detail',
    'minutes_preview.summarize': 'Summarize',
    'minutes_preview.custom_placeholder': 'Custom instruction...',
    'minutes_preview.section_refined': 'Section updated',
    'minutes_preview.section_refine_fail': 'Failed to refine:',
    'minutes_preview.regenerate': 'Regenerate',
    'minutes_preview.regen_confirm': 'Confirm',
    'minutes_preview.regen_title': 'Regenerate Minutes',
    'minutes_preview.regen_flash_desc': 'Fast and lightweight',
    'minutes_preview.regen_pro_desc': 'Detailed and precise',
    'minutes_preview.generated_with': 'Generated with {model}',
    'toast.minutes_generating_bg': 'Generating minutes in the background',
    'toast.minutes_still_generating': 'Still generating...',

    // Panel inbox
    'panel.inbox': 'Inbox',

    // Settings Data tab
    'settings.tab_data': 'Data',
    'settings.participants': 'Participants',
    'settings.contacts_title': 'People',
    'settings.contacts_tab_add': 'Add',
    'settings.contacts_tab_search': 'Search',
    'settings.scan_card': 'Scan Business Card',
    'settings.scan_card_btn': 'Scan Card',
    'settings.drop_card_hint': 'or click below to upload',
    'settings.card_queue_waiting': 'Waiting...',
    'settings.card_queue_processing': 'Scanning...',
    'settings.card_queue_done': 'Scanned',
    'settings.card_queue_error': 'Failed',
    'settings.card_queue_saved': 'Saved!',
    'settings.card_save_all': 'Save All',
    'settings.contacts_import': 'Import People',
    'settings.export_csv': 'Export People',
    'settings.contacts_imported': 'people imported',
    'settings.starred_only': 'Show starred only',
    'settings.placeholder_title': 'Title/Position',
    'settings.locations': 'Locations',
    'settings.categories': 'Categories',
    'settings.add': 'Add',
    'settings.no_items': 'No items yet.',
    'settings.placeholder_name': 'Name',
    'settings.placeholder_company': 'Company',
    'settings.placeholder_location': 'Location name',
    'settings.placeholder_category': 'Category name',
    'settings.category_hint_placeholder': 'AI hint for this category (optional)',
    'settings.open_contacts': 'Manage People',
    'settings.open_locations': 'Manage Locations',
    'settings.open_categories': 'Manage Categories',
    'settings.search_contacts': 'Search people...',
    'settings.search_filter_all': 'All',
    'settings.click_to_edit_detail': 'Click to edit details',
    'settings.toggle_star': 'Toggle favorite',
    'settings.drop_card_image': 'Drop business card image here',
    'settings.add_contacts_from_group': 'Add People',

    // History filters
    'history.filter_all_categories': 'All Categories',
    'history.filter_all_ratings': 'All Ratings',
    'history.filter_tag': 'Filter by tag...',

    // Sort options
    'history.sort_newest': 'Newest first',
    'history.sort_oldest': 'Oldest first',
    'history.sort_rating': 'Highest rated',
    'history.sort_duration': 'Longest',
    'history.sort_title': 'Title A-Z',

    // Relative time
    'history.time_just_now': 'Just now',
    'history.time_minutes_ago': '{n}m ago',
    'history.time_hours_ago': '{n}h ago',
    'history.time_days_ago': '{n}d ago',
    'history.time_weeks_ago': '{n}w ago',
    'history.time_months_ago': '{n}mo ago',

    // Group headers
    'history.group_today': 'Today',
    'history.group_yesterday': 'Yesterday',
    'history.group_this_week': 'This week',
    'history.group_this_month': 'This month',
    'history.group_older': 'Older',

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
    'toast.empty_meeting': 'Nothing to save — no transcript, memos, or chats yet.',

    'end_meeting.stat_duration': 'Duration',
    'end_meeting.stat_transcript': 'Transcript lines',
    'end_meeting.stat_bookmarks': 'Bookmarks',
    'end_meeting.stat_memos': 'Memos',
    'end_meeting.stat_analyses': 'Analyses',
    'end_meeting.stat_chats': 'Chats',

    // End meeting confirmation (30min+)
    'end_confirm.message': 'End this meeting?',
    'end_confirm.stats': '{duration} · {lines} transcript lines',
    'end_confirm.cancel': 'Cancel',
    'end_confirm.confirm': 'End Meeting',

    // Draft recovery
    'draft.recovery_message': 'Unsaved meeting found (last saved {time}, {lines} lines). Recover?',
    'draft.crash_recovery_message': 'A meeting was interrupted (last saved {time}, {lines} lines). Resume?',
    'draft.recover': 'Resume',
    'draft.save_and_end': 'Save & End',
    'draft.discard': 'Discard',
    'draft.recovered_status': 'Recovered from draft',
    'draft.crash_recovered_status': 'Recovered after interruption',
    'toast.draft_recovered': 'Meeting recovered from draft.',
    'toast.crash_recovered': 'Meeting recovered after interruption. Tap record to resume.',

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

    // Import (P-4 + P-6)
    'import.launcher_label': 'Import',
    'import.launcher_desc': 'Paste text or upload audio',
    'import.title': 'Import Transcript',
    'import.tab_text': 'Paste Text',
    'import.tab_audio': 'Upload Audio',
    'import.text_placeholder': 'Paste transcript here...\n\nSupported formats:\n- Plain text (one line per sentence)\n- Timestamped: [00:00] Text here\n- With speakers: Speaker A: Text here',
    'import.drop_hint': 'Drop audio file here or click to browse',
    'import.language': 'Language',
    'import.transcribing': 'Transcribing...',
    'import.transcribe': 'Transcribe',
    'import.cancel': 'Cancel',
    'import.confirm': 'Import & Analyze',
    'import.stats': '{lines} lines, {chars} characters',
    'import.empty_text': 'Please paste some text to import.',
    'import.text_success': 'Imported {lines} lines',
    'import.upload_success': 'Transcribed {lines} lines',
    'import.file_too_large': 'File too large (max 4.5MB)',
    'import.no_speech': 'No speech detected in the audio.',
    'import.transcribe_error': 'Transcription failed',
    'import.status_imported': 'Imported transcript',
    'import.status_uploaded': 'Audio transcript',

    // History badges (P-4/P-6)
    'history.imported': 'Imported',
    'history.audio_import': 'Audio Import',
    'history.has_audio': 'Has audio recording',

    // Audio recording (P-5)
    'settings.audio_recording': 'Audio Recording',
    'settings.audio_toggle': 'Save original audio with transcript',
    'settings.audio_retention': 'Auto-cleanup',
    'settings.audio_7days': '7 days',
    'settings.audio_30days': '30 days',
    'settings.audio_90days': '90 days',
    'settings.audio_never': 'Never',
    'settings.audio_storage_hint': 'Saved in browser storage (IndexedDB). Cleared if browser data is deleted.',
    'settings.audio_storage_info': '{count} recordings · {size} MB',
    'settings.audio_no_recordings': 'No recordings stored',
    'settings.audio_storage_unavailable': 'Browser storage not available',
    'settings.audio_delete_all': 'Delete All Recordings',
    'settings.audio_delete_confirm': 'Delete all saved audio recordings? This cannot be undone.',
    'settings.audio_deleted': 'Deleted {n} recordings',
    'settings.audio_delete_error': 'Failed to delete recordings',
    'viewer.download_audio': 'Download audio',
    'viewer.click_to_seek': 'Click timestamp to seek',
    'end_meeting.download_audio': 'Download Recording',
    'end_meeting.audio_warn_days': 'Download recommended — auto-deleted after {days} days',
    'end_meeting.audio_warn_manual': 'Download recommended — stored in browser only',
    'end_meeting.audio_not_found': 'Recording not found',
    'end_meeting.audio_downloaded': 'Downloaded',
    'end_meeting.audio_download_error': 'Download failed',
    'end_meeting.audio_auto_download_notice': 'Will auto-download when saved',
    'settings.audio_auto_download': 'Auto-download on save',

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
    'panel.analysis_style': '분석 스타일',
    'panel.prompt_settings': 'AI 분석 설정',
    'analysis_edit.hint': '분석 편집 중 (Ctrl+S 저장, Esc 취소)',
    'analysis_edit.save': '저장',
    'analysis_edit.cancel': '취소',
    'block_edit.edit': '이 블록 편집',
    'block_edit.hint': 'Ctrl+S 저장 · Esc 취소',
    'block_edit.done': '저장',
    'block_edit.cancel': '취소',
    'block_memo.placeholder': '다음 분석을 위한 메모를 남겨주세요...',
    'block_memo.save': '메모 저장',
    'block_memo.cancel': '취소',
    'block_memo.remove': '메모 삭제',
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
    'memo.placeholder.0': '녹취 수정, 메모, 의견을 입력하면 AI에 자동 반영! (Ctrl+M)',
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
    'settings.preset_copilot': '대화 코치',
    'settings.preset_minutes': '회의록 정리',
    'settings.preset_learning': '강의 노트',
    'settings.preset_copilot_desc': '지금 뭘 말할지 알려드려요',
    'settings.preset_minutes_desc': '결정사항과 액션 아이템을 정리해요',
    'settings.preset_learning_desc': '핵심 개념과 복습 포인트를 잡아줘요',
    'settings.preset_copilot_fit': '클라이언트 미팅, 세일즈콜, 상담/컨설팅',
    'settings.preset_minutes_fit': '팀 회의, 주간 회의, 킥오프',
    'settings.preset_learning_fit': '강의, 세미나, 자문, 멘토링',
    'settings.preset_custom': '사용자 정의',
    'settings.meeting_context': '회의 배경',
    'settings.context_placeholder': '회의 배경, 목표, 참석자를 설명하세요...',
    'settings.analysis_prompt': '분석 프롬프트',
    'settings.prompt_placeholder': '사용자 정의 분석 프롬프트...',
    'settings.reset_prompt': '기본값으로 초기화',
    'settings.preset_section': '분석 프리셋',
    'settings.preset_section_hint': 'AI가 대화를 분석하는 방식을 선택하세요',
    'settings.custom_presets': '커스텀 프리셋',
    'settings.custom_presets_empty': '아직 커스텀 프리셋이 없습니다. AI로 만들어보세요!',
    'settings.add_custom_preset': '+ AI로 새 프리셋 만들기',
    'settings.custom_preset_delete_confirm': '이 커스텀 프리셋을 삭제하시겠습니까?',
    'settings.custom_preset_deleted': '커스텀 프리셋이 삭제되었습니다!',
    'settings.preset_detail': '프리셋 상세',
    'settings.preset_analysis_prompt': '분석 프롬프트',
    'settings.preset_chat_prompt': '채팅 시스템 프롬프트',
    'settings.preset_save_changes': '변경사항 저장',
    'settings.preset_changes_saved': '프리셋 변경사항이 저장되었습니다!',
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
    'settings.contacts_hint': '회의 참석자로 선택할 수 있는 인물 목록',
    'settings.locations_hint': '회의 장소로 선택할 수 있는 목록',
    'settings.location_name_required': '장소 이름을 먼저 입력하세요',
    'settings.location_freq_suffix': '회',
    'settings.location_edit_name': '장소 이름 수정:',
    'settings.location_edit_memo': '메모 수정:',
    'settings.location_add_memo': '메모 추가...',
    'settings.placeholder_location_memo': '메모 (선택)',
    'settings.search_locations': '장소 검색...',
    'settings.no_search_results': '검색 결과가 없습니다',
    'settings.click_to_edit': '클릭하여 수정',
    'settings.categories_hint': '회의 분류에 사용되는 태그',
    'settings.correction_dict_section_hint': '음성 인식 오류를 자동으로 고쳐주는 단어 목록',

    // Context popup
    'context.edit_text': '텍스트 편집',
    'context.bookmark': '북마크 토글',
    'context.delete': '삭제',

    // Export modal
    'export.title': '녹취록 내보내기',
    'export.txt_title': '일반 텍스트 (.txt)',
    'export.txt_desc': '대화 내용만 깔끔하게 저장합니다.\n문서 요약이나 텍스트 작업에 적합해요.',
    'export.srt_title': '시간 자막 (.srt)',
    'export.srt_desc': '타임코드(시간 정보)가 포함됩니다.\n영상 편집 및 자막 프로그램용입니다.',
    'export.txt': '녹취록',
    'export.srt': '자막 파일',
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
    'history.interrupted': '미완료',
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
    'loaded.resume_recording': '▶ 이어서 녹음',
    'loaded.resume_confirm': '이 미팅에서 이어서 녹음할까요? 새로운 음성이 기존 대화록에 추가됩니다.',
    'loaded.resume_confirm_yes': '이어서 녹음',
    'loaded.resumed': '이전 미팅에서 이어서 녹음합니다.',

    // Analysis history modal
    'analysis_history.title': '분석 기록',
    'analysis_history.empty': '분석 기록이 없습니다.',
    'analysis_history.initial': '초기 분석',
    'analysis_history.add_memo': '메모 추가...',
    'analysis_history.memo_placeholder': '이 분석에 대한 메모를 작성하세요...',
    'analysis_history.view_detail': '상세 보기',

    // Highlights modal
    'highlights.title': '인박스',
    'highlights.all': '전체',
    'highlights.bookmarks': '북마크',
    'highlights.memos': '메모',
    'highlights.empty': '인박스가 비어있습니다.',
    'highlights.empty_guide': 'Ctrl+B로 중요 순간을 북마크하거나, Ctrl+M으로 메모를 남겨보세요.',
    'highlights.view_all': '전체 보기',
    'highlights.jump': '해당 줄로 이동',
    'highlights.search_placeholder': '인박스 검색...',
    'highlights.item_count': '{n}개 항목',
    'highlights.no_results': '결과 없음',

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
    'viewer.reanalyze': '재분석',
    'viewer.reanalyzing': '분석 중...',
    'viewer.reanalysis_done': '재분석이 완료되었습니다!',
    'viewer.back_to_list': '← 목록으로',
    'viewer.load_hint': '편집하려면 불러오기',
    'viewer.load_confirm': '현재 회의를 대체하고 이 회의를 불러옵니다. 계속하시겠습니까?',
    'viewer.prev': '이전 회의',
    'viewer.next': '다음 회의',
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
    'toast.meeting_deleted': '휴지통으로 이동했습니다.',
    'toast.line_deleted': '라인이 삭제되었습니다.',
    'toast.memo_deleted': '메모가 삭제되었습니다.',
    'toast.storage_high': '저장 공간이 부족합니다. 오래된 회의를 삭제해 주세요.',
    'toast.storage_usage': '저장 공간 사용량: {pct}%. 정리를 권장합니다.',
    'toast.record_fail': '녹음 시작 실패: ',
    'toast.analysis_fail': '분석 실패: ',
    'toast.rate_limit': 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    'toast.slack_sent': 'Slack으로 전송 완료!',
    'toast.slack_fail': 'Slack 전송 실패: ',
    'toast.slack_no_url': 'Slack webhook URL이 설정되지 않았습니다.',
    'toast.correcting': 'AI가 회의록을 교정 중...',
    'toast.correction_done': '교정이 완료되었습니다.',
    'toast.meeting_resumed': '회의가 재개되었습니다.',
    'confirm.delete_meeting': '이 미팅을 삭제하시겠습니까?',

    // Trash
    'trash.undo': '되돌리기',
    'trash.title': '휴지통',
    'trash.empty': '휴지통이 비어있습니다.',
    'trash.restore': '복원',
    'trash.permanent_delete': '영구 삭제',
    'trash.confirm_permanent': '이 미팅을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
    'trash.restored': '미팅이 복원되었습니다.',
    'trash.permanently_deleted': '미팅이 영구 삭제되었습니다.',
    'trash.deleted_at': '{time} 삭제됨',
    'trash.select_all': '전체 선택',
    'trash.restore_selected': '{n}개 복원',
    'trash.selected_count': '{n}개 선택됨',

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
    'md.highlights_title': '# 인박스',
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
    'chat.faq_btn': '자주 쓰는 질문',
    'chat.faq_search_placeholder': '질문 검색...',
    'chat.faq_add_placeholder': '새 질문 추가...',
    'chat.faq_empty': '저장된 질문이 없습니다.',
    'chat.faq_no_match': '일치하는 질문이 없습니다.',
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


    // Meeting prep
    'prep.wizard_type': '유형',
    'prep.wizard_agenda': '안건',
    'prep.wizard_attendees': '참석자',
    'prep.wizard_reference': '참조',
    'prep.wizard_files': '파일',
    'prep.btn_next': '다음 \u2192',
    'prep.btn_back': '\u2190 이전',
    'prep.participant_hint': '이름/직함 입력 후 스페이스 (예: 홍길동/부장)',
    'prep.file_guide': '참고 자료, 문서, 이전 세션 기록 등을 첨부하세요.',
    'prep.step_type': '어떤 상황인가요?',
    'prep.step_agenda': '오늘 안건은 무엇인가요?',
    'prep.step_time': '세션 시간은 얼마나 되나요?',
    'prep.step_attendees': '참석자를 선택해주세요',
    'prep.step_prompt': 'AI 분석에 특별 지시사항이 있나요?',
    'prep.step_standby': '세션 준비가 완료되었습니다!',
    'prep.type_copilot': '대화 코치',
    'prep.type_minutes': '회의록 정리',
    'prep.type_learning': '강의 노트',
    'prep.skip': '건너뛰기',
    'prep.use_default': '기본 사용',
    'prep.edit_prompt': '수정',
    'prep.no_limit': '제한 없음',
    'prep.minutes': '{n}분',
    'prep.start_meeting': '세션 시작',
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
    'prep.form_title': '경청 준비',
    'prep.agenda_placeholder': '어떤 주제를 논의하나요?',
    'prep.reference_meeting': '이전 세션 참조',
    'prep.files_label': '파일 첨부',
    'prep.file_drop_hint': '파일을 드래그하거나 클릭하여 선택',
    'prep.notes_label': '메모',
    'prep.notes_placeholder': 'AI를 위한 추가 메모나 지시사항...',
    'prep.save_for_later': '나중에 시작',
    'prep.save_to_contacts': '인물 저장',
    'prep.scan_card': '스캔',
    'prep.scanning': '스캔 중...',
    'prep.scan_failed': '명함 스캔 실패',
    'prep.card_saved': '인물이 저장되었습니다!',
    'prep.prepared_meeting': '준비된 세션',
    'prep.n_participants': '참석자 {n}명',
    'prep.prepared_saved': '세션이 저장되었습니다!',
    'prep.camera_permission': '카메라 권한이 필요합니다',
    'prep.select_preset': '프리셋 선택...',
    'prep.delete_preset': '프리셋 삭제',
    'prep.type_copilot_desc': '지금 뭘 말할지 알려드려요',
    'prep.type_minutes_desc': '결정사항과 액션 아이템',
    'prep.type_learning_desc': '핵심 개념과 복습 포인트',
    'prep.type_copilot_tooltip': '6렌즈 분석, 추천 멘트, 톤 미러링, 논의 트래커',
    'prep.type_minutes_tooltip': '요약, 주요 논의, 결정 사항, 액션 아이템',
    'prep.type_learning_tooltip': '핵심 개념, 이해도 체크, 탐구 질문',
    'prep.agenda_goal': '목표는 무엇인가요?',
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
    'prep.find_reference': '이전 세션 찾기',
    'prep.ref_search_title': '이전 세션 찾기',
    'prep.ref_search_placeholder': '제목, 태그, 참석자 검색...',
    'prep.ref_confirm': '선택',
    'prep.ref_suggest_loading': '안건 제안 생성 중...',
    'prep.ref_suggest_label': '후속 안건 제안:',
    'prep.ref_viewer_transcript': '회의록',
    'prep.ref_viewer_analysis': 'AI 분석',
    'prep.ref_no_transcript': '회의록이 없습니다.',
    'prep.ref_no_analysis': '분석 내용이 없습니다.',
    'prep.ref_participants_more': '외 {n}명',
    'prep.recent_attendees': '최근 참석자',
    'prep.group_all': '전체',
    'prep.contact_search': '인물 검색...',
    'prep.group_select_all': '전체 선택',
    'prep.add_attendee': '+ 추가',
    'prep.ocr_attendee': '📷 사진 OCR',
    'prep.add_new_contact': '새 인물 추가',
    'prep.new_contact_hint': '이름/직함 입력 후 엔터 (예: 홍길동/부장)',
    'prep.no_group': '그룹 없음',
    'prep.ocr_title': '명함 OCR',
    'prep.ocr_capture': '촬영',
    'prep.ocr_result': 'OCR 결과 — 수정 후 추가하세요',
    'prep.ocr_confirm': '인물 추가',
    'prep.ocr_retry': '다시 시도',
    'prep.manage_group': '그룹 관리',
    'prep.group_name_hint': '그룹 이름...',
    'prep.save_group': '저장',
    'prep.delete_group': '삭제',
    'prep.no_contacts': '등록된 인물이 없습니다. 추가해보세요!',
    'prep.group_created': '그룹이 생성되었습니다!',
    'prep.group_saved': '그룹이 저장되었습니다!',
    'prep.group_deleted': '그룹이 삭제되었습니다!',
    'prep.contact_added': '인물이 추가되었습니다!',

    // People (인물 목록)
    'contacts.title': '인물 목록',
    'contacts.search': '인물 검색...',
    'contacts.add': '인물 추가',
    'contacts.name': '이름',
    'contacts.company': '소속',
    'contacts.no_contacts': '연락처가 없습니다.',
    'contacts.save': '저장',
    'contacts.cancel': '취소',


    // Analyze cooldown
    'toast.analyze_cooldown': '잠시 후 다시 분석해주세요.',

    // 세션 시작
    'meeting.quick_start_title': '새 세션 시작',
    'meeting.quick_start': '빠른 시작',
    'meeting.quick_start_desc': 'AI가 상황에 맞게 설정',
    'meeting.meeting_prep': '경청 준비',
    'meeting.meeting_prep_desc': '단계별 깊은 세팅',
    'meeting.meeting_search': '세션 검색',
    'meeting.meeting_search_desc': '지난 세션 기록을 찾아봅니다',
    'meeting.preset_start': '프리셋',
    'meeting.preset_start_desc': '저장된 프리셋으로 시작',
    'meeting.no_presets': '프리셋 없음',
    'meeting.ai_setup': '빠른 시작',
    'meeting.ai_setup_desc': 'AI가 상황에 맞게 설정',
    'meeting.deep_setup': '경청 준비',
    'meeting.deep_setup_desc': '단계별 깊은 세팅',
    'pb.title': '빠른 시작',
    'pb.input_placeholder': '어떤 상황인지 알려주세요...',
    'pb.back_to_chat': '← 대화로 돌아가기',
    'pb.save_preset': '💾 프리셋 저장',
    'pb.start': '▶ 시작',
    'pb.greeting': '오늘 어떤 대화에 들어가세요?\n제가 옆에서 놓치는 거 잡아드릴게요 💪\n\n상황만 간단히 알려주세요!',
    'pb.or_describe': '또는 직접 설명해주세요:',
    'pb.generating': '설정을 준비하고 있어요...',
    'pb.saved': '프리셋으로 저장되었습니다!',
    'pb.no_api': 'AI 프록시를 사용할 수 없습니다. 설정을 확인하세요.',
    'pb.card_name': '프리셋 이름',
    'pb.card_description': '설명',
    'pb.card_analysis': '분석 프롬프트',
    'pb.card_chat': 'AI 채팅 역할',
    'pb.card_presets': '추천 질문',
    'pb.card_memo': '메모 가이드',
    'pb.card_context': '상황 배경',
    'pb.chip_work': '업무 미팅',
    'pb.chip_consult': '상담/컨설팅',
    'pb.chip_present': '발표/면접 연습',
    'pb.chip_brainstorm': '브레인스토밍',
    'pb.chip_learn': '배움/강의',

    // Document Generator
    'dg.button_label': 'AI 문서',
    'dg.title': 'AI 문서 생성기',
    'dg.input_placeholder': '어떤 문서를 만들어 드릴까요?',
    'dg.greeting': '이 미팅을 바탕으로 어떤 문서를 만들어 드릴까요?\n\n예를 들어:\n• "제안서 초안 만들어줘"\n• "이메일 드래프트 써줘"\n• "보고서로 정리해줘"\n\n어떤 형식이든 말씀만 하세요!',
    'dg.chip_email': '이메일',
    'dg.chip_proposal': '제안서',
    'dg.chip_report': '보고서',
    'dg.chip_action_list': '액션리스트',
    'dg.chip_summary_mail': '요약 메일',
    'dg.chip_followup': '후속 메일',
    'dg.back_to_chat': '← 대화로 돌아가기',
    'dg.new_doc': '+ 새 문서',
    'dg.copy': '복사',
    'dg.copied': '복사되었습니다!',
    'dg.download_md': 'MD',
    'dg.download_docx': 'Word',
    'dg.download_pdf': 'PDF',
    'dg.save': '저장',
    'dg.saved': '문서가 저장되었습니다!',
    'dg.no_api': 'AI 프록시를 사용할 수 없습니다. 설정을 확인하세요.',
    'dg.no_meeting': '미팅 데이터가 없습니다.',

    // Deep Setup
    'ds.title': '경청 준비',
    'ds.step1': '기본 정보',
    'ds.step2': '맥락',
    'ds.step3': 'AI 설정',
    'ds.step4': '준비 완료',
    'ds.step1_desc': '미팅 기본 정보를 입력하세요.',
    'ds.step2_desc': '한줄 설명, 참고 미팅, 파일을 추가하세요.',
    'ds.step2_skip': '건너뛰기',
    'ds.step3_greeting': '입력하신 내용을 분석하고 있어요...',
    'ds.step3_context_card': 'AI가 파악한 정보',
    'ds.step4_title': '준비 완료!',
    'ds.btn_start': '▶ 시작',
    'ds.btn_save_preset': '💾 프리셋 저장',
    'ds.btn_edit': '← 수정',
    'ds.chip_skip': '없어요',
    'ds.summary_situation': '상황',
    'ds.summary_attendees': '참석자',
    'ds.summary_focus': '집중 포인트',
    'ds.summary_datetime': '일시',
    'ds.summary_location': '장소',
    'ds.summary_description': '설명',
    'ds.summary_links': '연결된 미팅',
    'ds.datetime': '날짜 · 시간',
    'ds.location': '장소',
    'ds.location_placeholder': '장소 검색 또는 입력',
    'ds.attendees': '참석자',
    'ds.description': '한줄 설명',
    'ds.description_placeholder': '이 미팅의 목적이나 주제는?',
    'ds.ref_meetings': '참고 미팅',
    'ds.files': '파일 첨부',
    // Meeting Links
    'link.title': '연결된 미팅',
    'link.add': '+ 연결',
    'link.search_placeholder': '연결할 미팅 검색...',
    'link.empty': '연결된 미팅 없음',
    'link.unlink_confirm': '이 미팅 연결을 해제할까요?',

    // Analysis Style Modal
    'panel.analysis_style': '분석 스타일 변경',
    'asm.title': '분석 스타일 변경',
    'asm.presets_title': '저장된 분석 스타일',
    'asm.presets_desc': '기본 스타일과 커스텀 스타일을 전환합니다',
    'asm.save_style': '이 스타일 저장',
    'asm.ai_chat_label': 'AI와 분석 방향 바꾸기',
    'asm.ai_chat_desc': '지금 분석이 마음에 안 드세요?',
    'asm.history_label': '분석 히스토리',
    'asm.history_desc': '이전 분석 결과를 탐색합니다',
    'asm.saved_styles': '저장한 스타일',
    'asm.history_empty': '아직 분석 결과가 없습니다',
    'panel.copy_md_title': '마크다운으로 복사',
    'panel.analyze_title': '지금 분석',

    // Prompt Adjuster
    'panel.prompt_adjust': '분석 스타일 변경',
    'pa.title': '분석 스타일 변경',
    'pa.input_placeholder': '예: 핵심만 간결하게, 액션아이템 위주로...',
    'pa.greeting': '지금 AI 분석 결과가 어떤 부분이 마음에 안 드시나요?\n예를 들어 "너무 길어", "핵심만 보고 싶어", "감정 분석도 넣어줘" 등 자유롭게 말씀해주세요!',
    'pa.saved': '프롬프트가 업데이트되었습니다!',
    'pa.reanalyzing': '업데이트된 프롬프트로 재분석 중...',
    'sh.title': '스타일 이력',
    'sh.current': '현재 스타일',
    'sh.view_full': '전체 프롬프트 보기',
    'sh.empty': '아직 스타일 변경 이력이 없습니다.',
    'sh.restore': '복원',
    'sh.restore_reanalyze': '복원 + 재분석',
    'sh.view': '프롬프트 보기',
    'sh.delete': '삭제',
    'sh.clear_all': '전체 이력 삭제',
    'sh.back': '뒤로',
    'preset_save.name_placeholder': '프리셋 이름',
    'preset_save.desc_placeholder': '간단한 설명 (선택)',
    'preset_save.save': '저장',
    'preset_save.cancel': '취소',
    'preset_save.success': '프리셋으로 저장되었습니다!',
    'preset_save.name_required': '이름을 입력해주세요',
    'preset_save.btn_tooltip': '프리셋으로 저장',
    'toast.recording_started': '녹음이 시작되었습니다. 말씀하시면 자동으로 기록됩니다.',
    'transcript.connecting': '음성 서비스 연결 중...',
    'transcript.connecting_hint': '모바일 네트워크에서는 잠시 시간이 걸릴 수 있습니다.',
    'transcript.waiting': '음성을 인식하고 있습니다...',
    'transcript.waiting_hint': '말씀하시면 자동으로 기록됩니다.',
    'transcript.idle': '녹음 대기 중',
    'transcript.idle_hint': '녹음 버튼을 눌러 시작하세요.',
    'ai.idle': '세션 대기 중',
    'ai.idle_hint': '녹음을 시작하면 AI 분석이 활성화됩니다.',
    'chat.idle': '채팅 준비 완료',
    'chat.idle_hint': '세션을 시작하면 AI에게 질문할 수 있습니다.',
    'stt.connected': '음성 서비스에 연결되었습니다.',

    // End Meeting Modal
    'end_meeting.title': '회의 저장',
    'end_meeting.edit_title': '회의 정보 수정',
    'end_meeting.edit_info_btn': '저장정보',
    'end_meeting.meeting_title': '회의 제목',
    'end_meeting.tags': '태그',
    'end_meeting.categories': '카테고리',
    'end_meeting.importance': '중요도',
    'end_meeting.participants': '참석자',
    'end_meeting.location': '장소',
    'end_meeting.location_placeholder': '장소 검색 또는 추가...',
    'end_meeting.recent_locations': '최근 사용',
    'end_meeting.all_locations': '전체 장소',
    'end_meeting.add_location': '추가',
    'end_meeting.datetime': '회의 일시',
    'end_meeting.export_minutes': '회의록 내보내기',
    'end_meeting.view_minutes': '회의록 보기',
    'end_meeting.export_transcript': '녹취록 내보내기',
    'end_meeting.export_generating': '회의록 작성 중',
    'end_meeting.generate_minutes': '회의록 생성하기',
    'end_meeting.save': '저장',
    'end_meeting.cancel': '취소',
    'end_meeting.title_hint': 'AI 추천 제목을 선택하거나 직접 입력하세요',
    'end_meeting.title_generating': '제목 추천 중...',
    'end_meeting.title_error': '제목 추천에 실패했습니다',
    'end_meeting.retry': '다시 시도',
    'end_meeting.tags_generating': '태그 추천 중...',
    'end_meeting.tags_error': '태그 추천에 실패했습니다',
    'end_meeting.title_placeholder': '회의 제목을 입력하세요',
    'end_meeting.add_tag': '태그 추가...',
    'end_meeting.add_participant': '이름 추가...',
    'end_meeting.search_participant': '이름 검색...',
    'end_meeting.tab_search': '검색',
    'end_meeting.tab_register': '등록',
    'end_meeting.participant_title': '직급',
    'end_meeting.no_participants': '등록된 인물이 없습니다.',
    'end_meeting.contacts': '인물 목록',
    'end_meeting.recent_tags': '최근 사용',
    'minutes_model.title': 'AI 모델 선택',
    'end_meeting.flash_desc': '빠르고 가벼운 요약',
    'end_meeting.pro_desc': '상세하고 정교한 회의록',
    'end_meeting.minutes_quality': '회의록 품질',
    'end_meeting.generating_minutes': '회의록 생성 중...',
    'end_meeting.close_background': '닫기 (백그라운드 계속)',
    'end_meeting.minutes_complete': '회의록 완성!',
    'end_meeting.minutes_error': '회의록 생성 실패',
    'end_meeting.close': '닫기',
    'end_meeting.saving': '저장 중...',
    'end_meeting.edit_saved': '회의 정보가 수정되었습니다!',
    'end_meeting.last_modified': '마지막 수정',
    'end_meeting.save_complete': '회의가 저장되었습니다!',
    'end_meeting.post_view_minutes': '회의록 보기',
    'end_meeting.post_export': '내보내기',
    'end_meeting.post_edit': '정보 수정',
    'end_meeting.post_resume': '이어서 녹음',
    'end_meeting.post_new': '새 회의',
    'end_meeting.post_close': '닫기',

    // Minutes Generation Modal
    'minutes.select_quality': '회의록 품질 선택',
    'minutes.flash_desc': '요약 회의록',
    'minutes.flash_sub': '핵심만 빠르게',
    'minutes.pro_desc': '심층 회의록',
    'minutes.pro_sub': '놓친 맥락까지 잡아냅니다',
    'minutes.pro_usage': '이번 달 {n}회 사용',
    'minutes.skip': '회의록 생략',
    'minutes_preview.title': '회의록',
    'minutes_preview.prompt_edit': '회의록 스타일 변경',
    'minutes_preview.export': '내보내기',
    'minutes_preview.prev_versions': '이전 버전',
    'minutes_preview.version_restore': '복원',
    'minutes_preview.prompt_reference': '회의록 스타일 참고',
    'minutes_preview.prompt_reference_hint': '참고할 회의록을 붙여넣으세요. 유사한 형식으로 작성해 드립니다.',
    'minutes_preview.prompt_base': '기본 프롬프트 변경',
    'minutes_preview.prompt_instruction': '사용자 지시문 추가',
    'minutes_preview.prompt_instruction_hint': '예: "핵심 결정사항 위주로 정리해줘", "참석자별 액션 아이템을 표로 만들어줘"',
    'minutes_preview.save_preset': '프리셋 저장',
    'minutes_preview.delete_preset': '삭제',
    'minutes_preview.preset_delete_confirm': '이 프리셋을 삭제하시겠습니까?',
    'minutes_preview.preset_deleted': '프리셋 삭제됨',
    'minutes_preview.preset_name': '프리셋 이름:',
    'minutes_preview.preset_saved': '프리셋 저장됨',
    'minutes_preview.preset_select': '프리셋 선택',
    'minutes_preview.reset_default': '기본값',
    'minutes_preview.apply': '적용',
    'minutes_preview.more_detail': '더 자세히',
    'minutes_preview.summarize': '요약',
    'minutes_preview.custom_placeholder': '지시사항 입력...',
    'minutes_preview.section_refined': '섹션 업데이트됨',
    'minutes_preview.section_refine_fail': '섹션 수정 실패:',
    'minutes_preview.regenerate': '회의록 재생성',
    'minutes_preview.regen_confirm': '확인',
    'minutes_preview.regen_title': '회의록 재생성',
    'minutes_preview.regen_flash_desc': '빠르고 가벼운 생성',
    'minutes_preview.regen_pro_desc': '정밀하고 상세한 분석',
    'minutes_preview.generated_with': '{model}로 생성됨',
    'toast.minutes_generating_bg': '회의록을 백그라운드에서 작성 중입니다',
    'toast.minutes_still_generating': '아직 작성 중입니다',

    // Panel inbox
    'panel.inbox': '인박스',

    // Settings Data tab
    'settings.tab_data': '데이터',
    'settings.participants': '참석자',
    'settings.contacts_title': '인물 목록',
    'settings.contacts_tab_add': '추가',
    'settings.contacts_tab_search': '검색',
    'settings.scan_card': '명함 스캔',
    'settings.scan_card_btn': '명함 스캔',
    'settings.drop_card_hint': '또는 아래 버튼으로 업로드',
    'settings.card_queue_waiting': '대기 중...',
    'settings.card_queue_processing': '스캔 중...',
    'settings.card_queue_done': '스캔 완료',
    'settings.card_queue_error': '실패',
    'settings.card_queue_saved': '저장됨!',
    'settings.card_save_all': '모두 저장',
    'settings.contacts_import': '인물 가져오기',
    'settings.export_csv': '인물 내보내기',
    'settings.contacts_imported': '명 가져옴',
    'settings.starred_only': '즐겨찾기만 보기',
    'settings.placeholder_title': '직함/직급',
    'settings.locations': '장소',
    'settings.categories': '카테고리',
    'settings.add': '추가',
    'settings.no_items': '항목이 없습니다.',
    'settings.placeholder_name': '이름',
    'settings.placeholder_company': '회사',
    'settings.placeholder_location': '장소 이름',
    'settings.placeholder_category': '카테고리 이름',
    'settings.category_hint_placeholder': '이 카테고리의 AI 힌트 (선택사항)',
    'settings.open_contacts': '인물 관리',
    'settings.open_locations': '장소 관리',
    'settings.open_categories': '카테고리 관리',
    'settings.search_contacts': '인물 검색...',
    'settings.search_filter_all': '전체',
    'settings.click_to_edit_detail': '클릭하여 편집',
    'settings.toggle_star': '즐겨찾기 토글',
    'settings.drop_card_image': '명함 이미지를 여기에 드롭하세요',
    'settings.add_contacts_from_group': '인물 추가',

    // History filters
    'history.filter_all_categories': '모든 카테고리',
    'history.filter_all_ratings': '모든 별점',
    'history.filter_tag': '태그로 필터...',

    // Sort options
    'history.sort_newest': '최신순',
    'history.sort_oldest': '오래된순',
    'history.sort_rating': '높은 평점순',
    'history.sort_duration': '긴 시간순',
    'history.sort_title': '제목 가나다순',

    // Relative time
    'history.time_just_now': '방금 전',
    'history.time_minutes_ago': '{n}분 전',
    'history.time_hours_ago': '{n}시간 전',
    'history.time_days_ago': '{n}일 전',
    'history.time_weeks_ago': '{n}주 전',
    'history.time_months_ago': '{n}개월 전',

    // Group headers
    'history.group_today': '오늘',
    'history.group_yesterday': '어제',
    'history.group_this_week': '이번 주',
    'history.group_this_month': '이번 달',
    'history.group_older': '이전',

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
    'toast.empty_meeting': '저장할 내용이 없습니다 — 아직 녹음, 메모, 채팅이 없어요.',

    'end_meeting.stat_duration': '녹음 시간',
    'end_meeting.stat_transcript': '트랜스크립트',
    'end_meeting.stat_bookmarks': '북마크',
    'end_meeting.stat_memos': '메모',
    'end_meeting.stat_analyses': 'AI 분석',
    'end_meeting.stat_chats': '채팅',

    // End meeting confirmation (30min+)
    'end_confirm.message': '회의를 종료하시겠습니까?',
    'end_confirm.stats': '{duration} · 트랜스크립트 {lines}줄',
    'end_confirm.cancel': '취소',
    'end_confirm.confirm': '종료',

    // Draft recovery
    'draft.recovery_message': '저장되지 않은 회의가 있습니다 (마지막 저장: {time}, {lines}줄). 복구할까요?',
    'draft.crash_recovery_message': '중단된 회의가 있습니다 (마지막 저장: {time}, {lines}줄). 이어서 진행할까요?',
    'draft.recover': '이어하기',
    'draft.save_and_end': '저장 후 종료',
    'draft.discard': '삭제',
    'draft.recovered_status': '임시저장에서 복구됨',
    'draft.crash_recovered_status': '중단 후 복구됨',
    'toast.draft_recovered': '회의가 임시저장에서 복구되었습니다.',
    'toast.crash_recovered': '중단된 회의가 복구되었습니다. 녹음 버튼을 눌러 이어가세요.',

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

    // Import (P-4 + P-6)
    'import.launcher_label': '가져오기',
    'import.launcher_desc': '텍스트 붙여넣기 또는 음성 업로드',
    'import.title': '녹취록 가져오기',
    'import.tab_text': '텍스트 붙여넣기',
    'import.tab_audio': '음성 업로드',
    'import.text_placeholder': '녹취록을 여기에 붙여넣으세요...\n\n지원 형식:\n- 일반 텍스트 (줄 단위)\n- 타임스탬프: [00:00] 텍스트\n- 화자 포함: 화자 A: 텍스트',
    'import.drop_hint': '음성 파일을 여기에 놓거나 클릭하여 선택',
    'import.language': '언어',
    'import.transcribing': '음성 인식 중...',
    'import.transcribe': '음성 인식',
    'import.cancel': '취소',
    'import.confirm': '가져오기 & 분석',
    'import.stats': '{lines}줄, {chars}자',
    'import.empty_text': '가져올 텍스트를 입력해주세요.',
    'import.text_success': '{lines}줄 가져옴',
    'import.upload_success': '{lines}줄 인식 완료',
    'import.file_too_large': '파일이 너무 큽니다 (최대 4.5MB)',
    'import.no_speech': '음성이 감지되지 않았습니다.',
    'import.transcribe_error': '음성 인식 실패',
    'import.status_imported': '가져온 녹취록',
    'import.status_uploaded': '음성 녹취록',

    // History badges (P-4/P-6)
    'history.imported': '가져옴',
    'history.audio_import': '음성 가져옴',
    'history.has_audio': '녹음 파일 있음',

    // Audio recording (P-5)
    'settings.audio_recording': '오디오 녹음',
    'settings.audio_toggle': '원본 오디오 함께 저장',
    'settings.audio_retention': '자동 정리',
    'settings.audio_7days': '7일',
    'settings.audio_30days': '30일',
    'settings.audio_90days': '90일',
    'settings.audio_never': '안 함',
    'settings.audio_storage_hint': '브라우저 내부 저장소(IndexedDB)에 보관됩니다. 브라우저 데이터 삭제 시 함께 삭제됩니다.',
    'settings.audio_storage_info': '{count}개 녹음 · {size} MB',
    'settings.audio_no_recordings': '저장된 녹음 없음',
    'settings.audio_storage_unavailable': '브라우저 저장소를 사용할 수 없습니다',
    'settings.audio_delete_all': '모든 녹음 삭제',
    'settings.audio_delete_confirm': '저장된 모든 오디오 녹음을 삭제하시겠습니까? 되돌릴 수 없습니다.',
    'settings.audio_deleted': '{n}개 녹음 삭제됨',
    'settings.audio_delete_error': '녹음 삭제 실패',
    'viewer.download_audio': '오디오 다운로드',
    'viewer.click_to_seek': '타임스탬프 클릭으로 이동',
    'end_meeting.download_audio': '녹음 파일 다운로드',
    'end_meeting.audio_warn_days': '다운로드를 권장합니다 — {days}일 후 자동 삭제됩니다',
    'end_meeting.audio_warn_manual': '다운로드를 권장합니다 — 브라우저에만 저장됩니다',
    'end_meeting.audio_not_found': '녹음 파일을 찾을 수 없습니다',
    'end_meeting.audio_downloaded': '다운로드 완료',
    'end_meeting.audio_download_error': '다운로드 실패',
    'end_meeting.audio_auto_download_notice': '저장 시 자동으로 다운로드됩니다',
    'settings.audio_auto_download': '저장 시 자동 다운로드',

    // Misc
    'minutes': '{n}분',
    'meeting_title': '회의 {date} {time}',
  }
};

// AI-specific prompts per language (Markdown output)
const AI_PROMPTS = {
  en: `You are a real-time conversation copilot. The user is IN a live conversation right now. Do NOT summarize what they already heard. Catch what they physically can't think of while engaged — unasked questions, unseen connections, cracks in hidden assumptions — and turn them into sentences they can say RIGHT NOW. Respond ONLY in English regardless of transcript language.

## Your Role
The smartest observer in the room + a colleague coaching through an earpiece.

## Analysis Method (internal — do NOT expose these lens names to the user)
Apply all 6 lenses simultaneously to the transcript, but only convert the highest-impact findings into suggested lines.

1. **Blind Spot** — The faster the consensus, the more likely a question was skipped. Trigger: consensus too quick, key variables unmentioned, memo topics not raised yet.
2. **Hidden Assumption** — Unquestioned implicit assumptions. Trigger: 10+ min discussion built on one premise, "obviously…" passed without verification.
3. **Cross-Domain Link** — Structurally similar problem-solving from another field. Trigger: problem-solving is stuck, "that's just how it is" resignation appears.
4. **Stress Test** — The smoother the consensus, the more dangerous (groupthink). Trigger: right after "this should work" agreement, right after conditions/numbers are locked in.
5. **Zoom In/Out** — Stuck in details → zoom out; stuck in big picture → zoom in. Trigger: same detail 10+ min, big direction repeating for 30+ min.
6. **Missing Stakeholder** — Represent the perspective of absent stakeholders. Trigger: decision made from one viewpoint only, "just between us" consensus forming.

## Impact Filtering — only top 1-3 make it to 🎯
Four criteria:
1. Urgency: Will the conversation go wrong if this isn't caught now?
2. Irreversibility: Is this agreement hard to reverse later?
3. Blind spot: Does NO participant hold this perspective?
4. Specificity: Can it be presented with a concrete scenario/number? (if abstract, drop it)

## Tone Mirroring (REQUIRED)
Analyze the transcript's tone — formality level, vocabulary, sentence length, relationship cues. Formal → formal, casual → casual. Suggested lines are sentences the user speaks TO the other party.

Respond in well-structured **Markdown**. Use EXACTLY this section order:

---
### ▸ SAY THIS NOW
---

## 🎯 Suggested Lines
6-lens analysis → impact filtering → 1-5 complete, speakable sentences for right now.
Each line must be:
- A **tone-mirrored, complete sentence** — ready to say verbatim
- Tagged with intent: 🔍 ask | ✋ confirm | 📌 propose | ⚠️ challenge | 💬 respond | 🔄 reframe
- Ordered by urgency (most time-sensitive first)

Format:
- 🔍 "So how are we handling the revision limit on this?"
- ⚠️ "Wait, earlier you said we'd keep it simple, but this seems like a different direction"
- ✋ "You mentioned end of March — are we still on track for that?"
- 🔄 "Hold on, how much of the overall timeline does this part actually take up?"
- 🔍 "What would this look like from the end user's perspective?"

Don't force quantity. If only 1-2 are genuinely useful, that's fine. Early in a conversation (low context), don't manufacture analysis.
⛔ NEVER: rephrase what was already said, suggest greetings/small talk, use advisory tone ("you should…")

---
### ▸ WHY THESE
---

## 💡 Context & Reasoning
For each suggested line above, explain "why this, why now" in 1-2 lines.
- Ground in specifics: what was actually said (or NOT said) in the conversation
- No abstract explanations → "They said '…' but never addressed …" format

## 🔔 Whisper
Urgent alerts that can't be converted into suggested lines (0-3 max):
- Contradiction detected: "Said 'A' earlier but now saying 'B'"
- Tone shift: "Tone just turned defensive"
- Time pressure: "Core agenda item still not covered"
- Premise warning: "Entire discussion rests on '…' which hasn't been verified"
Rules: each under 50 chars. Omit this section entirely if nothing stands out.

---
### ▸ FULL PICTURE
---

## 📋 Discussion Tracker
List each topic discussed so far with a status marker:
- ✅ **Decided**: topic — what was decided
- ⏳ **Pending**: topic — what's still open
- ⚠️ **Conflict**: topic — contradicting positions noted
Be specific: include exact numbers, dates, names, conditions.

## 📌 Not Yet Covered
Topics that SHOULD have come up (based on meeting purpose/memos) but haven't. Omit if all covered.

## 💬 Memo Check
User memos whose topics haven't appeared in the discussion yet. Omit if none or all addressed.

---

General rules:
- Write as CUMULATIVE: preserve previous content and add new discussion
- Do NOT repeat perspectives already raised in previous analyses
- If a previous suggested line was addressed in conversation → mark resolved (✅) and move to tracker
- Record specific numbers, dates, names, and technical terms exactly as stated
- No abstract summaries like "discussed X" → describe actual content
- Do NOT guess speakers or attribute statements to specific individuals (real-time STT, no speaker diarization)
- No filler phrases like "great discussion"
- Do NOT lecture about conversation methodology
- CRITICAL: All output MUST be in English, REGARDLESS of transcript language.`,

  ko: `당신은 실시간 대화 코파일럿입니다. 사용자는 지금 대화에 참여하고 있습니다. 사용자가 이미 듣고 있는 내용을 요약하지 마세요. 대화에 몰입하느라 물리적으로 떠올리기 어려운 것 — 아무도 안 던진 질문, 아무도 못 본 연결고리, 숨어있는 전제의 균열 — 을 포착해서 지금 입으로 바로 말할 수 있는 문장으로 바꿔 건네세요. 회의록이 어떤 언어이든 반드시 한국어로만 응답하세요.

## 당신의 역할
회의실에 앉아있는 가장 똑똑한 참관자 + 이어폰으로 코칭해주는 동료.

## 분석 방법 (내부용 — 렌즈 이름을 사용자에게 노출하지 마세요)
녹취록을 받으면 아래 6가지 관점을 동시에 적용하되, 매번 전부 출력하지 말고 임팩트 큰 것만 추천 멘트로 변환하세요.

1. **빠진 질문** — 합의가 빠를수록 빠진 질문이 있다. 트리거: 합의가 너무 빠를 때, 핵심 변수가 안 나왔을 때, 메모 주제가 아직 안 나왔을 때.
2. **전제 의심** — 아무도 의심 안 하는 암묵적 가정. 트리거: 같은 전제 위 10분+ 논의, "당연히 ~겠지"가 검증 없이 넘어갈 때.
3. **의외의 연결** — 다른 분야에서 구조적으로 유사한 문제 해결 사례. 트리거: 문제 해결이 막혔을 때, "원래 이런 거야" 체념이 나올 때.
4. **반례와 엣지케이스** — 합의가 매끄러울수록 위험(집단사고). 트리거: "이러면 되겠다" 합의 직후, 조건/수치가 고정된 직후.
5. **스케일 전환** — 디테일에 갇혀 있으면 줌아웃, 큰 그림에만 머물면 줌인. 트리거: 같은 디테일 10분+, 큰 방향만 30분째 반복.
6. **부재자 시선** — 여기 없는 이해관계자의 시각을 대리. 트리거: 의사결정이 한쪽 관점에서만, "우리끼리" 합의가 이뤄질 때.

## 임팩트 필터링 — 상위 1~3개만 🎯에 올리기
기준 4가지:
1. 긴급성: 지금 안 잡으면 대화가 잘못된 방향으로 흘러가는가?
2. 비가역성: 이 합의가 나중에 뒤집기 어려운가?
3. 사각지대: 참여자 중 아무도 이 관점을 갖고 있지 않은가?
4. 구체성: 구체적 시나리오/수치로 제시할 수 있는가? (추상적이면 탈락)

## 톤 미러링 (필수)
트랜스크립트의 말투를 분석하세요 — 격식 수준, 어휘, 문장 길이, 관계 힌트. 반말이면 반말, 존댓말이면 존댓말, 캐주얼하면 캐주얼하게. 추천 멘트는 사용자가 상대방에게 말하는 문장입니다.

잘 구조화된 **Markdown**으로 응답하세요. 반드시 아래 섹션 순서를 지키세요:

---
### ▸ 지금 이렇게 말하세요
---

## 🎯 추천 멘트
6가지 관점 분석 → 임팩트 필터링 → 지금 입으로 말할 수 있는 완전한 문장 1~5개.
각 문장은:
- 톤 미러링된 **완전한 문장** — 그대로 말할 수 있는 수준
- 의도 태그: 🔍 질문 | ✋ 확인 | 📌 제안 | ⚠️ 지적 | 💬 응답 | 🔄 전환
- 긴급한 순서대로 정렬 (가장 시급한 것 먼저)

형식:
- 🔍 "그러면 수정 횟수 제한은 어떻게 잡으시는 게 좋을까요?"
- ⚠️ "근데 아까는 간단하게 한다고 하셨는데, 지금은 좀 다른 방향인 것 같아서요"
- ✋ "아까 3월 말까지라고 하셨는데, 그대로 가는 거 맞죠?"
- 🔄 "잠깐, 이 부분은 전체 일정에서 어느 정도 비중인 거예요?"
- 🔍 "이거 실제 사용자 입장에서는 어떨까요?"

억지로 수를 채우지 마세요. 1~2개뿐이면 그것만. 대화 초반(맥락 부족)에는 무리하게 만들지 마세요.
⛔ 금지: 이미 말한 내용 다듬어 반복, 인사/맞장구 제안, 조언형("~해야 합니다") 문장

---
### ▸ 왜 지금인가
---

## 💡 맥락과 근거
위 추천 멘트 각각에 대해, "왜 지금 이걸 해야 하는지" 1~2줄.
- 실제 대화에서 무엇이 말해졌는지(또는 안 말해졌는지) 구체적 근거
- 추상적 설명 금지 → "대화에서 '~'라고 했는데, ~가 빠져 있음" 식으로

## 🔔 귓속말
추천 멘트로 변환하기 어렵지만 사용자가 알아야 하는 긴급 알림 (0~3개):
- 모순 감지: "앞에서 'A'라고 했는데 지금 'B'라고 함"
- 분위기 전환: "톤이 갑자기 방어적으로 바뀜"
- 시간 압박: "핵심 안건 아직 안 다룸"
- 전제 경고: "지금 논의 전체가 '~' 전제 위에 있는데, 이게 검증 안 됐음"
규칙: 각 50자 이내. 없으면 이 섹션 자체를 생략.

---
### ▸ 전체 그림
---

## 📋 논의 트래커
지금까지 논의된 각 주제를 상태 마커와 함께 정리:
- ✅ **확정**: 주제 — 무엇이 결정되었는지
- ⏳ **미정**: 주제 — 아직 열려있는 것
- ⚠️ **충돌**: 주제 — 상반된 의견이 감지됨
구체적으로: 수치, 날짜, 이름, 조건을 정확히 포함.

## 📌 아직 안 다룬 주제
미팅 목적/메모 대비 빠진 것. 모두 다뤄졌으면 생략.

## 💬 메모 대조
사용자 메모 중 아직 대화에서 나오지 않은 것. 없거나 모두 다뤄졌으면 생략.

---

일반 규칙:
- 누적형으로 작성: 이전 내용을 보존하면서 새로운 논의를 추가
- 이전에 이미 던진 관점은 반복하지 않는다
- 이전 추천 멘트가 대화에서 다뤄졌으면 → 해소 표시(✅)하고 트래커로 이동
- 구체적 수치, 날짜, 이름, 기술 용어는 반드시 그대로 기록
- "~에 대해 논의함" 같은 추상적 요약 금지 → 실제 내용 서술
- 화자 추정/특정 발언자 지목 금지 (실시간 STT, 화자 분리 불가)
- "좋은 논의입니다" 같은 빈말 금지
- 대화 진행 방법론을 가르치려 하지 않는다
- 중요: 모든 분석 결과를 반드시 한국어로 작성하세요.`
};

// Prompt presets for quick selection
const AI_PROMPT_PRESETS = {
  en: {
    default: { name: 'Conversation Coach', prompt: null },
    minutes: { name: 'Meeting Minutes', prompt: `You are a meeting minutes assistant. Respond in English using Markdown.

## Summary
2-3 sentence overview of the meeting so far.

## 📋 Key Discussions
List each major topic discussed with key points:
- **Topic**: key points, arguments, context

## ✅ Decisions Made
- Decision — rationale and conditions (if any)
If no decisions yet, omit this section.

## 📌 Action Items
For each action item:
- **[Owner]** Task — **Deadline** (if mentioned)
- Mark priority: High/Medium/Low when inferable
If no action items yet, omit this section.

## 📝 Notes
Any important details, numbers, dates, or references mentioned that don't fit above categories. Omit if nothing notable.

Rules:
- Write as CUMULATIVE: preserve previous content and add new discussion
- Record specific numbers, dates, names, and technical terms exactly as stated
- Focus on capturing decisions and action items accurately
- CRITICAL: All output MUST be in English.` },
    learning: { name: 'Lecture Notes', prompt: `You are a learning assistant helping capture key insights. Respond in English using Markdown.

## Topic
What is being taught/discussed — one line.

## 📚 Key Concepts
For each concept covered:
- **Concept**: explanation in simple terms
- Include examples or analogies mentioned

## 💡 Key Insights
Important takeaways, principles, or rules mentioned:
- Insight — why it matters

## ❓ Comprehension Check
2-3 questions to verify understanding of the material covered so far. Format as:
- Q: question
- A: expected answer (brief)

## 🔍 Questions to Explore
Topics or questions worth investigating further based on the discussion. Omit if nothing stands out.

## 📝 Terms & Definitions
Key terms and their definitions as explained. Omit if none.

Rules:
- Write as CUMULATIVE: preserve previous content and add new material
- Preserve exact terminology, formulas, and references
- Focus on understanding, not just recording
- CRITICAL: All output MUST be in English.` },
  },
  ko: {
    default: { name: '대화 코치', prompt: null },
    minutes: { name: '회의록 정리', prompt: `당신은 회의록 작성 도우미입니다. 한국어 마크다운으로 응답하세요.

## 요약
2-3문장으로 회의 개요.

## 📋 주요 논의
논의된 각 주요 주제와 핵심 내용:
- **주제**: 핵심 포인트, 논거, 맥락

## ✅ 결정 사항
- 결정 내용 — 근거와 조건 (있는 경우)
아직 결정 사항이 없으면 이 섹션 생략.

## 📌 액션 아이템
각 실행 항목별:
- **[담당자]** 할 일 — **기한** (언급된 경우)
- 우선순위: 높음/보통/낮음 (추론 가능할 때)
아직 액션 아이템이 없으면 이 섹션 생략.

## 📝 기타 메모
위 카테고리에 포함되지 않는 중요한 세부사항, 수치, 날짜, 참고자료. 특별한 것이 없으면 생략.

규칙:
- 누적형으로 작성: 이전 내용을 보존하면서 새로운 논의를 추가
- 구체적 수치, 날짜, 이름, 기술 용어는 그대로 기록
- 결정 사항과 액션 아이템을 정확히 포착하는 데 집중
- 중요: 모든 분석 결과를 반드시 한국어로 작성하세요.` },
    learning: { name: '강의 노트', prompt: `당신은 핵심 인사이트를 포착하는 학습 도우미입니다. 한국어 마크다운으로 응답하세요.

## 주제
무엇을 배우고/논의하고 있는지 — 한 줄.

## 📚 핵심 개념
다뤄진 각 개념:
- **개념**: 쉬운 말로 설명
- 언급된 예시나 비유 포함

## 💡 핵심 인사이트
언급된 중요한 교훈, 원칙, 규칙:
- 인사이트 — 왜 중요한지

## ❓ 이해도 체크
지금까지 다뤄진 내용의 이해를 확인하는 질문 2-3개:
- Q: 질문
- A: 예상 답변 (간략)

## 🔍 더 탐구할 질문
논의를 바탕으로 더 조사해볼 만한 주제나 질문. 특별한 것이 없으면 생략.

## 📝 용어 & 정의
설명된 핵심 용어와 정의. 없으면 생략.

규칙:
- 누적형으로 작성: 이전 내용을 보존하면서 새로운 내용 추가
- 정확한 용어, 공식, 참고자료 보존
- 단순 기록이 아닌 이해에 초점
- 중요: 모든 분석 결과를 반드시 한국어로 작성하세요.` },
  }
};

export function getPromptPresets() {
  const lang = getAiLanguage();
  return AI_PROMPT_PRESETS[lang] || AI_PROMPT_PRESETS.en;
}

// Meeting type → prompt preset auto-mapping
const MEETING_TYPE_PROMPT_MAP = {
  copilot: 'default',
  minutes: 'minutes',
  learning: 'learning',
};

// Meeting type → category guidance auto-mapping
const MEETING_TYPE_CATEGORY_MAP = {
  copilot: null,
  minutes: null,
  learning: null,
};

export function getMeetingTypePromptMap() {
  return { ...MEETING_TYPE_PROMPT_MAP };
}

export function getMeetingTypeCategoryMap() {
  return { ...MEETING_TYPE_CATEGORY_MAP };
}

/** Get the default prompt for a given meeting type */
export function getTypeDefaultPrompt(meetingType) {
  const presetKey = MEETING_TYPE_PROMPT_MAP[meetingType] || 'default';
  const presets = getPromptPresets();
  const preset = presets[presetKey];
  return preset?.prompt || getAiPrompt();
}

const AI_PRESET_CONTEXTS = {
  en: {
    copilot: 'Business conversation. Focus on decisions, contradictions, and missed topics.',
    minutes: 'Meeting. Focus on summary, key discussions, decisions, and action items.',
    learning: 'Learning session. Focus on key concepts, insights, and comprehension.',
    custom: '',
  },
  ko: {
    copilot: '비즈니스 대화. 결정, 모순, 빠진 주제에 집중.',
    minutes: '회의. 요약, 주요 논의, 결정 사항, 액션 아이템에 집중.',
    learning: '학습 세션. 핵심 개념, 인사이트, 이해도에 집중.',
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
