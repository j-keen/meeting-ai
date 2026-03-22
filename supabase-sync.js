// supabase-sync.js — Data sync between localStorage and Supabase

(function () {
  const STORAGE_KEY = 'meeting-ai-data';

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { meetings: [], settings: {} };
    } catch {
      return { meetings: [], settings: {} };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Save meeting to Supabase cloud
   */
  window.saveMeetingWithSync = async function (meetingData) {
    const client = window.getSupabaseClient();
    if (!client) return;

    const user = await window.getSupabaseUser();
    if (!user) return;

    try {
      const { error } = await client.from('meetings').upsert({
        id: meetingData.id,
        user_id: user.id,
        title: meetingData.title,
        transcript: meetingData.transcript,
        analysis: meetingData.analysisHistory || [],
        tags: meetingData.tags || [],
        meeting_type: meetingData.meetingType || '',
        language: meetingData.language || 'ko',
        duration: parseInt(meetingData.duration) || 0,
        star_rating: meetingData.starRating || 0,
        memos: meetingData.memos || [],
        chat_history: meetingData.chatHistory || [],
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[sync] Upload failed:', error.message);
      } else {
        console.log('[sync] Meeting uploaded');
      }
    } catch (err) {
      console.error('[sync] Upload error:', err);
    }
  };

  /**
   * Load meetings from Supabase cloud and merge into local storage
   */
  window.loadFromCloud = async function () {
    const client = window.getSupabaseClient();
    if (!client) return;

    const user = await window.getSupabaseUser();
    if (!user) return;

    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) syncStatus.textContent = '동기화 중...';

    try {
      const { data, error } = await client
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[sync] Cloud load failed:', error.message);
        if (syncStatus) syncStatus.textContent = '동기화 실패: ' + error.message;
        return;
      }

      if (!data || data.length === 0) {
        if (syncStatus) syncStatus.textContent = '클라우드에 회의 데이터가 없습니다.';
        return;
      }

      // Merge with local data using meeting-ai-data structure
      const local = loadLocal();
      const localIds = new Set(local.meetings.map((m) => m.id));

      let added = 0;
      for (const remote of data) {
        if (!localIds.has(remote.id)) {
          local.meetings.push({
            id: remote.id,
            title: remote.title,
            startTime: new Date(remote.created_at).getTime(),
            duration: remote.duration ? `${Math.floor(remote.duration / 60)}m` : '',
            transcript: remote.transcript || [],
            analysisHistory: remote.analysis || [],
            tags: remote.tags || [],
            meetingType: remote.meeting_type || '',
            language: remote.language || 'ko',
            starRating: remote.star_rating || 0,
            memos: remote.memos || [],
            chatHistory: remote.chat_history || [],
            createdAt: new Date(remote.created_at).getTime(),
            updatedAt: remote.updated_at ? new Date(remote.updated_at).getTime() : Date.now(),
          });
          added++;
        }
      }

      if (added > 0) {
        saveLocal(local);
        console.log(`[sync] Added ${added} meetings from cloud`);
        if (syncStatus) syncStatus.textContent = `${added}개 회의를 클라우드에서 불러왔습니다.`;
        // Refresh history if available
        if (window.refreshHistoryGrid) window.refreshHistoryGrid();
      } else {
        if (syncStatus) syncStatus.textContent = `클라우드와 동기화 완료 (${data.length}개 회의, 모두 로컬에 있음)`;
      }
    } catch (err) {
      console.error('[sync] Cloud load error:', err);
      if (syncStatus) syncStatus.textContent = '동기화 오류: ' + err.message;
    }
  };

  /**
   * Subscribe to realtime changes
   */
  function subscribeToChanges() {
    const client = window.getSupabaseClient();
    if (!client) return;

    client
      .channel('web-meetings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetings' },
        (payload) => {
          console.log('[sync] Realtime change:', payload.eventType);
          if (window.refreshHistoryGrid) window.refreshHistoryGrid();
        }
      )
      .subscribe();
  }

  // Auto-subscribe on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', subscribeToChanges);
  } else {
    subscribeToChanges();
  }
})();
