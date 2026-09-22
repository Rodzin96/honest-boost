/* login.js */
(function () {
  'use strict';
  var HB = window.HB;
  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var msgEl = document.getElementById('msg');

  // Surface auth failures passed back as query params.
  var params = new URLSearchParams(location.search);

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
