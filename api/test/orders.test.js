import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, toEntity, fromEntity, saveOrders, listOrders, mySales, MAX_BATCH } from '../src/lib/orders.js';
import { memoryStore } from '../src/lib/memory-store.js';

const env = { ACCESS_CODE: 'Pack118' };
const admin = { 'x-ms-client-principal': Buffer.from(JSON.stringify({ userRoles: ['anonymous', 'authenticated', 'admin'] })).toString('base64') };

function order(overrides = {}) {
  return {
    id: '5b1c2d9e-0000-4000-8000-000000000001',
    createdAt: '2026-10-01T18:30:00.000Z',
    updatedAt: '2026-10-01T18:30:00.000Z',
    seller: 'Sam',
    deviceId: 'device-1',
    customer: { name: 'Ann Lee', phone: '', address: '5 Oak St, Muskego, WI 53150', lat: 42.9, lng: -88.1, accuracy: 8 },
    items: [
      { id: 'w1', name: '20" Wreath', category: 'Wreaths', price: 28, qty: 1, lineTotal: 28 },
      { id: 'p2', name: 'Original Kettle Corn', category: 'Popcorn', price: 9, qty: 3, lineTotal: 27 },
    ],
    discounts: [{ label: 'Popcorn 3 for $25', amount: 2 }],
    donation: 5,
    total: 58,
    payment: { method: 'check', checkNumber: '1042' },
    ...overrides,
  };
}

test('a well-formed order is valid', () => {
  assert.deepEqual(validateOrder(order()), []);
});

test('a donation-only order is valid, an empty one is not', () => {
  assert.deepEqual(validateOrder(order({ items: [], discounts: [], donation: 20, total: 20 })), []);
  assert.deepEqual(validateOrder(order({ items: [], discounts: [], donation: 0, total: 0 })), ['empty order']);
});

test('totals must add up', () => {
  assert.deepEqual(validateOrder(order({ total: 60 })), ['total']);
  const items = [{ id: 'w1', name: 'x', price: 28, qty: 2, lineTotal: 28 }];
  assert.ok(validateOrder(order({ items })).includes('items[0]'));
});

test('cents are compared exactly, so $8.50 + $7.50 does not drift', () => {
  const items = [
    { id: 'w15', name: 'Easel', price: 8.5, qty: 3, lineTotal: 25.5 },
    { id: 'w16', name: 'Door Hanger', price: 7.5, qty: 1, lineTotal: 7.5 },
  ];
  assert.deepEqual(validateOrder(order({ items, discounts: [], donation: 0.1, total: 33.1 })), []);
});

test('bad fields are named', () => {
  const errs = validateOrder(order({ id: 'no spaces allowed', payment: { method: 'bitcoin' }, customer: { name: ' ', address: 'x' } }));
  assert.deepEqual(errs, ['id', 'customer.name', 'payment.method']);
});

test('an order survives the round trip through a table row', () => {
  const o = order();
  const back = fromEntity(toEntity(o, '2026-10-01T19:00:00.000Z'));
  assert.equal(back.syncedAt, '2026-10-01T19:00:00.000Z');
  delete back.syncedAt;
  assert.deepEqual(back, { ...o, deleted: false });
});

test('rows are partitioned by season and skip empty values', () => {
  const e = toEntity(order({ customer: { name: 'A', address: 'B', phone: '', lat: null, lng: null, accuracy: null } }));
  assert.equal(e.partitionKey, '2026');
  assert.equal(e.rowKey, order().id);
  for (const k of ['phone', 'lat', 'lng', 'gpsAccuracyM']) assert.ok(!(k in e), k);
});

test('uploads need the access code', async () => {
  const store = memoryStore();
  const body = { orders: [order()] };
  assert.equal((await saveOrders({ headers: {}, body }, store, env)).status, 403);
  assert.equal((await saveOrders({ headers: { 'x-access-code': 'wrong' }, body }, store, env)).status, 403);
  assert.equal((await saveOrders({ headers: { 'x-access-code': 'x' }, body }, store, {})).status, 500);
  // Case and surrounding spaces don't matter; Scouts type this on a phone.
  const ok = await saveOrders({ headers: { 'x-access-code': ' pack118 ' }, body }, store, env);
  assert.equal(ok.status, 200);
  assert.equal(store.rows.size, 1);
});

test('each order in a batch gets its own result, and a bad one does not block the rest', async () => {
  const store = memoryStore();
  const good = order();
  const bad = order({ id: 'bad-1', total: 1 });
  const res = await saveOrders({ headers: { 'x-access-code': 'Pack118' }, body: { orders: [bad, good] } }, store, env);
  assert.equal(res.status, 200);
  assert.deepEqual(res.jsonBody.results, [
    { id: 'bad-1', ok: false, error: 'Invalid total' },
    { id: good.id, ok: true },
  ]);
  assert.equal(store.rows.size, 1);
});

test('batches must be a non-empty list within the limit', async () => {
  const h = { 'x-access-code': 'Pack118' };
  for (const body of [null, {}, { orders: [] }, { orders: Array(MAX_BATCH + 1).fill(order()) }]) {
    assert.equal((await saveOrders({ headers: h, body }, memoryStore(), env)).status, 400);
  }
});

test('re-uploading an order replaces it rather than duplicating it', async () => {
  const store = memoryStore();
  const h = { 'x-access-code': 'Pack118' };
  await saveOrders({ headers: h, body: { orders: [order()] } }, store, env);
  await saveOrders({ headers: h, body: { orders: [order({ deleted: true, updatedAt: '2026-10-02T00:00:00.000Z' })] } }, store, env);
  assert.equal(store.rows.size, 1);
  assert.equal([...store.rows.values()][0].deleted, true);
});

test('the report is admin-only and hides deleted orders', async () => {
  const store = memoryStore();
  const h = { 'x-access-code': 'Pack118' };
  const kept = order({ id: 'b', createdAt: '2026-10-03T00:00:00.000Z' });
  const earlier = order({ id: 'a', createdAt: '2026-10-02T00:00:00.000Z' });
  const deleted = order({ id: 'c', deleted: true });
  const lastYear = order({ id: 'd', createdAt: '2025-10-01T00:00:00.000Z' });
  await saveOrders({ headers: h, body: { orders: [kept, earlier, deleted, lastYear] } }, store, env);

  assert.equal((await listOrders({ headers: {}, query: {} }, store)).status, 403);

  const res = await listOrders({ headers: admin, query: { season: '2026' } }, store);
  assert.equal(res.status, 200);
  assert.deepEqual(res.jsonBody.orders.map(o => o.id), ['a', 'b']);

  const all = await listOrders({ headers: admin, query: { season: '2026', includeDeleted: '1' } }, store);
  assert.equal(all.jsonBody.orders.length, 3);

  const old = await listOrders({ headers: admin, query: { season: '2025' } }, store);
  assert.deepEqual(old.jsonBody.orders.map(o => o.id), ['d']);
});

test('my sales adds up one Scout across phones, matching the name loosely', async () => {
  const store = memoryStore();
  const h = { 'x-access-code': 'Pack118' };
  await saveOrders({ headers: h, body: { orders: [
    order({ id: 'a', seller: 'Sam P', deviceId: 'mom' }),
    order({ id: 'b', seller: '  sam   p ', deviceId: 'dad' }),
    order({ id: 'c', seller: 'Sam P', deleted: true }),
    order({ id: 'd', seller: 'Alex R' }),
    order({ id: 'e', seller: 'Sam P', createdAt: '2025-10-01T00:00:00.000Z' }),
  ] } }, store, env);

  const res = await mySales({ headers: h, query: { seller: 'SAM P', season: '2026' } }, store, env);
  assert.equal(res.status, 200);
  assert.deepEqual(res.jsonBody.orders.map(o => o.id), ['a', 'b']);
  assert.deepEqual(res.jsonBody.orders.map(o => o.deviceId), ['mom', 'dad']);
});

test('my sales leaves out customer details', async () => {
  const store = memoryStore();
  const h = { 'x-access-code': 'Pack118' };
  await saveOrders({ headers: h, body: { orders: [order()] } }, store, env);
  const [o] = (await mySales({ headers: h, query: { seller: 'Sam', season: '2026' } }, store, env)).jsonBody.orders;
  assert.equal(o.customer, undefined);
  assert.deepEqual(o.payment, { method: 'check' });
  assert.equal(o.total, 58);
  assert.equal(JSON.stringify(o).includes('Oak St'), false);
  assert.equal(JSON.stringify(o).includes('Ann Lee'), false);
});

test('my sales needs the access code and a name', async () => {
  const store = memoryStore();
  assert.equal((await mySales({ headers: {}, query: { seller: 'Sam' } }, store, env)).status, 403);
  assert.equal((await mySales({ headers: { 'x-access-code': 'Pack118' }, query: {} }, store, env)).status, 400);
  assert.equal((await mySales({ headers: { 'x-access-code': 'Pack118' }, query: { seller: '   ' } }, store, env)).status, 400);
});
