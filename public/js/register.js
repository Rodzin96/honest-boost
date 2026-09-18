/* register.js */
(function () {
  'use strict';
  var HB = window.HB;
  var form = document.getElementById('regForm');
  var btn = document.getElementById('regBtn');
  var msgEl = document.getElementById('msg');

  // Password strength meter. Thresholds match the backend minimum of 8 chars.
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
    HB.setLoading(btn, true, 'Criando conta...');
    HB.setMessage(msgEl, '');

    try {
      var f = new FormData(form);
      var out = await HB.api('/api/register', {
        method: 'POST',
        body: { username: f.get('username'), password: f.get('password'), nickname: f.get('nickname') }
      });
      if (out.res.ok && out.data && out.data.ok) {
      HB.setMessage(msgEl, 'Conta criada com sucesso! Redirecionando para login...', 'success');
      setTimeout(function () { window.location = '/login.html'; }, 1200);
        return;
      }
      HB.setMessage(msgEl, HB.errorMessage(out.data, 'Erro ao criar conta.'), 'error');
    } catch (err) {
      HB.setMessage(msgEl, 'Erro de conexão. Tente novamente.', 'error');
    }
    HB.setLoading(btn, false);
  });
})();
