 # Terra & Co. — Frontend & Backend Integration (Project 4)

**DecodeLabs Full Stack Internship — Project 4: Frontend & Backend Integration**
*(Optional Mastery Phase)*
*Goal: integrate the frontend with backend APIs.*

This is the project that connects everything built so far. Project 1 was
a frontend with fake, hardcoded data. Project 3 was a backend with a real
database but no UI. **This project deletes the hardcoded data from
Project 1 and replaces it with real `fetch()` calls to the Project 3
backend** — so the browser and the server are actually talking to each
other now.

---

## 📁 Project Structure

```
project4-integration/
├── backend/            → the Project 3 API (copied in so this folder is self-contained)
│   ├── server.js
│   ├── validators.js
│   ├── db/
│   │   ├── connection.js
│   │   ├── schema.sql
│   │   └── seed.js
│   └── package.json
└── frontend/            → the Project 1 UI, rewired to call the backend
    ├── index.html
    ├── style.css
    └── script.js         ← almost everything new is in here
```

## ▶️ How to Run (two things running at once)

**1. Start the backend first:**
```bash
cd backend
npm install      # only needed once
node server.js
```
Leave this terminal open — you should see:
```
Terra & Co. API (Project 3) listening on http://localhost:3000
```

**2. Open the frontend:**
Open `frontend/index.html` directly in your browser (double-click it, or
right-click → Open with → your browser).

That's it — the page will immediately try to fetch products from
`http://localhost:3000`. If you open it *before* starting the backend,
you'll see a friendly error screen instead of a blank page (see step 5
below for why that matters).

> **Note on `npm install`:** if it fails with a `node-gyp` / `403` error
> while building `better-sqlite3`, run `npm install --build-from-source=false`
> instead — that forces it to use the prebuilt binary instead of trying
> to compile one locally.

---

## 🧠 What Actually Changed, Step by Step

This section walks through *how* the integration was built, in the order
it happened — useful for understanding the code, not just running it.

### Step 1 — Identify what needs to move from "fake" to "real"
Project 1's `script.js` had a `PRODUCTS` array sitting at the top of the
file with 12 hardcoded objects. That array is now **gone**. Nothing in
`frontend/script.js` invents product data anymore — it all comes from
`allProducts`, a variable that only gets filled in by a network response.

### Step 2 — Build one function that all network calls go through
Instead of scattering `fetch()` calls everywhere, there's a single
`apiRequest()` helper in `script.js`. Every other function
(`fetchProducts`, `checkHealth`, `placeOrder`) calls through it. This
does two things automatically for every request:
- Checks `response.ok` — a fetch to a 404 or 500 page doesn't throw on
  its own, so this step is what turns a bad status code into a JS error
  we can catch.
- Reads the backend's own error message (from Project 2/3's
  `validators.js`) so the person using the site sees something useful
  like *"category is required"* instead of just "Error 400".

### Step 3 — Replace the hardcoded render with an async load
`renderProducts()` from Project 1 became `loadProducts()`:
```js
async function loadProducts(category) {
  showLoadingState();
  try {
    const products = await fetchProducts(category);
    allProducts = products;
    renderProductGrid();
  } catch (err) {
    showErrorState(err.message);
  }
}
```
`showLoadingState()` runs immediately (so the person sees a spinner, not
a frozen page), then `await` pauses until the server responds, and the
`try/catch` decides whether to show real products or an error card.

### Step 4 — Switch category filtering from "filter an array" to "ask the server"
In Project 1, clicking "Kitchen" just filtered the existing array in
memory. Now it calls `loadProducts('kitchen')` again, which sends a
fresh request to `/api/products?category=kitchen`. That's a deliberate
choice to actually demonstrate a frontend → backend round trip on user
interaction, not just once on page load. Search, on the other hand,
still filters client-side — there's no reason to hit the network on
every keystroke.

### Step 5 — Handle the "server isn't running" case on purpose
This is the part most people skip. If the backend is down, `fetch()`
throws a `TypeError` (not an HTTP error — the request never even
reached a server). `loadProducts()` checks for that specific case and
shows a **connection banner** at the top of the page plus a "Try again"
button, instead of a blank white screen:
```js
if (err instanceof TypeError) {
  setConnectionStatus(false);
  showErrorState('The backend server is not reachable...');
}
```

### Step 6 — Do the two independent startup requests in parallel
On page load, checking `/api/health` and fetching `/api/products` don't
depend on each other, so `init()` fires them together:
```js
const results = await Promise.allSettled([checkHealth(), fetchProducts('all')]);
```
`Promise.allSettled` (rather than `Promise.all`) is used specifically so
that if the health check fails but products still somehow load (or vice
versa), one failure doesn't wipe out the other's result.

### Step 7 — Build the POST side: placing an order
Checkout in Project 1 just showed an alert. Now `checkoutBtn`'s click
handler builds a real payload and POSTs it:
```js
const order = await placeOrder({ customerName, customerEmail, items });
```
It disables the button and shows "Placing order…" while the request is
in flight, and uses `finally()` to re-enable it afterward *no matter
what happened* — success or failure.

### Step 8 — Render safely
Every product card is built with `document.createElement()` +
`.textContent`, not `innerHTML` with a template string. Even though this
data currently comes from our own trusted backend, this is the habit
that prevents Cross-Site Scripting (XSS) the moment that data source
ever includes anything user-submitted (e.g. product reviews later).

---

## ✅ How This Maps to the Project 4 Guidelines

| Requirement | Where it's implemented |
|---|---|
| Send requests from frontend to backend | `apiRequest()` in `script.js` — used for products, health check, and placing orders |
| Display dynamic data on UI | `renderProductGrid()` builds the whole product grid from whatever the last fetch returned — nothing is hardcoded |
| Handle basic errors and responses | `response.ok` checks, custom `Error` throwing, `try/catch/finally` on every async flow, a dedicated error card + connection banner |
| API integration | REST calls to `/api/products`, `/api/orders`, `/api/health` |
| Asynchronous requests | `async`/`await` throughout, `Promise.allSettled()` for the parallel startup requests |
| Full stack flow | Browser → `fetch()` → Node/Express-style router → SQLite → JSON response → DOM update |

## 🔧 Notes / Known Limitations

- **CORS** is already handled — the backend sends
  `Access-Control-Allow-Origin: *` on every response (see `server.js`),
  which is why the frontend can call `localhost:3000` from a file opened
  directly in the browser.
- **No loading skeleton for the cart** — the cart itself stays
  client-side until checkout; only the product catalog and the order
  submission touch the network.
- **`window.prompt()` for name/email at checkout** is a placeholder for
  a real checkout form — kept simple here since the point of this
  project is the fetch/async layer, not form design.

---
*Built for the DecodeLabs Internship Program — Batch 2026.*
