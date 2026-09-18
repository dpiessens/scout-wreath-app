// Azure Functions entry points. The logic lives in ../lib/orders.js.
import { app } from '@azure/functions';
import { saveOrders, listOrders, mySales } from '../lib/orders.js';
import { tableStore } from '../lib/table-store.js';

let store;
const getStore = () => (store ??= tableStore(process.env.TABLES_CONNECTION_STRING, process.env.ORDERS_TABLE || 'orders'));

const wrap = handler => async (request, context) => {
  let body = null;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'The body must be JSON.' } };
    }
  }
  try {
    return await handler(
      { headers: Object.fromEntries(request.headers), query: Object.fromEntries(request.query), body },
      getStore(),
      process.env,
    );
  } catch (err) {
    context.error(err);
    return { status: 500, jsonBody: { error: 'Something went wrong saving or reading orders.' } };
  }
};

app.http('saveOrders', { route: 'orders', methods: ['POST'], authLevel: 'anonymous', handler: wrap(saveOrders) });
app.http('mySales', { route: 'my-sales', methods: ['GET'], authLevel: 'anonymous', handler: wrap(mySales) });
// Function routes may not start with "admin" (the Functions host reserves it), hence "report".
app.http('listOrders', { route: 'report/orders', methods: ['GET'], authLevel: 'anonymous', handler: wrap(listOrders) });
app.http('health', { route: 'health', methods: ['GET'], authLevel: 'anonymous', handler: async () => ({ jsonBody: { ok: true } }) });
