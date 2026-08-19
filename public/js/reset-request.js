/* reset-request.js — request a password reset token. */
(function () {
  'use strict';
  var HB = window.HB;
  var form = document.getElementById('reqForm');
  var btn = document.getElementById('reqBtn');
  var msgEl = document.getElementById('msg');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    HB.setLoading(btn, true, 'Enviando...');
    HB.setMessage(msgEl, '');

    try {
      var f = new FormData(form);
      var out = await HB.api('/api/password-reset-request', {
        method: 'POST',
        body: { username: f.get('username') }
      });
      if (out.res.ok && out.data) {
        // The backend answers the same way whether or not the account exists,
        // so the page must not claim the email was found.
        HB.setMessage(msgEl, out.data.message || 'Se a conta existir, um email de recuperação foi enviado.', 'success');

        // devToken is only present when the server runs outside production and
        // has no SMTP configured.
        if (out.data.devToken) {
          var hint = document.createElement('div');
          hint.style.marginTop = '0.8rem';
          hint.style.fontSize = '0.85rem';
          hint.style.wordBreak = 'break-all';
          hint.appendChild(document.createTextNode('Token (modo desenvolvimento): '));
          var code = document.createElement('strong');
          code.textContent = out.data.devToken;
          hint.appendChild(code);
          msgEl.appendChild(hint);
          setTimeout(function () {
            window.location = '/reset.html?token=' + encodeURIComponent(out.data.devToken);
          }, 4000);
        } else {
          setTimeout(function () { window.location = '/reset.html'; }, 3000);
        }
        return;
      }
      HB.setMessage(msgEl, HB.errorMessage(out.data, 'Erro ao solicitar recuperação.'), 'error');
    } catch (err) {
      HB.setMessage(msgEl, 'Erro de conexão. Tente novamente.', 'error');
    }
    HB.setLoading(btn, false);
  });
})();
