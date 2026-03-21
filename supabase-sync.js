// supabase-sync.js — Data sync between localStorage and Supabase

(function () {
  /**
   * Save meeting to both localStorage and Supabase
   */
  window.saveMeetingWithSync = async function (meetingData) {
    // 1. Save locally first (existing behavior)
    if (window.saveMeeting) {
      window.saveMeeting(meetingData);
    }

    // 2. If logged in, upload to Supabase
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
        duration: meetingData.duration || 0,
        star_rating: meetingData.starRating || 0,
        memos: meetingData.memos || [],
        chat_history: meetingData.chatHistory || [],
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[supabase-sync] Upload failed:', error.message);
      } else {
        console.log('[supabase-sync] Meeting uploaded successfully');
      }
    } catch (err) {
      console.error('[supabase-sync] Upload error:', err);
    }
  };

  /**
   * Load meetings from Supabase cloud
   */
  window.loadFromCloud = async function () {
    const client = window.getSupabaseClient();
    if (!client) return;

    const user = await window.getSupabaseUser();
    if (!user) return;

    try {
      const { data, error } = await client
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[supabase-sync] Cloud load failed:', error.message);
        return;
      }

      if (!data || data.length === 0) return;

      // Merge with local data: add meetings not in local storage
      const localMeetings = JSON.parse(localStorage.getItem('meetings') || '[]');
      const localIds = new Set(localMeetings.map((m) => m.id));

      let added = 0;
      for (const remote of data) {
        if (!localIds.has(remote.id)) {
          localMeetings.push({
            id: remote.id,
            title: remote.title,
            transcript: remote.transcript || [],
            analysisHistory: remote.analysis || [],
            tags: remote.tags || [],
            meetingType: remote.meeting_type || '',
            language: remote.language || 'ko',
            duration: remote.duration || 0,
            starRating: remote.star_rating || 0,
            memos: remote.memos || [],
            chatHistory: remote.chat_history || [],
            createdAt: remote.created_at,
            updatedAt: remote.updated_at,
          });
          added++;
        }
      }

      if (added > 0) {
        localStorage.setItem('meetings', JSON.stringify(localMeetings));
        console.log(`[supabase-sync] Added ${added} meetings from cloud`);
        // Refresh history grid if available
        if (window.refreshHistoryGrid) window.refreshHistoryGrid();
      }
    } catch (err) {
      console.error('[supabase-sync] Cloud load error:', err);
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
          console.log('[supabase-sync] Realtime change:', payload.eventType);
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
