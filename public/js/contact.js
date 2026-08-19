/* contact.js — contact form.
 * There is no mail endpoint for this form yet, so it points the user at the
 * support address instead of pretending the message was delivered (the previous
 * version faked a success message with setTimeout). */
(function () {
  'use strict';
  var form = document.getElementById('contactForm');
  if (!form) return;
  var msgDiv = document.getElementById('msg');
  var SUPPORT_EMAIL = 'suporte@honestboost.com';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var subject = 'Suporte: ' + (data.get('subject') || 'Contato pelo site');
    var body = [
      'Nome: ' + (data.get('name') || ''),
      'Email: ' + (data.get('email') || ''),
      '',
      String(data.get('message') || '')
    ].join('\n');

    var mailto = 'mailto:' + SUPPORT_EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);

    msgDiv.textContent = '';
    var note = document.createElement('span');
    note.style.color = 'var(--success, #6bcf7f)';
    note.textContent = 'Abrindo seu cliente de email para enviar a mensagem a ' + SUPPORT_EMAIL + '.';
    msgDiv.appendChild(note);

    window.location.href = mailto;
  });
})();
