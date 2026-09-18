// Admin report: every Scout's uploaded orders for a season. The page and its API are
// restricted to the "admin" role in staticwebapp.config.json.
import { renderReport, downloadCsv, esc } from './report.js';
import { SALES_GOAL } from './products.js';

const $ = sel => document.querySelector(sel);
let orders = [];

const thisYear = new Date().getFullYear();
$('#season').innerHTML = [0, 1, 2].map(n => `<option>${thisYear - n}</option>`).join('');

async function load() {
  const season = $('#season').value;
  $('#status').textContent = 'Loading…';
  try {
    const res = await fetch(`/api/report/orders?season=${season}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 403 ? 'Your account is not an admin for this app.' : `Error ${res.status}`);
    orders = (await res.json()).orders;
    $('#status').textContent = `Updated ${new Date().toLocaleTimeString()}. Orders appear here once a Scout's phone uploads them.`;
    $('#report').innerHTML = renderReport(orders, { showSellers: true, goal: SALES_GOAL });
  } catch (err) {
    $('#status').innerHTML = `<span class="warn">Could not load orders: ${esc(err.message)}</span>`;
  }
}

$('#season').addEventListener('change', load);
$('#refresh').addEventListener('click', load);
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="export-csv"]')) downloadCsv(orders, `all-orders-${$('#season').value}`);
});

load();
