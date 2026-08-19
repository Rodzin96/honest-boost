/* reset.js — apply a password reset token. */
(function () {
  'use strict';
  var HB = window.HB;
  var form = document.getElementById('resetForm');
  var btn = document.getElementById('resetBtn');
  var msgEl = document.getElementById('msg');
  var tokenInput = document.getElementById('token');

  // Prefill the token when arriving from the emailed link.
  var tokenFromUrl = new URLSearchParams(location.search).get('token');
  if (tokenFromUrl && tokenInput) tokenInput.value = tokenFromUrl;

  var passwordInput = document.getElementById('password');
  var strengthBar = document.querySelector('.password-strength-bar');
  var strengthText = document.getElementById('strengthText');

  function checkPasswordStrength(password) {
    var strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    if (strength < 2) { strengthBar.className = 'password-strength-bar weak'; strengthText.textContent = 'Fraca'; }
    else if (strength < 4) { strengthBar.className = 'password-strength-bar medium'; strengthText.textContent = 'Média'; }
    else { strengthBar.className = 'password-strength-bar strong'; strengthText.textContent = 'Forte'; }
  }
  if (passwordInput) {
    passwordInput.addEventListener('input', function (e) { checkPasswordStrength(e.target.value); });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    HB.setLoading(btn, true, 'Alterando...');
    HB.setMessage(msgEl, '');

    try {
      var f = new FormData(form);
      var out = await HB.api('/api/password-reset-confirm', {
        method: 'POST',
        body: { token: f.get('token'), newPassword: f.get('password') }
      });
      if (out.res.ok) {
        HB.setMessage(msgEl, 'Senha alterada com sucesso! Redirecionando...', 'success');
        setTimeout(function () { window.location = '/login.html'; }, 1500);
        return;
      }
      HB.setMessage(msgEl, HB.errorMessage(out.data, 'Erro ao alterar senha.'), 'error');
    } catch (err) {
      HB.setMessage(msgEl, 'Erro de conexão. Tente novamente.', 'error');
    }
    HB.setLoading(btn, false);
  });
})();
