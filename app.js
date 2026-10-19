// Paste your Apps Script Web App URL here after deploying Code.gs
const API_URL = 'https://script.google.com/macros/s/AKfycbz2r50EiL0Vw6ubHGLp83PT-amWGsEJseXHGvggLDKrkPh3eOWn813brSn-lq9P9kgx/exec';

const MONTHS = Array.from({ length: 24 }, (_, i) => 'M' + (i + 1));
let state = { user: null, clients: [], headers: [] };

const $ = sel => document.querySelector(sel);

async function api(action, body) {
  if (!body) {
    const url = `${API_URL}?action=${encodeURIComponent(action)}`;
    const r = await fetch(url, { credentials: 'include' });
    return r.json();
  }
  const r = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...body }),
    headers: { 'Content-Type': 'text/plain' }, // avoid CORS preflight
  });
  return r.json();
}

async function load() {
  const res = await api('list');
  if (!res.ok) {
    if (res.error === 'unauthorized') {
      // Not signed in or not in Users tab
      $('#loginView').classList.remove('hidden');
      $('#dashView').classList.add('hidden');
      return;
    }
    alert('Error: ' + res.error);
    return;
  }
  state.user = res.user;
  state.headers = res.headers;
  state.clients = res.clients;
  $('#loginView').classList.add('hidden');
  $('#dashView').classList.remove('hidden');
  $('#userBar').textContent = `${state.user.email} (${state.user.role})`;
  render();
}

function render() {
  const q = $('#search').value.toLowerCase();
  const rows = state.clients.filter(c =>
    !q || String(c.Client || '').toLowerCase().includes(q));

  const header = `<tr>
    <th>Client</th><th>Phone</th><th>Loan</th><th>Monthly</th><th>Term</th>
    ${MONTHS.map(m => `<th>${m}</th>`).join('')}
    <th>Paid</th>
  </tr>`;

  const body = rows.map(c => {
    const term = Number(c.TermMonths) || 24;
    const activeMonths = MONTHS.slice(0, term);
    const paidCount = activeMonths.filter(m => c[m]).length;
    const cells = MONTHS.map((m, idx) => {
      if (idx >= term) return `<td class="month inactive"></td>`;
      const v = c[m];
      const cls = v ? 'paid' : 'unpaid';
      return `<td class="month ${cls}" data-row="${c._row}" data-month="${m}">${v ? '✓' : ''}</td>`;
    }).join('');
    return `<tr>
      <td><a href="#" class="clientLink" data-row="${c._row}">${c.Client || ''}</a></td>
      <td>${c.Phone || ''}</td>
      <td>${c.LoanAmount || ''}</td>
      <td>${c.Monthly || ''}</td>
      <td>${term}</td>
      ${cells}
      <td>${paidCount}/${term}</td>
    </tr>`;
  }).join('');

  $('#clientsTable').innerHTML = header + body;
  $('#summary').textContent = `${rows.length} clients`;

  document.querySelectorAll('.clientLink').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      openDetail(+a.dataset.row);
    });
  });

  document.querySelectorAll('td.month').forEach(td => {
    td.addEventListener('click', async () => {
      if (state.user.role !== 'admin') return;
      const row = +td.dataset.row;
      const month = td.dataset.month;
      const value = td.classList.contains('paid') ? '' : new Date().toISOString().slice(0,10);
      td.textContent = '...';
      const res = await api('mark_payment', { row, month, value });
      if (!res.ok) { alert('Error: ' + res.error); return; }
      await load();
    });
  });
}

let currentDetailRow = null;

function openDetail(row) {
  const c = state.clients.find(x => x._row === row);
  if (!c) return;
  currentDetailRow = row;
  const term = Number(c.TermMonths) || 24;
  const activeMonths = MONTHS.slice(0, term);
  const paid = activeMonths.filter(m => c[m]);
  const unpaid = activeMonths.filter(m => !c[m]);
  const loan = Number(c.LoanAmount) || 0;
  const monthly = Number(c.Monthly) || 0;
  const totalDue = monthly * term;
  const paidAmount = monthly * paid.length;
  const balance = totalDue - paidAmount;

  const paymentRows = activeMonths.map(m => `
    <tr>
      <td>${m}</td>
      <td>${c[m] ? '<span class="paid-tag">Paid</span>' : '<span class="unpaid-tag">Unpaid</span>'}</td>
      <td>${c[m] || ''}</td>
    </tr>`).join('');

  $('#detailContent').innerHTML = `
    <h3>${c.Client || ''}</h3>
    <div class="detail-grid">
      <div><b>Phone:</b> ${c.Phone || '—'}</div>
      <div><b>Start Date:</b> ${c.StartDate || '—'}</div>
      <div><b>Loan Amount:</b> ${loan.toLocaleString()}</div>
      <div><b>Monthly:</b> ${monthly.toLocaleString()}</div>
      <div><b>Term:</b> ${term} months</div>
      <div><b>Paid:</b> ${paid.length} / ${term}</div>
      <div><b>Total Due:</b> ${totalDue.toLocaleString()}</div>
      <div><b>Collected:</b> ${paidAmount.toLocaleString()}</div>
      <div><b>Balance:</b> <span class="${balance > 0 ? 'bal-due' : 'bal-ok'}">${balance.toLocaleString()}</span></div>
    </div>
    ${c.Notes ? `<p><b>Notes:</b> ${c.Notes}</p>` : ''}
    <h4>Payment History</h4>
    <table class="detail-table">
      <thead><tr><th>Month</th><th>Status</th><th>Paid On</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>
  `;
  $('#detailDialog').showModal();
}

$('#closeDetailBtn').addEventListener('click', () => $('#detailDialog').close());

$('#editBtn').addEventListener('click', () => {
  if (state.user.role !== 'admin') return alert('Admins only');
  const c = state.clients.find(x => x._row === currentDetailRow);
  if (!c) return;
  const form = $('#clientDialog form');
  ['Client','Phone','LoanAmount','Monthly','TermMonths','StartDate','Notes'].forEach(k => {
    const input = form.querySelector(`[name="${k}"]`);
    if (input) input.value = c[k] || '';
  });
  $('#dialogTitle').textContent = 'Edit Client';
  form.dataset.editRow = currentDetailRow;
  $('#detailDialog').close();
  $('#clientDialog').showModal();
});

$('#deleteBtn').addEventListener('click', async () => {
  if (state.user.role !== 'admin') return alert('Admins only');
  if (!confirm('Delete this client? This cannot be undone.')) return;
  const res = await api('delete_client', { row: currentDetailRow });
  if (!res.ok) return alert('Error: ' + res.error);
  $('#detailDialog').close();
  await load();
});

$('#signInBtn').addEventListener('click', () => {
  // Opening the Apps Script URL once triggers Google sign-in in that domain
  window.open(API_URL + '?action=me', '_blank');
  setTimeout(load, 1500);
});

$('#addBtn').addEventListener('click', () => {
  const form = $('#clientDialog form');
  form.reset();
  delete form.dataset.editRow;
  $('#dialogTitle').textContent = 'Add Client';
  $('#clientDialog').showModal();
});

$('#clientDialog').addEventListener('close', async (e) => {
  if ($('#clientDialog').returnValue !== 'save') return;
  const form = $('#clientDialog form');
  const client = {};
  new FormData(form).forEach((v, k) => client[k] = v);
  const editRow = form.dataset.editRow;
  form.reset();
  delete form.dataset.editRow;
  const res = editRow
    ? await api('update_client', { row: +editRow, client })
    : await api('add_client', { client });
  if (!res.ok) { alert('Error: ' + res.error); return; }
  await load();
});

$('#search').addEventListener('input', render);

load();
