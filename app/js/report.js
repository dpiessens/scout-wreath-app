// Sales report and CSV export, shared by the Scout's own report page and the admin page.
import { PRODUCTS } from './products.js';

export const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const catalogOrder = new Map(PRODUCTS.map((p, i) => [p.id, i]));
const byCatalog = (a, b) => (catalogOrder.get(a.id) ?? 1e9) - (catalogOrder.get(b.id) ?? 1e9) || a.name.localeCompare(b.name);

export function summarize(orders) {
  const byProduct = {}, byMethod = { cash: 0, check: 0, venmo: 0 }, byDiscount = {}, bySeller = {};
  let revenue = 0, donations = 0;
  for (const o of orders) {
    revenue += o.total;
    donations += o.donation || 0;
    byMethod[o.payment.method] = (byMethod[o.payment.method] || 0) + o.total;
    // Group Scouts loosely, like the API does, so "Sam P" and "sam  p" are one Scout.
    const name = (o.seller || '').trim().replace(/\s+/g, ' ') || '(no name)';
    const s = bySeller[name.toLowerCase()] ??= { name, orders: 0, total: 0, spellings: {} };
    s.orders += 1; s.total += o.total;
    // Label the Scout with the spelling used most often.
    s.spellings[name] = (s.spellings[name] || 0) + 1;
    if (s.spellings[name] > (s.spellings[s.name] || 0)) s.name = name;
    for (const d of o.discounts || []) byDiscount[d.label] = (byDiscount[d.label] || 0) + d.amount;
    for (const it of o.items) {
      const r = byProduct[it.id] ??= { id: it.id, name: it.name, qty: 0, total: 0 };
      r.qty += it.qty; r.total += it.lineTotal;
    }
  }
  const checks = orders.filter(o => o.payment.method === 'check');
  return { revenue, donations, byMethod, byDiscount, bySeller, products: Object.values(byProduct).sort(byCatalog), checks };
}

/** A progress bar toward a sales goal. */
export function goalBar(total, goal) {
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const done = total >= goal;
  return `<div class="card goal">
    <div class="goal-head"><strong>${done ? '🎉 Goal reached!' : 'Sales goal'}</strong><span>${fmt(total)} of ${fmt(goal).replace('.00', '')}</span></div>
    <div class="goal-track" role="progressbar" aria-label="Progress toward the sales goal" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(total)}">
      <div class="goal-fill${done ? ' done' : ''}" style="width:${pct}%"></div>
    </div>
    <div class="hint">${done ? `${fmt(total - goal)} over the goal. Great work!` : `${pct}% of the way there. ${fmt(goal - total)} to go.`}</div>
  </div>`;
}

/**
 * The report as HTML.
 * - `summaryOrders`: what the totals add up (defaults to `orders`). The Scout's report passes the
 *   orders from every phone here, while `orders`, the detailed list, stays the ones on this phone.
 * - `goal`: shows progress toward it, and each Scout's progress in the By Scout table.
 * - `deletable` adds a Delete button to each order (the Scout's own device only).
 */
export function renderReport(orders, { deletable = false, showSellers = false, summaryOrders = orders, goal = 0, listTitle = 'Orders', note = '' } = {}) {
  const s = summarize(summaryOrders);
  const detail = summarize(orders);
  const rows = (list, cols) => list.map(r => `<tr>${cols(r)}</tr>`).join('');
  return `
    ${goal && !showSellers ? goalBar(s.revenue, goal) : ''}
    ${note ? `<div class="hint" style="margin:-4px 0 10px">${note}</div>` : ''}
    <div class="tiles">
      <div class="tile"><div class="v">${summaryOrders.length}</div><div class="k">Orders</div></div>
      <div class="tile"><div class="v">${fmt(s.revenue)}</div><div class="k">Total collected</div></div>
      <div class="tile"><div class="v">${fmt(s.revenue - s.donations)}</div><div class="k">Product sales</div></div>
      <div class="tile"><div class="v">${fmt(s.donations)}</div><div class="k">Donations</div></div>
    </div>
    <h2>By payment method</h2>
    <div class="card"><table>
      ${rows(Object.entries(s.byMethod), ([m, v]) => `<td style="text-transform:capitalize">${m}</td><td class="num">${fmt(v)}</td>`)}
    </table></div>
    ${showSellers ? `<h2>By Scout</h2>
    <div class="card"><table>
      <tr><th>Scout</th><th class="num">Orders</th><th class="num">Collected</th>${goal ? '<th class="num">Of goal</th>' : ''}</tr>
      ${rows(Object.values(s.bySeller).sort((a, b) => b.total - a.total), v => `<td>${esc(v.name)}</td><td class="num">${v.orders}</td><td class="num">${fmt(v.total)}</td>${goal ? `<td class="num">${v.total >= goal ? '🎉 ' : ''}${Math.round((v.total / goal) * 100)}%</td>` : ''}`)}
    </table></div>` : ''}
    <h2>By product</h2>
    <div class="card"><table>
      <tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th></tr>
      ${rows(s.products, r => `<td>${esc(r.name)}</td><td class="num">${r.qty}</td><td class="num">${fmt(r.total)}</td>`) || '<tr><td colspan="3" class="hint">No orders yet.</td></tr>'}
      ${rows(Object.entries(s.byDiscount), ([label, v]) => `<td>${esc(label)} discount</td><td></td><td class="num">−${fmt(v)}</td>`)}
    </table></div>
    ${detail.checks.length ? `<h2>Checks</h2>
    <div class="card"><table>
      <tr><th>Check #</th><th>From</th><th class="num">Amount</th></tr>
      ${rows(detail.checks, o => `<td>${esc(o.payment.checkNumber) || '<span class="hint">none</span>'}</td><td>${esc(o.customer.name)}</td><td class="num">${fmt(o.total)}</td>`)}
    </table></div>` : ''}
    <div class="row" style="margin:12px 0">
      <button class="btn primary" data-action="export-csv" ${orders.length ? '' : 'disabled'}>⬇ Export CSV</button>
    </div>
    <h2>${esc(listTitle)}</h2>
    ${[...orders].reverse().map(o => `<div class="card">
      <div class="order-head"><strong>${esc(o.customer.name)}</strong><span>${fmt(o.total)}</span></div>
      <div class="hint">${new Date(o.createdAt).toLocaleString()} · <span class="pill">${o.payment.method}${o.payment.checkNumber ? ' #' + esc(o.payment.checkNumber) : ''}</span>${o.seller ? ' · ' + esc(o.seller) : ''}${o.sync && o.sync !== 'synced' ? ` · <span class="pill warn-pill">${o.sync === 'error' ? 'upload failed' : 'not uploaded'}</span>` : ''}</div>
      <div>${esc(o.customer.address)}${o.customer.lat != null ? ` <a class="hint" target="_blank" rel="noopener" href="https://maps.google.com/?q=${o.customer.lat},${o.customer.lng}">map</a>` : ''}${o.customer.phone ? ` · ${esc(o.customer.phone)}` : ''}</div>
      <div class="hint">${[...o.items.map(i => `${i.qty} × ${esc(i.name)}`), ...(o.donation ? [`${fmt(o.donation)} donation`] : [])].join(', ')}</div>
      ${deletable ? `<button class="btn small danger" data-delete="${esc(o.id)}" style="margin-top:6px">Delete</button>` : ''}
    </div>`).join('')}`;
}

/** Download the orders as a CSV, one row per line item (plus discount and donation rows). */
export function downloadCsv(orders, name = 'scout-orders') {
  const cols = ['order_id', 'created_at', 'seller', 'customer_name', 'phone', 'address', 'lat', 'lng', 'gps_accuracy_m',
    'payment_method', 'check_number', 'product_id', 'product', 'category', 'unit_price', 'qty', 'line_total', 'order_total'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = orders.flatMap(o => {
    const parts = [...o.items];
    for (const d of o.discounts || []) parts.push({ id: 'discount', name: d.label, category: 'Discount', price: -d.amount, qty: 1, lineTotal: -d.amount });
    if (o.donation) parts.push({ id: 'donation', name: 'Donation', category: 'Donation', price: o.donation, qty: 1, lineTotal: o.donation });
    return parts.map(i => [o.id, o.createdAt, o.seller, o.customer.name, o.customer.phone, o.customer.address,
      o.customer.lat, o.customer.lng, o.customer.accuracy != null ? Math.round(o.customer.accuracy) : '', o.payment.method, o.payment.checkNumber,
      i.id, i.name, i.category, i.price, i.qty, i.lineTotal, o.total].map(q).join(','));
  });
  const blob = new Blob([[cols.join(','), ...lines].join('\r\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
