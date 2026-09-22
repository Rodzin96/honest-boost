/* login.js */
(function () {
  'use strict';
  var HB = window.HB;
  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var msgEl = document.getElementById('msg');

  // Esconde o botão Google quando o OAuth está desligado no servidor.
  HB.api('/api/auth-methods').then(function (out) {
    if (out.res.ok && out.data && out.data.google === false) {
      document.querySelectorAll('a[href="/auth/google"]').forEach(function (a) {
        var wrap = a.closest('.social-login, .social-row') || a;
        wrap.style.display = 'none';
      });
    }
  }).catch(function () {});

  // Surface OAuth failures passed back as query params.
  var params = new URLSearchParams(location.search);
  var oauthError = params.get('error');
  if (oauthError === 'google_not_configured') {
    HB.setMessage(msgEl, 'Login com Google não está configurado neste servidor.', 'error');
  } else if (oauthError === 'google_failed') {
    HB.setMessage(msgEl, 'Não foi possível entrar com o Google. Tente novamente.', 'error');
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    HB.setLoading(btn, true, 'Entrando...');
    HB.setMessage(msgEl, '');

    try {
      var f = new FormData(form);
      var out = await HB.api('/api/login', {
        method: 'POST',
        body: { username: f.get('username'), password: f.get('password') }
      });
      if (out.res.ok && out.data && out.data.ok) {
        HB.setMessage(msgEl, 'Login bem-sucedido! Redirecionando...', 'success');
        // Honour ?next= when it is a local path, otherwise use the role-based
        // target the backend chose. Sending everyone to /admin (the old
        // behaviour) bounced normal users straight back to the login page.
        var next = params.get('next');
        var target = (next && next.charAt(0) === '/' && next.charAt(1) !== '/')
          ? next
          : (out.data.redirectTo || '/dashboard');
        setTimeout(function () { window.location = target; }, 600);
        return;
      }
      HB.setMessage(msgEl, HB.errorMessage(out.data, 'Erro ao fazer login.'), 'error');
    } catch (err) {
      HB.setMessage(msgEl, 'Erro de conexão. Tente novamente.', 'error');
    }
    HB.setLoading(btn, false);
  });
})();
