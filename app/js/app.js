// Scout Orders: the Scout's order-taking app.
// Orders are saved on the device (IndexedDB) first, then uploaded to /api/orders when online.
import { PRODUCTS, CATEGORY_ICONS, CATEGORY_NOTES, PRICING_RULES, SALES_GOAL } from './products.js';
import { getAllOrders, putOrder, persist } from './db.js';
import { fmt, esc, renderReport, downloadCsv } from './report.js';

const SETTINGS_KEY = 'scoutOrders.settings.v1';
const DEVICE_KEY = 'scoutOrders.deviceId';
const DONATION_PRESETS = [5, 10, 20, 50];
const VENMO_QR = 'img/venmo-qr.png';
const UPLOAD_BATCH = 100;
const RETRY_MS = 60_000;

const $ = sel => document.querySelector(sel);
const round2 = v => Math.round(v * 100) / 100;
const money = v => Math.max(0, round2(parseFloat(v) || 0));
const uuid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function loadSettings() {
  try { return { seller: '', checkPayableTo: '', accessCode: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; }
  catch { return { seller: '', checkPayableTo: '', accessCode: '' }; }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = uuid(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

let settings = loadSettings();
let orders = [];            // every order on this device, including deleted ones (they still need uploading)
let state = newOrder();
let view = 'shop';
let locStatus = '';
let lastCompleted = null;
let saving = false;
const sync = { running: false, message: '' };

// This Scout's orders from every phone, from /api/my-sales. Kept in localStorage so "My sales"
// still shows the full total with no signal. Totals only: no customer details.
const MY_SALES_KEY = 'scoutOrders.mySales.v1';
const MY_SALES_RETRY_MS = 30_000;
let mySales = (() => { try { return JSON.parse(localStorage.getItem(MY_SALES_KEY)); } catch { return null; } })();
let mySalesTriedAt = 0;
let mySalesLoading = false;

function newOrder() {
  return {
    cart: {},
    donation: 0,
    customer: { name: '', phone: '', address: '', lat: null, lng: null, accuracy: null },
    payment: { method: null, checkNumber: '' },
  };
}

const liveOrders = () => orders.filter(o => !o.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const unsynced = () => orders.filter(o => o.sync !== 'synced');

// ---------- Pricing ----------

function cartLines() {
  return PRODUCTS.filter(p => state.cart[p.id] > 0).map(p => ({
    id: p.id, name: p.name, category: p.category, price: p.price, qty: state.cart[p.id], lineTotal: round2(p.price * state.cart[p.id]),
  }));
}

// Bundle discounts (e.g. popcorn 3 for $25). The priciest units go into bundles first,
// so mixed prices always get the customer the better deal.
function discounts() {
  const lines = cartLines();
  return PRICING_RULES.map(r => {
    const prices = lines.filter(l => l.category === r.category)
      .flatMap(l => Array(l.qty).fill(l.price)).sort((a, b) => b - a);
    const bundles = Math.floor(prices.length / r.bundleSize);
    const amount = prices.slice(0, bundles * r.bundleSize).reduce((s, p) => s + p, 0) - bundles * r.bundlePrice;
    return { label: r.label, amount: round2(amount) };
  }).filter(d => d.amount > 0);
}

// "Add 1 more for 3 for $25" under a category that has a bundle rule.
function dealHint(category) {
  const r = PRICING_RULES.find(r => r.category === category);
  if (!r) return '';
  const n = cartLines().filter(l => l.category === category).reduce((s, l) => s + l.qty, 0);
  const short = (r.bundleSize - (n % r.bundleSize)) % r.bundleSize;
  return n && short ? `Add ${short} more for ${r.bundleSize} for ${fmt(r.bundlePrice).replace('.00', '')}.` : '';
}

const cartTotal = () => round2(cartLines().reduce((s, l) => s + l.lineTotal, 0)
  - discounts().reduce((s, d) => s + d.amount, 0) + state.donation);

// ---------- Views ----------

function go(v) {
  view = v;
  render();
  window.scrollTo(0, 0);
  if (v === 'report') refreshMySales();
}

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
    ? `<img class="thumb" src="${esc(p.image)}" alt="" data-icon="${icon}">`
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
  return `${settings.seller ? '' : `<div class="card notice">Welcome! Open <button class="linklike" data-nav="settings">⚙️ Settings</button> to enter your name and the access code.</div>`}
    ${steps(1)}<h1>Choose items</h1>
    ${cats.map(cat => `<h2>${esc(cat)}</h2>
      ${CATEGORY_NOTES[cat] ? `<div class="cat-note">${esc(CATEGORY_NOTES[cat])} <strong>${dealHint(cat)}</strong></div>` : ''}
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
      <div class="desc">Add a donation to support the Scouts.</div>
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
    detail = `<div class="card center">
      <div class="big">Pay <strong>${fmt(total)}</strong> on Venmo</div>
      <div class="qr"><img src="${VENMO_QR}" alt="Venmo QR code"></div>
      <div class="hint">Scan with the Venmo app. Wait for the payment to arrive before completing the order.</div>
    </div>`;
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
  const o = lastCompleted;
  return `<div class="center" style="padding-top:24px">
    <div style="font-size:3rem">🎉</div>
    <h1>Thank you, ${esc(o.customer.name.split(' ')[0])}!</h1>
    <p>Order of <strong>${fmt(o.total)}</strong> paid by ${o.payment.method} has been recorded.</p>
    <button class="btn primary block" data-action="restart">Start next order</button>
  </div>`;
}

// Matches the API: case and extra spaces in the Scout name don't matter.
const sellerKey = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const thisSeason = () => String(new Date().getUTCFullYear());

// The server's copy, if it's for this Scout and this season.
function currentMySales() {
  return mySales && sellerKey(mySales.seller) === sellerKey(settings.seller) && mySales.season === thisSeason() ? mySales : null;
}

// This Scout's season: every phone's uploaded orders, with this phone's own copy winning, so an
// order isn't counted twice while it uploads and a deletion here counts straight away.
function allMyOrders() {
  const remote = currentMySales();
  const here = new Set(orders.map(o => o.id));
  const byId = new Map((remote?.orders ?? []).map(o => [o.id, o]));
  for (const o of orders) byId.set(o.id, o);
  const all = [...byId.values()].filter(o => !o.deleted && o.createdAt.slice(0, 4) === thisSeason());
  return { all, fromOtherPhones: all.filter(o => !here.has(o.id)).length, remote };
}

async function refreshMySales({ force = false } = {}) {
  if (!settings.seller || !settings.accessCode || !navigator.onLine || mySalesLoading) return;
  if (!force && Date.now() - mySalesTriedAt < MY_SALES_RETRY_MS) return;
  mySalesLoading = true;
  mySalesTriedAt = Date.now();
  try {
    const res = await fetch(`/api/my-sales?seller=${encodeURIComponent(settings.seller)}`, {
      headers: { 'x-access-code': settings.accessCode }, cache: 'no-store',
    });
    if (!res.ok) return;
    const { season, orders: list } = await res.json();
    mySales = { seller: settings.seller, season, fetchedAt: Date.now(), orders: list };
    try { localStorage.setItem(MY_SALES_KEY, JSON.stringify(mySales)); } catch { /* the in-memory copy still works */ }
  } catch {
    // Offline: keep showing the last copy.
  } finally {
    mySalesLoading = false;
    if (view === 'report') render();
  }
}

function mySalesNote({ fromOtherPhones, remote }) {
  if (!settings.seller) return 'Add your name in ⚙️ Settings to include sales from your other phones.';
  if (!remote) return mySalesLoading ? 'Adding up sales from your other phones…' : 'Showing this phone only. Sales from your other phones are added when you are online.';
  const when = new Date(remote.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const others = fromOtherPhones ? `Includes ${fromOtherPhones} ${fromOtherPhones === 1 ? 'order' : 'orders'} from other phones under "${esc(settings.seller)}". ` : '';
  return `${others}Updated ${when}.`;
}

function viewReport() {
  const pending = unsynced().length;
  const mine = allMyOrders();
  return `<h1>My sales</h1>
    <div class="card ${pending ? 'notice' : ''}">
      ${pending
        ? `<strong>${pending} ${pending === 1 ? 'order' : 'orders'} not uploaded yet.</strong> They are safe on this phone.`
        : 'All orders are uploaded.'}
      ${sync.message ? `<div class="hint warn">${esc(sync.message)}</div>` : ''}
      ${pending ? `<div style="margin-top:8px"><button class="btn small primary" data-action="sync" ${sync.running ? 'disabled' : ''}>${sync.running ? 'Uploading…' : 'Upload now'}</button></div>` : ''}
    </div>
    ${renderReport(liveOrders(), {
      deletable: true,
      summaryOrders: mine.all,
      goal: SALES_GOAL,
      note: mySalesNote(mine),
      listTitle: 'Orders on this phone',
    })}`;
}

function viewSettings() {
  return `<h1>Settings</h1>
    <label for="seller">Scout name</label>
    <input id="seller" type="text" value="${esc(settings.seller)}" placeholder="Recorded on every order">
    <label for="payable">Checks payable to</label>
    <input id="payable" type="text" value="${esc(settings.checkPayableTo)}" placeholder="Your name">
    <label for="accessCode">Access code</label>
    <input id="accessCode" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(settings.accessCode)}">
    <div class="hint">From your Pack leader. Orders upload once this is set.</div>
    <div style="margin-top:16px"><button class="btn primary block" data-action="save-settings">Save</button></div>`;
}

function render() {
  const views = { shop: viewShop, customer: viewCustomer, payment: viewPayment, done: viewDone, report: viewReport, settings: viewSettings };
  $('#app').innerHTML = views[view]();
  document.querySelectorAll('header [data-nav]').forEach(b => {
    const active = b.dataset.nav === view || (b.dataset.nav === 'shop' && ['customer', 'payment', 'done'].includes(view));
    b.classList.toggle('active', active);
  });
  renderSyncBar();
}

// The strip under the header: only shown while something is waiting to upload.
function renderSyncBar() {
  const bar = $('#syncbar');
  const pending = unsynced().length;
  bar.hidden = !pending;
  if (!pending) return;
  const why = !settings.accessCode ? 'add the access code in Settings'
    : sync.running ? 'uploading…'
    : navigator.onLine ? 'will retry shortly' : 'will upload when back online';
  bar.innerHTML = `<button data-nav="report">⬆ ${pending} ${pending === 1 ? 'order' : 'orders'} waiting to upload — ${why}</button>`;
  bar.classList.toggle('bad', !settings.accessCode || unsynced().some(o => o.sync === 'error'));
}

// ---------- Upload ----------

// What the server stores: the order without this device's bookkeeping. One Scout per device,
// so an order taken before the name was entered gets it from Settings.
const forServer = ({ sync: _s, syncError: _e, ...o }) => ({ ...o, seller: o.seller || settings.seller });

async function uploadPending() {
  if (sync.running) return;
  const pending = unsynced();
  if (!pending.length) { sync.message = ''; return renderSyncBar(); }
  if (!settings.accessCode) { sync.message = 'Add the access code in ⚙️ Settings to upload orders.'; return refreshSyncViews(); }
  if (!navigator.onLine) { sync.message = 'No connection. Orders will upload when you are back online.'; return refreshSyncViews(); }

  sync.running = true;
  refreshSyncViews();
  try {
    for (let i = 0; i < pending.length; i += UPLOAD_BATCH) {
      const batch = pending.slice(i, i + UPLOAD_BATCH);
      const sent = new Map(batch.map(o => [o.id, o.updatedAt]));
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-access-code': settings.accessCode },
        body: JSON.stringify({ orders: batch.map(forServer) }),
      });
      if (res.status === 403) { sync.message = 'The access code was not accepted. Check it in ⚙️ Settings.'; return; }
      if (!res.ok) { sync.message = `Upload failed (error ${res.status}). Will try again.`; return; }
      const { results } = await res.json();
      for (const r of results) {
        const o = orders.find(x => x.id === r.id);
        // If the order changed while uploading (e.g. deleted), leave it pending for the next pass.
        if (!o || o.updatedAt !== sent.get(r.id)) continue;
        o.sync = r.ok ? 'synced' : 'error';
        o.syncError = r.error || '';
        await putOrder(o);
      }
      const failed = results.filter(r => !r.ok).length;
      sync.message = failed ? `${failed} ${failed === 1 ? 'order was' : 'orders were'} rejected by the server. Tell your Pack leader.` : '';
    }
  } catch {
    sync.message = 'No connection. Will try again.';
  } finally {
    sync.running = false;
    refreshSyncViews();
  }
  // The server's totals now include what just uploaded.
  if (view === 'report' && !sync.message) refreshMySales({ force: true });
}

function refreshSyncViews() {
  if (view === 'report') render(); else renderSyncBar();
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
    if (view === 'customer') render();
  }, err => {
    setLocStatus(err.code === 1 ? 'Location permission denied — please type the address.' : 'Could not get location — please type the address.');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

async function completeOrder() {
  if (saving) return; // a double tap must not record the order twice
  saving = true;
  const now = new Date().toISOString();
  const order = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    seller: settings.seller,
    deviceId: deviceId(),
    customer: { ...state.customer, name: state.customer.name.trim(), address: state.customer.address.trim(), phone: state.customer.phone.trim() },
    items: cartLines(),
    discounts: discounts(),
    donation: state.donation,
    total: cartTotal(),
    payment: { method: state.payment.method, checkNumber: state.payment.method === 'check' ? state.payment.checkNumber.trim() : '' },
    deleted: false,
    sync: 'pending',
  };
  try {
    await putOrder(order);
  } catch {
    saving = false;
    alert('This phone could not save the order. Nothing was recorded — please try again.');
    return;
  }
  orders.push(order);
  lastCompleted = order;
  saving = false;
  go('done');
  uploadPending();
}

async function deleteOrder(id) {
  const o = orders.find(x => x.id === id);
  if (!o || !confirm(`Delete the order for ${o.customer.name}?`)) return;
  // Kept as a deleted record so the deletion reaches the server too.
  Object.assign(o, { deleted: true, updatedAt: new Date().toISOString(), sync: 'pending', syncError: '' });
  await putOrder(o);
  render();
  uploadPending();
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
  if (d.delete) return deleteOrder(d.delete);
  switch (d.action) {
    case 'to-customer': return go('customer');
    case 'to-payment': return go('payment');
    case 'locate': return locate();
    case 'complete': return completeOrder();
    case 'restart': state = newOrder(); locStatus = ''; return go('shop');
    case 'export-csv': return downloadCsv(liveOrders(), `orders-${(settings.seller || 'scout').replace(/\W+/g, '-').toLowerCase()}`);
    case 'sync': return uploadPending();
    case 'save-settings':
      settings = {
        seller: $('#seller').value.trim(),
        checkPayableTo: $('#payable').value.trim(),
        accessCode: $('#accessCode').value.trim(),
      };
      saveSettings();
      sync.message = '';
      go('shop');
      refreshMySales({ force: true });
      return uploadPending();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind) state.customer[t.dataset.bind] = t.value;
  if (t.dataset.bindPay) state.payment[t.dataset.bindPay] = t.value;
  if ('bindDonation' in t.dataset) state.donation = money(t.value);
  refreshBar();
});

// Try uploading whenever there's a chance it will work.
window.addEventListener('online', uploadPending);
window.addEventListener('offline', renderSyncBar);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') uploadPending(); });
setInterval(() => { if (unsynced().length) uploadPending(); }, RETRY_MS);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

async function start() {
  persist();
  try {
    orders = await getAllOrders();
  } catch {
    orders = [];
    alert('This browser is not letting the app save orders. Try turning off private browsing.');
  }
  render();
  uploadPending();
}

start();
