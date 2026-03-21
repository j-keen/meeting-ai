// supabase-auth.js — Google OAuth via Supabase for web

(function () {
  window.supabaseSignIn = async function () {
    const client = window.getSupabaseClient();
    if (!client) {
      alert('Supabase가 설정되지 않았습니다. 설정에서 URL과 키를 입력해주세요.');
      return;
    }

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('Google sign-in failed:', error.message);
      alert('로그인 실패: ' + error.message);
    }
  };

  window.supabaseSignOut = async function () {
    const client = window.getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    updateAuthUI(null);
  };

  window.getSupabaseUser = async function () {
    const client = window.getSupabaseClient();
    if (!client) return null;
    const { data: { user } } = await client.auth.getUser();
    return user;
  };

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
      btn.title = '로그아웃';
    } else {
      btn.textContent = '로그인';
      btn.onclick = window.supabaseSignIn;
      btn.title = '로그인';
    }
  }

  // Listen for auth state changes
  function initAuth() {
    const client = window.getSupabaseClient();
    if (!client) return;

    client.auth.onAuthStateChange((event, session) => {
      updateAuthUI(session?.user || null);
      if (event === 'SIGNED_IN' && session?.user) {
        // Trigger cloud data load
        if (window.loadFromCloud) window.loadFromCloud();
      }
    });

    // Check initial state
    client.auth.getUser().then(({ data: { user } }) => {
      updateAuthUI(user);
    });
  }

  // Initialize after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();
