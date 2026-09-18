// Scout Orders — concept prototype.
// All data lives in this browser's localStorage (see PLAN.md for the production storage plan).

const ORDERS_KEY = 'scoutOrders.orders.v1';
const SETTINGS_KEY = 'scoutOrders.settings.v1';
const DONATION_PRESETS = [5, 10, 20, 50];

const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const money = v => Math.max(0, Math.round((parseFloat(v) || 0) * 100) / 100);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

let settings = load(SETTINGS_KEY, { seller: '', venmoQr: '', checkPayableTo: '' });
let orders = load(ORDERS_KEY, []);
let state = newOrder();
let view = 'shop';

// The troop's Venmo QR ships with the site at img/venmo-qr.png; one uploaded in Settings overrides it.
const DEFAULT_VENMO_QR = 'img/venmo-qr.png';
let hasDefaultQr = false;
const venmoQr = () => settings.venmoQr || (hasDefaultQr ? DEFAULT_VENMO_QR : '');
Object.assign(new Image(), {
  onload: () => { hasDefaultQr = true; if (view === 'payment' || view === 'settings') render(); },
  src: DEFAULT_VENMO_QR,
});
let locStatus = '';

function newOrder() {
  return {
    cart: {},
    donation: 0,
    customer: { name: '', phone: '', address: '', lat: null, lng: null, accuracy: null },
    payment: { method: null, checkNumber: '' },
  };
}

function cartLines() {
  return PRODUCTS.filter(p => state.cart[p.id] > 0)
    .map(p => ({ id: p.id, name: p.name, category: p.category, price: p.price, qty: state.cart[p.id], lineTotal: p.price * state.cart[p.id] }));
}
// Bundle discounts (e.g. popcorn 3 for $25). The priciest units go into bundles first,
// so mixed prices always get the customer the better deal.
function discounts() {
  const lines = cartLines();
  return (window.PRICING_RULES || []).map(r => {
    const prices = lines.filter(l => l.category === r.category)
      .flatMap(l => Array(l.qty).fill(l.price)).sort((a, b) => b - a);
    const bundles = Math.floor(prices.length / r.bundleSize);
    const amount = prices.slice(0, bundles * r.bundleSize).reduce((s, p) => s + p, 0) - bundles * r.bundlePrice;
    return { label: r.label, amount: Math.round(amount * 100) / 100 };
  }).filter(d => d.amount > 0);
}

// "Add 1 more for 3 for $25" under a category that has a bundle rule.
function dealHint(category) {
  const r = (window.PRICING_RULES || []).find(r => r.category === category);
  if (!r) return '';
  const n = cartLines().filter(l => l.category === category).reduce((s, l) => s + l.qty, 0);
  const short = (r.bundleSize - (n % r.bundleSize)) % r.bundleSize;
  return n && short ? `Add ${short} more for ${r.bundleSize} for ${fmt(r.bundlePrice).replace('.00', '')}.` : '';
}

const cartTotal = () => cartLines().reduce((s, l) => s + l.lineTotal, 0)
  - discounts().reduce((s, d) => s + d.amount, 0) + state.donation;

function go(v) { view = v; render(); window.scrollTo(0, 0); }

// ---------- Views ----------

function steps(n) {
  return `<div class="steps">${[1, 2, 3].map(i => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;
}

function bottomBar(label, action, enabled, back) {
  return `<div class="bottombar"><div class="inner">
    ${back ? `<button class="btn" data-go="${back}">Back</button>` : ''}
    <div class="total" id="total">${fmt(cartTotal())}</div>
    <button class="btn primary" data-action="${action}" ${enabled ? '' : 'disabled'}>${label}</button>
  </div></div>`;
}

function thumb(p) {
  const icon = CATEGORY_ICONS[p.category] || '🛍️';
  return p.image
    ? `<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy" data-icon="${icon}">`
    : `<div class="thumb placeholder" aria-hidden="true">${icon}</div>`;
}

// A missing thumbnail falls back to the category icon.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('thumb')) return;
  img.replaceWith(Object.assign(document.createElement('div'), { className: 'thumb placeholder', textContent: img.dataset.icon }));
}, true);

function viewShop() {
  const cats = [...new Set(PRODUCTS.map(p => p.category))];
  const d = state.donation;
  return `${steps(1)}<h1>Choose your items</h1>
    ${cats.map(cat => `<h2>${esc(cat)}</h2>
      ${CATEGORY_NOTES?.[cat] ? `<div class="cat-note">${esc(CATEGORY_NOTES[cat])} <strong>${dealHint(cat)}</strong></div>` : ''}
      ${PRODUCTS.filter(p => p.category === cat).map(p => {
        const q = state.cart[p.id] || 0;
        return `<div class="card product ${q ? 'selected' : ''}">
          ${thumb(p)}
          <div class="info">
            <div class="name">${p.number != null ? `<span class="item-no">#${p.number}</span> ` : ''}${esc(p.name)}</div>
            ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}
            <div class="price-row">
              <div class="price">${fmt(p.price)}</div>
              <div class="stepper">
                <button data-dec="${p.id}" aria-label="Remove one">−</button>
                <span class="qty">${q}</span>
                <button data-inc="${p.id}" aria-label="Add one">+</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}`).join('')}
    <h2>Donation</h2>
    <div class="card ${d ? 'selected' : ''}" id="donationCard">
      <div class="desc">Add a donation to support the troop.</div>
      <div class="chips">
        ${DONATION_PRESETS.map(v => `<button class="chip ${d === v ? 'on' : ''}" data-donate="${v}">${fmt(v).replace('.00', '')}</button>`).join('')}
        <button class="chip ${d ? '' : 'on'}" data-donate="0">None</button>
      </div>
      <label for="donation">Other amount</label>
      <div class="money"><span>$</span><input id="donation" type="number" inputmode="decimal" min="0" step="1" data-bind-donation value="${d || ''}" placeholder="0"></div>
    </div>
    ${bottomBar('Next', 'to-customer', cartTotal() > 0)}`;
}

function viewCustomer() {
  const c = state.customer;
  return `${steps(2)}<h1>Customer information</h1>
    <label for="name">Name</label>
    <input id="name" type="text" autocomplete="off" data-bind="name" value="${esc(c.name)}" placeholder="First and last name">

    <label for="address">Address</label>
    <button class="btn block" data-action="locate">📍 Use current location</button>
    <div class="hint" id="locStatus">${esc(locStatus)}</div>
    <textarea id="address" data-bind="address" placeholder="Street, city, state, ZIP">${esc(c.address)}</textarea>
    <div class="hint">Check the house number with the customer — GPS can land on a neighbor.</div>

    <label for="phone">Phone <span class="hint">(optional)</span></label>
    <input id="phone" type="tel" autocomplete="off" data-bind="phone" value="${esc(c.phone)}">
    ${bottomBar('Next', 'to-payment', c.name.trim() && c.address.trim(), 'shop')}`;
}

function viewPayment() {
  const p = state.payment, total = cartTotal();
  const opt = (m, ico, label) => `<button class="payopt ${p.method === m ? 'on' : ''}" data-pay="${m}"><span class="ico">${ico}</span>${label}</button>`;
  let detail = '';
  if (p.method === 'cash') {
    detail = `<div class="card center">Collect <strong>${fmt(total)}</strong> in cash.</div>`;
  } else if (p.method === 'check') {
    detail = `<div class="card">
      <div>Check for <strong>${fmt(total)}</strong>${settings.checkPayableTo ? ` payable to <strong>${esc(settings.checkPayableTo)}</strong>` : ''}.</div>
      <label for="checkNo">Check number</label>
      <input id="checkNo" type="text" inputmode="numeric" data-bind-pay="checkNumber" value="${esc(p.checkNumber)}">
    </div>`;
  } else if (p.method === 'venmo') {
    detail = venmoQr()
      ? `<div class="card center">
          <div class="big">Pay <strong>${fmt(total)}</strong> on Venmo</div>
          <div class="qr"><img src="${venmoQr()}" alt="Venmo QR code"></div>
          <div class="hint">Scan with the Venmo app. Wait for the payment to arrive before completing the order.</div>
        </div>`
      : `<div class="card warn">No Venmo QR code yet. Add it under ⚙️ Settings.</div>`;
  }
  return `${steps(3)}<h1>Payment</h1>
    <div class="card">
      <table>${cartLines().map(l => `<tr><td>${l.qty} × ${esc(l.name)}</td><td class="num">${fmt(l.lineTotal)}</td></tr>`).join('')}
      ${discounts().map(d => `<tr><td>${esc(d.label)}</td><td class="num">−${fmt(d.amount)}</td></tr>`).join('')}
      ${state.donation ? `<tr><td>Donation</td><td class="num">${fmt(state.donation)}</td></tr>` : ''}
      <tr><th>Total</th><th class="num">${fmt(total)}</th></tr></table>
    </div>
    <h2>Payment method</h2>
    <div class="paygrid">${opt('cash', '💵', 'Cash')}${opt('check', '🧾', 'Check')}${opt('venmo', '📱', 'Venmo')}</div>
    <div style="margin-top:12px">${detail}</div>
    ${bottomBar('Complete order', 'complete', !!p.method, 'customer')}`;
}

function viewDone() {
  const o = orders[orders.length - 1];
  return `<div class="center" style="padding-top:24px">
    <div style="font-size:3rem">🎉</div>
    <h1>Thank you, ${esc(o.customer.name.split(' ')[0])}!</h1>
    <p>Order of <strong>${fmt(o.total)}</strong> paid by ${o.payment.method} has been recorded.</p>
    <button class="btn primary block" data-action="restart">Start next order</button>
  </div>`;
}

function viewReport() {
  const byProduct = {}, byMethod = { cash: 0, check: 0, venmo: 0 }, byDiscount = {};
  let revenue = 0, donations = 0;
  for (const o of orders) {
    revenue += o.total;
    donations += o.donation || 0;
    for (const d of o.discounts || []) byDiscount[d.label] = (byDiscount[d.label] || 0) + d.amount;
    byMethod[o.payment.method] = (byMethod[o.payment.method] || 0) + o.total;
    for (const it of o.items) {
      const r = byProduct[it.id] ??= { name: it.name, qty: 0, total: 0 };
      r.qty += it.qty; r.total += it.lineTotal;
    }
  }
  return `<h1>Sales report</h1>
    <div class="tiles">
      <div class="tile"><div class="v">${orders.length}</div><div class="k">Orders</div></div>
      <div class="tile"><div class="v">${fmt(revenue)}</div><div class="k">Total collected</div></div>
      <div class="tile"><div class="v">${fmt(revenue - donations)}</div><div class="k">Product sales</div></div>
      <div class="tile"><div class="v">${fmt(donations)}</div><div class="k">Donations</div></div>
    </div>
    <h2>By payment method</h2>
    <div class="card"><table>
      ${Object.entries(byMethod).map(([m, v]) => `<tr><td style="text-transform:capitalize">${m}</td><td class="num">${fmt(v)}</td></tr>`).join('')}
    </table></div>
    <h2>By product</h2>
    <div class="card"><table>
      <tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th></tr>
      ${Object.values(byProduct).map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.qty}</td><td class="num">${fmt(r.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="hint">No orders yet.</td></tr>'}
      ${Object.entries(byDiscount).map(([label, v]) => `<tr><td>${esc(label)} discount</td><td></td><td class="num">−${fmt(v)}</td></tr>`).join('')}
    </table></div>
    <div class="row" style="margin:12px 0">
      <button class="btn primary" data-action="export-csv" ${orders.length ? '' : 'disabled'}>⬇ Export CSV</button>
    </div>
    <h2>Orders</h2>
    ${[...orders].reverse().map(o => `<div class="card">
      <div class="order-head"><strong>${esc(o.customer.name)}</strong><span>${fmt(o.total)}</span></div>
      <div class="hint">${new Date(o.createdAt).toLocaleString()} · <span class="pill">${o.payment.method}${o.payment.checkNumber ? ' #' + esc(o.payment.checkNumber) : ''}</span>${o.seller ? ' · ' + esc(o.seller) : ''}</div>
      <div>${esc(o.customer.address)}${o.customer.lat != null ? ` <a class="hint" target="_blank" rel="noopener" href="https://maps.google.com/?q=${o.customer.lat},${o.customer.lng}">map</a>` : ''}</div>
      <div class="hint">${[...o.items.map(i => `${i.qty} × ${esc(i.name)}`), ...(o.donation ? [`${fmt(o.donation)} donation`] : [])].join(', ')}</div>
      <button class="btn small danger" data-delete="${o.id}" style="margin-top:6px">Delete</button>
    </div>`).join('')}`;
}

function viewSettings() {
  return `<h1>Settings</h1>
    <label for="seller">Scout name</label>
    <input id="seller" type="text" value="${esc(settings.seller)}" placeholder="Recorded on every order">
    <label for="payable">Checks payable to</label>
    <input id="payable" type="text" value="${esc(settings.checkPayableTo)}" placeholder="Troop 123">
    <label for="venmoFile">Venmo QR code</label>
    <div class="hint">In the Venmo app, tap your QR code and save it as a screenshot, then pick that image here.</div>
    <input id="venmoFile" type="file" accept="image/*" style="margin-top:6px">
    <div class="qr" id="venmoPreview">${venmoQr() ? `<img src="${venmoQr()}" alt="Venmo QR code">` : '<span class="hint">No QR code yet.</span>'}</div>
    ${settings.venmoQr ? `<button class="btn small danger" data-action="clear-qr">${hasDefaultQr ? 'Use the troop QR code' : 'Remove QR code'}</button>` : ''}
    <div style="margin-top:16px"><button class="btn primary block" data-action="save-settings">Save</button></div>`;
}

function render() {
  const views = { shop: viewShop, customer: viewCustomer, payment: viewPayment, done: viewDone, report: viewReport, settings: viewSettings };
  $('#app').innerHTML = views[view]();
  document.querySelectorAll('[data-nav]').forEach(b => {
    const active = b.dataset.nav === view || (b.dataset.nav === 'shop' && ['customer', 'payment', 'done'].includes(view));
    b.classList.toggle('active', active);
  });
}

// ---------- Actions ----------

function setLocStatus(msg) { locStatus = msg; const el = $('#locStatus'); if (el) el.textContent = msg; }

function locate() {
  if (!navigator.geolocation) return setLocStatus('This device does not support location.');
  setLocStatus('Getting precise location…');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude, accuracy } = pos.coords;
    Object.assign(state.customer, { lat: latitude, lng: longitude, accuracy });
    setLocStatus(`Location found (±${Math.round(accuracy)} m). Looking up address…`);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`);
      const j = await r.json();
      const a = j.address || {};
      const street = [a.house_number, a.road].filter(Boolean).join(' ');
      const city = a.city || a.town || a.village || a.hamlet || a.suburb || '';
      const tail = [city, a.state].filter(Boolean).join(', ') + (a.postcode ? ' ' + a.postcode : '');
      state.customer.address = [street, tail].filter(Boolean).join(', ') || j.display_name || '';
      setLocStatus(`Address found (GPS accuracy ±${Math.round(accuracy)} m). Please confirm below.`);
    } catch {
      state.customer.address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      setLocStatus('Could not look up the street address — saved GPS coordinates. Please type the address.');
    }
    render();
  }, err => {
    setLocStatus(err.code === 1 ? 'Location permission denied — please type the address.' : 'Could not get location — please type the address.');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

// Shrink the QR screenshot so it fits comfortably in localStorage.
function readQrImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / Math.max(img.width, img.height));
      const canvas = Object.assign(document.createElement('canvas'), { width: img.width * scale, height: img.height * scale });
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function completeOrder() {
  const items = cartLines();
  orders.push({
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    createdAt: new Date().toISOString(),
    seller: settings.seller,
    customer: { ...state.customer },
    items,
    discounts: discounts(),
    donation: state.donation,
    total: cartTotal(),
    payment: { method: state.payment.method, checkNumber: state.payment.method === 'check' ? state.payment.checkNumber : '' },
  });
  save(ORDERS_KEY, orders);
  go('done');
}

function exportCsv() {
  const cols = ['order_id', 'created_at', 'seller', 'customer_name', 'phone', 'address', 'lat', 'lng', 'gps_accuracy_m',
    'payment_method', 'check_number', 'product_id', 'product', 'category', 'unit_price', 'qty', 'line_total', 'order_total'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = orders.flatMap(o => {
    const lines = [...o.items];
    for (const d of o.discounts || []) lines.push({ id: 'discount', name: d.label, category: 'Discount', price: -d.amount, qty: 1, lineTotal: -d.amount });
    if (o.donation) lines.push({ id: 'donation', name: 'Donation', category: 'Donation', price: o.donation, qty: 1, lineTotal: o.donation });
    return lines.map(i => [o.id, o.createdAt, o.seller, o.customer.name, o.customer.phone, o.customer.address,
      o.customer.lat, o.customer.lng, o.customer.accuracy && Math.round(o.customer.accuracy), o.payment.method, o.payment.checkNumber,
      i.id, i.name, i.category, i.price, i.qty, i.lineTotal, o.total].map(q).join(','));
  });
  const blob = new Blob([[cols.join(','), ...rows].join('\r\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `scout-orders-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Update the total and Next button in place, so typing doesn't lose focus.
function refreshBar() {
  const t = $('#total');
  if (t) t.textContent = fmt(cartTotal());
  if (view === 'shop') {
    const next = $('[data-action="to-customer"]');
    if (next) next.disabled = !(cartTotal() > 0);
    $('#donationCard')?.classList.toggle('selected', state.donation > 0);
    document.querySelectorAll('[data-donate]').forEach(b => b.classList.toggle('on', +b.dataset.donate === state.donation));
  }
  if (view === 'customer') {
    const next = $('[data-action="to-payment"]');
    if (next) next.disabled = !(state.customer.name.trim() && state.customer.address.trim());
  }
}

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if (d.nav) return go(d.nav);
  if (d.go) return go(d.go);
  if (d.inc) { state.cart[d.inc] = (state.cart[d.inc] || 0) + 1; return render(); }
  if (d.dec) { state.cart[d.dec] = Math.max(0, (state.cart[d.dec] || 0) - 1); return render(); }
  if (d.donate) { state.donation = money(d.donate); $('#donation').value = state.donation || ''; return refreshBar(); }
  if (d.pay) { state.payment.method = d.pay; return render(); }
  if (d.delete) {
    if (confirm('Delete this order? This cannot be undone.')) { orders = orders.filter(o => o.id !== d.delete); save(ORDERS_KEY, orders); render(); }
    return;
  }
  switch (d.action) {
    case 'to-customer': return go('customer');
    case 'to-payment': return go('payment');
    case 'locate': return locate();
    case 'complete': return completeOrder();
    case 'restart': state = newOrder(); locStatus = ''; return go('shop');
    case 'export-csv': return exportCsv();
    case 'clear-qr': settings.venmoQr = ''; save(SETTINGS_KEY, settings); return render();
    case 'save-settings':
      Object.assign(settings, { seller: $('#seller').value.trim(), checkPayableTo: $('#payable').value.trim() });
      save(SETTINGS_KEY, settings);
      return go('shop');
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind) state.customer[t.dataset.bind] = t.value;
  if (t.dataset.bindPay) state.payment[t.dataset.bindPay] = t.value;
  if ('bindDonation' in t.dataset) state.donation = money(t.value);
  refreshBar();
});

document.addEventListener('change', async e => {
  if (e.target.id !== 'venmoFile' || !e.target.files[0]) return;
  try {
    settings.venmoQr = await readQrImage(e.target.files[0]);
    save(SETTINGS_KEY, settings);
    $('#venmoPreview').innerHTML = `<img src="${settings.venmoQr}" alt="Venmo QR code">`;
  } catch {
    alert('That file could not be read as an image.');
  }
});

render();
