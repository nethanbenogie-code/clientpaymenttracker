// Paste your Apps Script Web App URL here after deploying Code.gs
const API_URL = 'https://script.google.com/macros/s/AKfycbzih-CKWEdQomlg9RIhQ-LA9ANAslkAzhFSd0VkaeKEMrknOk7lTTbbeoZtOabT-aj1/exec';

const MONTHS = Array.from({ length: 24 }, (_, i) => 'M' + (i + 1));
let state = { user: null, clients: [], headers: [], pw: localStorage.getItem('ct_pw') || '' };

const $ = sel => document.querySelector(sel);

async function api(action, body) {
  if (!body) {
    const url = `${API_URL}?action=${encodeURIComponent(action)}&pw=${encodeURIComponent(state.pw)}`;
    const r = await fetch(url);
    return r.json();
  }
  const r = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, pw: state.pw, ...body }),
    headers: { 'Content-Type': 'text/plain' }, // avoid CORS preflight
  });
  return r.json();
}

async function load() {
  if (!state.pw) {
    showLogin();
    return;
  }
  const res = await api('list');
  if (!res.ok) {
    if (res.error === 'unauthorized') {
      localStorage.removeItem('ct_pw');
      state.pw = '';
      showLogin('Wrong password. Try again.');
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
  $('#userBar').innerHTML = `${state.user.role} <a href="#" id="logoutBtn">(sign out)</a>`;
  $('#logoutBtn').addEventListener('click', e => {
    e.preventDefault();
    localStorage.removeItem('ct_pw');
    state.pw = '';
    location.reload();
  });
  render();
}

function showLogin(msg) {
  $('#loginView').classList.remove('hidden');
  $('#dashView').classList.add('hidden');
  if (msg) $('#loginMsg').textContent = msg;
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

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#pwInput').value;
  if (!pw) return;
  state.pw = pw;
  $('#loginMsg').textContent = 'Checking password with Google Sheets...';
  $('#loginMsg').className = 'hint info';
  try {
    const res = await api('me');
    if (res.ok) {
      localStorage.setItem('ct_pw', pw);
      $('#loginMsg').textContent = `Success — signed in as ${res.user.role}`;
      $('#loginMsg').className = 'hint ok';
      $('#pwInput').value = '';
      setTimeout(load, 400);
    } else {
      $('#loginMsg').textContent = `Wrong password (server responded: ${res.error})`;
      $('#loginMsg').className = 'hint err';
      state.pw = '';
    }
  } catch (err) {
    $('#loginMsg').textContent = `Could not reach Google Sheets: ${err.message}`;
    $('#loginMsg').className = 'hint err';
    state.pw = '';
  }
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

// ===== Export: CSV of all clients =====
$('#exportCsvBtn').addEventListener('click', () => {
  if (!state.clients.length) return alert('No clients to export.');
  const cols = ['Client','Phone','LoanAmount','Monthly','TermMonths','StartDate',
    ...MONTHS, 'Notes','PaidCount','PaidAmount','Balance'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  state.clients.forEach(c => {
    const term = Number(c.TermMonths) || 24;
    const paid = MONTHS.slice(0, term).filter(m => c[m]).length;
    const monthly = Number(c.Monthly) || 0;
    const paidAmt = monthly * paid;
    const balance = monthly * term - paidAmt;
    const row = cols.map(col => {
      if (col === 'PaidCount') return paid;
      if (col === 'PaidAmount') return paidAmt;
      if (col === 'Balance') return balance;
      return c[col] ?? '';
    });
    lines.push(row.map(esc).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `client-tracker-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ===== Report: full summary (opens printable window) =====
$('#reportBtn').addEventListener('click', () => {
  const totals = state.clients.reduce((acc, c) => {
    const term = Number(c.TermMonths) || 24;
    const monthly = Number(c.Monthly) || 0;
    const paid = MONTHS.slice(0, term).filter(m => c[m]).length;
    acc.loan += Number(c.LoanAmount) || 0;
    acc.totalDue += monthly * term;
    acc.collected += monthly * paid;
    acc.clients++;
    return acc;
  }, { loan: 0, totalDue: 0, collected: 0, clients: 0 });
  const balance = totals.totalDue - totals.collected;

  const monthlyCollection = MONTHS.map(m => {
    const total = state.clients.reduce((s, c) => {
      const term = Number(c.TermMonths) || 24;
      const monthly = Number(c.Monthly) || 0;
      const idx = MONTHS.indexOf(m);
      if (idx >= term) return s;
      return s + (c[m] ? monthly : 0);
    }, 0);
    return { month: m, total };
  });

  const clientRows = state.clients.map(c => {
    const term = Number(c.TermMonths) || 24;
    const monthly = Number(c.Monthly) || 0;
    const paid = MONTHS.slice(0, term).filter(m => c[m]).length;
    const bal = monthly * term - monthly * paid;
    return `<tr>
      <td>${c.Client || ''}</td>
      <td>${c.Phone || ''}</td>
      <td style="text-align:right">${(Number(c.LoanAmount) || 0).toLocaleString()}</td>
      <td style="text-align:right">${monthly.toLocaleString()}</td>
      <td style="text-align:center">${paid}/${term}</td>
      <td style="text-align:right">${(monthly * paid).toLocaleString()}</td>
      <td style="text-align:right ${bal > 0 ? 'color:#991b1b' : 'color:#065f46'}">${bal.toLocaleString()}</td>
    </tr>`;
  }).join('');

  const monthRows = monthlyCollection.map(m => `
    <tr><td>${m.month}</td><td style="text-align:right">${m.total.toLocaleString()}</td></tr>
  `).join('');

  openPrintWindow(`
    <h1>Payment Summary Report</h1>
    <p>Generated ${new Date().toLocaleString()}</p>
    <div class="totals">
      <div><b>Clients:</b> ${totals.clients}</div>
      <div><b>Total Loaned:</b> ${totals.loan.toLocaleString()}</div>
      <div><b>Total Due:</b> ${totals.totalDue.toLocaleString()}</div>
      <div><b>Collected:</b> ${totals.collected.toLocaleString()}</div>
      <div><b>Outstanding Balance:</b> ${balance.toLocaleString()}</div>
    </div>
    <h2>Per Client</h2>
    <table>
      <thead><tr><th>Client</th><th>Phone</th><th>Loan</th><th>Monthly</th><th>Paid</th><th>Collected</th><th>Balance</th></tr></thead>
      <tbody>${clientRows}</tbody>
    </table>
    <h2>Collection by Month</h2>
    <table style="max-width:300px">
      <thead><tr><th>Month</th><th>Collected</th></tr></thead>
      <tbody>${monthRows}</tbody>
    </table>
  `);
});

// ===== Report: per-client statement =====
$('#statementBtn').addEventListener('click', () => {
  const c = state.clients.find(x => x._row === currentDetailRow);
  if (!c) return;
  const term = Number(c.TermMonths) || 24;
  const activeMonths = MONTHS.slice(0, term);
  const monthly = Number(c.Monthly) || 0;
  const paid = activeMonths.filter(m => c[m]);
  const totalDue = monthly * term;
  const paidAmount = monthly * paid.length;
  const balance = totalDue - paidAmount;

  const rows = activeMonths.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${m}</td>
      <td style="text-align:right">${monthly.toLocaleString()}</td>
      <td>${c[m] ? 'PAID' : 'DUE'}</td>
      <td>${c[m] || ''}</td>
    </tr>`).join('');

  openPrintWindow(`
    <h1>Payment Statement</h1>
    <p>Issued ${new Date().toLocaleString()}</p>
    <div class="totals">
      <div><b>Client:</b> ${c.Client || ''}</div>
      <div><b>Phone:</b> ${c.Phone || '—'}</div>
      <div><b>Start Date:</b> ${c.StartDate || '—'}</div>
      <div><b>Loan Amount:</b> ${(Number(c.LoanAmount) || 0).toLocaleString()}</div>
      <div><b>Monthly Payment:</b> ${monthly.toLocaleString()}</div>
      <div><b>Term:</b> ${term} months</div>
      <div><b>Total Due:</b> ${totalDue.toLocaleString()}</div>
      <div><b>Paid So Far:</b> ${paidAmount.toLocaleString()} (${paid.length} of ${term} months)</div>
      <div><b>Outstanding Balance:</b> <span style="color:${balance > 0 ? '#991b1b' : '#065f46'}">${balance.toLocaleString()}</span></div>
    </div>
    <h2>Schedule</h2>
    <table>
      <thead><tr><th>#</th><th>Month</th><th>Amount</th><th>Status</th><th>Paid On</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${c.Notes ? `<p><b>Notes:</b> ${c.Notes}</p>` : ''}
  `);
});

function openPrintWindow(bodyHtml) {
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>Report</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 30px; color: #1a1a1a; }
      h1 { margin: 0 0 4px; }
      h2 { margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px;
        background: #f6f7f9; padding: 14px; border-radius: 8px; margin: 14px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
      th, td { padding: 6px 10px; border-bottom: 1px solid #eef0f3; text-align: left; }
      th { background: #f3f4f6; }
      @media print { button { display: none; } }
    </style></head><body>
    <button onclick="window.print()" style="float:right;padding:8px 14px;cursor:pointer;background:#2563eb;color:#fff;border:0;border-radius:6px">Print / Save PDF</button>
    ${bodyHtml}
    </body></html>`);
  w.document.close();
}

load();
