# Scout Orders — Development Plan

An app a Scout uses at the door to take wreath and popcorn orders. The Scout picks the
products and any donation, the phone's location fills in the address, and the Scout enters
the customer's name and records whether they paid by cash, check or Venmo. Every order is
saved centrally so sales can be reported later.

## Decisions so far

| Topic | Decision |
|---|---|
| Who uses it | The Scout runs the app on their own device. The customer never touches it |
| Users | One Scout per device. No logins or multi-user support for now |
| Delivery | Handled by a separate process. The app only captures the address |
| Payment | Cash, check (check number recorded) or Venmo. No pay-later option |
| Venmo | The troop's Venmo QR code is shown on screen, and the app records that the customer paid by Venmo |
| Receipts | None |
| Donations | Optional amount per order ($5/$10/$20/$50 or a custom amount). A donation-only order is allowed |
| Products | Name, description, price and a thumbnail shown to the left of the text |
| Hosting | The existing Azure subscription (the one hosting FlowerApp) |

## Recommended approach

**A mobile web app that can be added to the home screen and keeps working offline**, hosted
on **Azure Static Web Apps**.
- No app store. It works on iPhone and Android and is added to the home screen like an app.
- Location, camera and offline use all work in the browser. HTTPS, which location needs, comes
  with the host.

### Azure architecture

```
Scout's phone                         Azure (new resource group: wreath-orders)
┌──────────────────────┐   HTTPS      ┌───────────────────────────────────────┐
│ Web app              │ ───────────▶ │ Static Web App (Free tier)            │
│ - orders saved on the│              │  ├─ site: HTML/JS, products, images   │
│   phone first        │  POST /api/  │  └─ API: Azure Functions (managed)    │
│ - syncs when online  │  orders      │        │                              │
└──────────────────────┘              │        ▼                              │
                                      │ Storage account → Table: Orders       │
Leader's laptop ──── /report ───────▶ │ (report page behind SWA login)        │
                                      └───────────────────────────────────────┘
```

| Piece | Choice | Why |
|---|---|---|
| Hosting and API | **Azure Static Web Apps, Free tier**, with built-in Functions | $0. Hosting, HTTPS, the API and login are one resource |
| Storage | **Azure Table Storage** (one storage account) | Pennies a month. There is one table of orders and no relational querying |
| Reporting | A report page in the app, behind SWA's built-in login (GitHub or Microsoft account, admin role by invite), plus CSV export | Only you see all customers' addresses |
| Device auth | A troop access code entered once in Settings and sent with each upload; the Function checks it | Keeps strangers from posting orders without needing user accounts |
| Infra and CI | Bicep and a GitHub Actions workflow using OIDC, following the FlowerApp pattern | Reuses what you already have working |

**Why not reuse FlowerApp's Container Apps and Postgres?** It would work, and the Postgres
server is already paid for. But it would tie a seasonal fundraiser to a separate project's
database and deploy cycle, and stopping FlowerApp's Postgres server to save money would take
this app down too. A separate Static Web App plus Table Storage costs almost nothing and
can't break the other app. If you'd rather have one stack, the fallback is a `wreath`
database on the existing Postgres server with a second small Container App.

### Offline sync
1. Completing an order saves it on the phone first (IndexedDB) and marks it "pending".
2. The app uploads pending orders whenever it's online: right away, when signal returns, and
   when the app is opened.
3. The server stores each order under the order ID the phone generated, so a retried upload
   overwrites the same order and never creates a duplicate.
4. The header shows a badge such as "2 waiting to upload" so the Scout knows before going home.

## Data model

```
Product  { id, category, name, description, price, image, active, sortOrder }   -- products.json, shipped with the site

Order (Table Storage)
  PartitionKey  season, e.g. "2026"
  RowKey        order id (UUID generated on the phone)
  createdAt, syncedAt, seller (Scout name), deviceId
  customerName, phone?, address, lat, lng, gpsAccuracyM
  paymentMethod (cash|check|venmo), checkNumber?
  itemsJson     [{ productId, name, unitPrice, qty, lineTotal }]
  donation, itemsTotal, total
  deleted       (soft delete — orders are never destroyed from a phone)
```
Each order keeps the product name and price as they were when it was placed, so later catalog
changes don't rewrite past orders.

## Phases

**Phase 0: Concept prototype** ✅ (`prototype/`, stores data on the device only)
- Product list with thumbnails, donation, location-to-address, customer name, and cash, check
  or Venmo using the QR image.
- Report page and CSV export.

**Phase 1: Real catalog and installable app** (~1–2 days)
- Load the real products and thumbnails (`products.json` plus `img/` in the repo).
- Ship the troop's Venmo QR image with the site so every device shows the same one. The
  upload option in Settings stays as a fallback.
- Web app manifest, icons and an offline service worker so it installs to the home screen and
  opens with no signal.
- IndexedDB storage in place of localStorage.

**Phase 2: Azure backend and sync** (~2–3 days)
- Bicep: resource group, Static Web App (Free) and a storage account with an `Orders` table.
- Functions: `POST /api/orders` (upsert, checks the access code) and `GET /api/orders`
  (admin only).
- Offline upload queue and the pending-upload badge.
- GitHub Actions deploy with OIDC, reusing the FlowerApp setup notes.

**Phase 3: Reporting** (~1–2 days)
- Admin report page: totals by product, donations, payment method, Scout and date range.
- Order list with map links, and CSV export in the same format the prototype produces.
- Payment reconciliation: cash total to deposit, a list of check numbers, and the Venmo total
  to match against the Venmo app.

**Phase 4: Hardening** (~1 day)
- Customer names and addresses are personal data. Keep them behind the admin login and purge
  them after the season.
- Test on iPhone Safari and Android Chrome, including the location permission prompts and
  weak signal.

## Known constraints and risks
- **Location accuracy**: GPS is usually within 5–20 m and can land on the neighbor's house
  number. The Scout confirms the address with the customer, and the raw coordinates are kept.
- **Nominatim** (the free OpenStreetMap address lookup) allows about 1 request per second,
  which is fine for door-to-door. Azure Maps is the drop-in replacement if needed.
- **Venmo**: there's no API to confirm a payment arrived. The Scout checks the Venmo app
  before tapping "Complete order".
- **iOS location permission** for a home-screen app is asked the first time and can be
  revoked in Settings. The app falls back to typing the address.
