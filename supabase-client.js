// supabase-client.js — Supabase client for web (loaded via CDN)

(function () {
  // Read from localStorage settings or fallback to empty
  const settings = JSON.parse(localStorage.getItem('meeting-ai-supabase') || '{}');
  const supabaseUrl = settings.url || '';
  const supabaseKey = settings.anonKey || '';

  if (supabaseUrl && supabaseKey) {
    window._supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
  } else {
    window._supabaseClient = null;
  }

  window.getSupabaseClient = function () {
    return window._supabaseClient;
  };

  window.isSupabaseConfigured = function () {
    return Boolean(window._supabaseClient);
  };

  window.configureSupabase = function (url, anonKey) {
    localStorage.setItem('meeting-ai-supabase', JSON.stringify({ url, anonKey }));
    if (url && anonKey) {
      window._supabaseClient = window.supabase.createClient(url, anonKey);
    }
  };
  // Settings UI integration
  function initSettingsUI() {
    const btnSave = document.getElementById('btnSaveSupabase');
    const inputUrl = document.getElementById('inputSupabaseUrl');
    const inputKey = document.getElementById('inputSupabaseKey');
    if (!btnSave || !inputUrl || !inputKey) return;

    // Load existing values
    inputUrl.value = settings.url || '';
    inputKey.value = settings.anonKey || '';

    btnSave.addEventListener('click', () => {
      window.configureSupabase(inputUrl.value.trim(), inputKey.value.trim());
      alert('Supabase 설정이 저장되었습니다. 페이지를 새로고침해주세요.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsUI);
  } else {
    initSettingsUI();
  }
})();
