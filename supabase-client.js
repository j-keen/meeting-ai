// supabase-client.js — Supabase client + auth for web

(function () {
  const SUPABASE_URL = 'https://redfpvmnvqzlkpasjuax.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlZGZwdm1udnF6bGtwYXNqdWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDE0OTMsImV4cCI6MjA4OTY3NzQ5M30.KMsQ4qvypkJ-L1ILIQ6ZpIJJeuvZvqUI8W_4zA3p3TI';

  // 1. Create client
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  // 2. Register auth listener IMMEDIATELY after createClient
  client.auth.onAuthStateChange((event, session) => {
    console.log('[auth] event:', event, session?.user?.email || 'no user');
    updateAuthUI(session?.user || null);
    if (event === 'SIGNED_IN' && session?.user) {
      if (window.loadFromCloud) window.loadFromCloud();
    }
  });

  // Expose globally
  window._supabaseClient = client;
  window.getSupabaseClient = function () { return client; };
  window.isSupabaseConfigured = function () { return true; };

  // Auth functions
  window.supabaseSignIn = async function () {
    // Native app: open OAuth in Chrome Custom Tab instead of WebView redirect
    if (window.__nativeBridge?.isNative && window.ReactNativeWebView) {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          skipBrowserRedirect: true,
        },
      });
      if (error) { alert('로그인 실패: ' + error.message); return; }
      if (data?.url) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'googleLogin', url: data.url
        }));
      }
      return;
    }
    // Browser: normal OAuth redirect
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) alert('로그인 실패: ' + error.message);
  };

  window.supabaseSignOut = async function () {
    await client.auth.signOut();
    updateAuthUI(null);
  };

  window.getSupabaseUser = async function () {
    const { data: { user } } = await client.auth.getUser();
    return user;
  };

  // UI update (exposed globally for native bridge callback)
  window.updateAuthUI = updateAuthUI;
  function updateAuthUI(user) {
    const btn = document.getElementById('btnAuth');
    if (!btn) return;

    if (user) {
      const name = user.user_metadata?.full_name || user.email || '사용자';
      const avatar = user.user_metadata?.avatar_url;
      btn.innerHTML = avatar
        ? `<img src="${avatar}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:4px">${name}`
        : name;
      btn.onclick = window.supabaseSignOut;
      btn.title = '클릭하면 로그아웃';
    } else {
      btn.textContent = '로그인';
      btn.onclick = window.supabaseSignIn;
      btn.title = '로그인';
    }
  }
})();
