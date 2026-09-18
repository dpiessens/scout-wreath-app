// Order validation, Table Storage mapping and the HTTP handlers.
// Nothing here depends on Azure Functions, so the same code runs in tests and the local dev server.
import { createHash, timingSafeEqual } from 'node:crypto';

const METHODS = new Set(['cash', 'check', 'venmo']);
export const MAX_BATCH = 100;

const str = (v, max) => typeof v === 'string' && v.length <= max;
const num = v => typeof v === 'number' && Number.isFinite(v);
const cents = v => Math.round(v * 100);
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

/** Returns a list of the fields that are wrong; empty means the order is valid. */
export function validateOrder(o) {
  if (!o || typeof o !== 'object') return ['order'];
  const errs = [];
  const c = o.customer ?? {};
  if (!str(o.id, 64) || !/^[\w-]+$/.test(o.id)) errs.push('id');
  if (!str(o.createdAt, 40) || Number.isNaN(Date.parse(o.createdAt))) errs.push('createdAt');
  if (o.updatedAt != null && (!str(o.updatedAt, 40) || Number.isNaN(Date.parse(o.updatedAt)))) errs.push('updatedAt');
  if (!str(o.seller ?? '', 100)) errs.push('seller');
  if (!str(o.deviceId ?? '', 64)) errs.push('deviceId');
  if (!str(c.name, 200) || !c.name.trim()) errs.push('customer.name');
  if (!str(c.address, 500) || !c.address.trim()) errs.push('customer.address');
  if (c.phone != null && !str(c.phone, 40)) errs.push('customer.phone');
  for (const k of ['lat', 'lng', 'accuracy']) if (c[k] != null && !num(c[k])) errs.push(`customer.${k}`);

  const items = o.items;
  if (!Array.isArray(items) || items.length > 60) errs.push('items');
  else items.forEach((i, n) => {
    const ok = str(i?.id, 40) && str(i?.name, 200) && str(i?.category ?? '', 60) && num(i?.price) && i.price >= 0
      && Number.isInteger(i?.qty) && i.qty > 0 && num(i?.lineTotal) && cents(i.price * i.qty) === cents(i.lineTotal);
    if (!ok) errs.push(`items[${n}]`);
  });
  const discounts = o.discounts ?? [];
  if (!Array.isArray(discounts) || discounts.some(d => !str(d?.label, 100) || !num(d?.amount) || d.amount < 0)) errs.push('discounts');
  const donation = o.donation ?? 0;
  if (!num(donation) || donation < 0) errs.push('donation');
  if (!METHODS.has(o.payment?.method)) errs.push('payment.method');
  if (o.payment?.checkNumber != null && !str(o.payment.checkNumber, 40)) errs.push('payment.checkNumber');
  if (o.deleted != null && typeof o.deleted !== 'boolean') errs.push('deleted');

  if (!errs.length) {
    if (!items.length && !donation) errs.push('empty order');
    const expected = sum(items, i => i.lineTotal) - sum(discounts, d => d.amount) + donation;
    if (!num(o.total) || cents(o.total) !== cents(expected)) errs.push('total');
  }
  return errs;
}

/** The sale season an order belongs to: the year it was taken (UTC). */
export const seasonOf = createdAt => String(new Date(createdAt).getUTCFullYear());

const compact = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));

export function toEntity(o, syncedAt = new Date().toISOString()) {
  return compact({
    partitionKey: seasonOf(o.createdAt),
    rowKey: o.id,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt ?? o.createdAt,
    syncedAt,
    seller: o.seller,
    deviceId: o.deviceId,
    customerName: o.customer.name,
    phone: o.customer.phone,
    address: o.customer.address,
    lat: o.customer.lat,
    lng: o.customer.lng,
    gpsAccuracyM: o.customer.accuracy,
    paymentMethod: o.payment.method,
    checkNumber: o.payment.checkNumber,
    itemsJson: JSON.stringify(o.items),
    discountsJson: JSON.stringify(o.discounts ?? []),
    donation: o.donation ?? 0,
    total: o.total,
    deleted: o.deleted === true,
  });
}

export function fromEntity(e) {
  return {
    id: e.rowKey,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    syncedAt: e.syncedAt,
    seller: e.seller ?? '',
    deviceId: e.deviceId ?? '',
    customer: {
      name: e.customerName,
      phone: e.phone ?? '',
      address: e.address,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      accuracy: e.gpsAccuracyM ?? null,
    },
    items: JSON.parse(e.itemsJson || '[]'),
    discounts: JSON.parse(e.discountsJson || '[]'),
    donation: e.donation ?? 0,
    total: e.total,
    payment: { method: e.paymentMethod, checkNumber: e.checkNumber ?? '' },
    deleted: e.deleted === true,
  };
}

// Compare hashes so the comparison takes the same time whatever the input.
function accessCodeMatches(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const h = s => createHash('sha256').update(s.trim().toLowerCase()).digest();
  return timingSafeEqual(h(given), h(expected));
}

/** Roles from the principal Static Web Apps passes to the API for signed-in users. */
export function rolesOf(headers) {
  const raw = headers['x-ms-client-principal'];
  if (!raw) return [];
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).userRoles ?? [];
  } catch {
    return [];
  }
}

// Handlers take { headers (lower-case keys), query, body } and return { status, jsonBody }.

/** POST /api/orders — a Scout's device uploads new or changed orders. */
export async function saveOrders({ headers, body }, store, env) {
  if (!env.ACCESS_CODE) return { status: 500, jsonBody: { error: 'The server has no access code configured.' } };
  // 403 rather than 401: Static Web Apps turns a 401 into a sign-in redirect.
  if (!accessCodeMatches(headers['x-access-code'], env.ACCESS_CODE)) {
    return { status: 403, jsonBody: { error: 'The access code was not accepted.' } };
  }
  const orders = body?.orders;
  if (!Array.isArray(orders) || !orders.length || orders.length > MAX_BATCH) {
    return { status: 400, jsonBody: { error: `Send { orders: [...] } with 1 to ${MAX_BATCH} orders.` } };
  }
  const results = [];
  for (const o of orders) {
    const errors = validateOrder(o);
    if (errors.length) {
      results.push({ id: typeof o?.id === 'string' ? o.id : null, ok: false, error: `Invalid ${errors.join(', ')}` });
      continue;
    }
    await store.upsert(toEntity(o));
    results.push({ id: o.id, ok: true });
  }
  return { status: 200, jsonBody: { results } };
}

/** Scout names match loosely: case, extra spaces and surrounding spaces don't matter. */
export const sellerKey = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * GET /api/my-sales?seller=Sam%20P — one Scout's orders from every phone, for their "My sales" totals.
 * Anyone with the access code can ask for any name, so this returns only what the totals need:
 * no customer names, addresses or phone numbers.
 */
export async function mySales({ headers, query }, store, env) {
  if (!env.ACCESS_CODE) return { status: 500, jsonBody: { error: 'The server has no access code configured.' } };
  if (!accessCodeMatches(headers['x-access-code'], env.ACCESS_CODE)) {
    return { status: 403, jsonBody: { error: 'The access code was not accepted.' } };
  }
  const key = sellerKey(query.seller);
  if (!key || key.length > 100) return { status: 400, jsonBody: { error: 'Give the Scout name as ?seller=' } };
  const season = /^\d{4}$/.test(query.season ?? '') ? query.season : String(new Date().getUTCFullYear());
  const orders = (await store.list(season)).map(fromEntity)
    .filter(o => !o.deleted && sellerKey(o.seller) === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(o => ({
      id: o.id,
      createdAt: o.createdAt,
      deviceId: o.deviceId,
      items: o.items.map(({ id, name, category, price, qty, lineTotal }) => ({ id, name, category, price, qty, lineTotal })),
      discounts: o.discounts,
      donation: o.donation,
      total: o.total,
      payment: { method: o.payment.method },
    }));
  return { status: 200, jsonBody: { season, orders } };
}

/** GET /api/report/orders?season=2026 — every order for the season. Admins only. */
export async function listOrders({ headers, query }, store) {
  if (!rolesOf(headers).includes('admin')) return { status: 403, jsonBody: { error: 'Admins only.' } };
  const season = /^\d{4}$/.test(query.season ?? '') ? query.season : String(new Date().getUTCFullYear());
  const includeDeleted = query.includeDeleted === '1';
  const orders = (await store.list(season)).map(fromEntity)
    .filter(o => includeDeleted || !o.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { status: 200, jsonBody: { season, orders } };
}
