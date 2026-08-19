/* admin.js — licenses and orders tables.
 *
 * All cell values go through createTextNode / textContent. The previous version
 * concatenated user-controlled fields (email) straight into innerHTML, which was
 * a stored XSS vector: a signup with an email containing markup executed script
 * in the admin's browser. */
(function () {
  'use strict';
  var HB = window.HB;
  var listEl = document.getElementById('list');
  var refreshBtn = document.getElementById('refreshBtn');
  var tabs = document.querySelectorAll('.admin-tab');
  var currentView = 'licenses';

  function placeholder(icon, text, isError) {
    var wrap = document.createElement('div');
    wrap.style.padding = '2rem';
    wrap.style.textAlign = 'center';
    wrap.style.color = isError ? 'var(--error)' : 'var(--on-surface-variant)';
    var i = document.createElement('span');
    i.className = 'material-symbols-rounded';
    i.style.fontSize = '2rem';
    i.textContent = icon;
    wrap.appendChild(i);
    wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode(text));
    return wrap;
  }

  function statusBadge(status) {
    var span = document.createElement('span');
    var cls = 'status-pending';
    var icon = 'schedule';
    if (status === 'active' || status === 'paid') { cls = 'status-active'; icon = 'check_circle'; }
    else if (status === 'revoked' || status === 'refunded' || status === 'failed') { cls = 'status-error'; icon = 'block'; }
    span.className = 'status-badge ' + cls;
    var i = document.createElement('span');
    i.className = 'material-symbols-rounded';
    i.style.fontSize = '14px';
    i.textContent = icon;
    span.appendChild(i);
    span.appendChild(document.createTextNode(' ' + (status || '-')));
    return span;
  }

  function buildTable(columns, rows) {
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      columns.forEach(function (col) {
        var td = document.createElement('td');
        if (col.style) td.setAttribute('style', col.style);
        var value = row[col.key];
        if (col.render) {
          var node = col.render(value, row);
          if (node instanceof Node) td.appendChild(node);
          else td.textContent = String(node === null || node === undefined ? '-' : node);
        } else {
          td.textContent = (value === null || value === undefined || value === '') ? '-' : String(value);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  var MONO = "font-family:'Courier New',monospace;font-size:0.82rem;";
  var DIM = 'font-size:0.82rem;color:var(--on-surface-variant);';

  var LICENSE_COLUMNS = [
    { key: 'id', label: 'ID' },
    { key: 'license_key', label: 'Chave', style: MONO },
    { key: 'email', label: 'Email' },
    { key: 'product', label: 'Produto' },
    { key: 'status', label: 'Status', render: function (v) { return statusBadge(v); } },
    { key: 'order_id', label: 'Pedido', style: MONO },
    { key: 'created_at', label: 'Criado em', style: DIM }
  ];

  var ORDER_COLUMNS = [
    { key: 'id', label: 'ID' },
    { key: 'order_id', label: 'Pedido', style: MONO },
    { key: 'email', label: 'Email' },
    { key: 'product', label: 'Produto' },
    {
      key: 'amount',
      label: 'Valor',
      render: function (v) {
        return typeof v === 'number' ? 'R$ ' + (v / 100).toFixed(2).replace('.', ',') : '-';
      }
    },
    { key: 'status', label: 'Status', render: function (v) { return statusBadge(v); } },
    { key: 'created_at', label: 'Criado em', style: DIM }
  ];

  async function load() {
    listEl.replaceChildren(placeholder('hourglass', 'Carregando...'));
    var isLicenses = currentView === 'licenses';
    var url = isLicenses ? '/api/licenses' : '/api/orders';

    try {
      var out = await HB.api(url);
      if (out.res.status === 401 || out.res.status === 403) {
        listEl.replaceChildren(placeholder('lock', 'Acesso restrito. Faça login como administrador.', true));
        return;
      }
      if (!out.res.ok || !Array.isArray(out.data)) {
        listEl.replaceChildren(placeholder('error', 'Erro ao carregar os dados.', true));
        return;
      }
      if (!out.data.length) {
        listEl.replaceChildren(placeholder('inbox', isLicenses ? 'Nenhuma licença gerada ainda.' : 'Nenhum pedido registrado ainda.'));
        return;
      }
      listEl.replaceChildren(buildTable(isLicenses ? LICENSE_COLUMNS : ORDER_COLUMNS, out.data));
    } catch (err) {
      listEl.replaceChildren(placeholder('error', 'Erro de conexão.', true));
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentView = tab.dataset.view;
      load();
    });
  });

  if (refreshBtn) refreshBtn.addEventListener('click', load);

  // --- Manual license generation (admin-only endpoint) ---
  var genForm = document.getElementById('genForm');
  if (genForm) {
    var genMsg = document.getElementById('genMsg');
    var genBtn = document.getElementById('genBtn');
    genForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      HB.setLoading(genBtn, true, 'Gerando...');
      HB.setMessage(genMsg, '');
      try {
        var f = new FormData(genForm);
        var out = await HB.api('/api/licenses', {
          method: 'POST',
          body: { email: f.get('email'), product: f.get('product') }
        });
        if (out.res.ok && out.data) {
          HB.setMessage(genMsg, 'Licença gerada: ' + out.data.license, 'success');
          genForm.reset();
          currentView = 'licenses';
          tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.view === 'licenses'); });
          load();
        } else {
          HB.setMessage(genMsg, HB.errorMessage(out.data, 'Erro ao gerar licença.'), 'error');
        }
      } catch (err) {
        HB.setMessage(genMsg, 'Erro de conexão.', 'error');
      }
      HB.setLoading(genBtn, false);
    });
  }

  load();
})();
