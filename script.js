/* ==========================================================================
   Terra & Co. — Frontend/Backend Integration (Project 4)
   This used to hold a hardcoded PRODUCTS array (Project 1). Now every
   product comes from the real API built in Project 2/3
   (http://localhost:3000/api/...). This file is the "nervous system"
   connecting the two - fetch(), async/await, JSON parsing, error
   handling, all of it.

   Make sure the backend is running first:
     cd backend && npm install && node server.js
   ========================================================================== */

const API_BASE_URL = 'http://localhost:3000/api';

/* ---------- state ---------- */
let allProducts = [];       // whatever the backend last gave us
let activeCategory = 'all';
let searchTerm = '';
const cart = {};            // { productId: quantity }
let isBackendReachable = true;

/* ---------- DOM refs ---------- */
const shopContent      = document.getElementById('shop-content');
const resultsCount     = document.getElementById('results-count');
const categoryPills    = document.querySelectorAll('.pill');
const searchInput      = document.getElementById('search-input');
const searchToggle     = document.getElementById('search-toggle');
const searchBar        = document.getElementById('search-bar');
const menuToggle       = document.getElementById('menu-toggle');
const mainNav          = document.getElementById('main-nav');
const cartToggle       = document.getElementById('cart-toggle');
const cartClose        = document.getElementById('cart-close');
const cartDrawer       = document.getElementById('cart-drawer');
const drawerOverlay    = document.getElementById('drawer-overlay');
const cartItemsEl      = document.getElementById('cart-items');
const cartEmptyEl      = document.getElementById('cart-empty');
const cartTotalEl      = document.getElementById('cart-total');
const cartCountEl      = document.getElementById('cart-count');
const checkoutBtn      = document.getElementById('checkout-btn');
const connectionBanner = document.getElementById('connection-banner');
const connectionText   = document.getElementById('connection-banner-text');
const toastEl          = document.getElementById('toast');

/* =========================================================================
   1. THE FETCH LAYER
   Every network call lives here. Nothing else in this file talks to
   fetch() directly - that keeps the "how do I reach the server" logic
   in one place.
   ========================================================================= */

// small helper: fetch() only rejects on a real network failure (server
// down, no internet, CORS blocked). A 404 or 500 still counts as a
// "successful" fetch as far as the browser is concerned - that's why we
// have to check response.ok ourselves and throw our own error for it.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    // try to read the backend's error message if it sent one (it does -
    // see validators.js on the server), otherwise fall back to the
    // plain status code
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody.error) message = errorBody.error;
    } catch (_) {
      // response wasn't JSON - just use the generic message above
    }
    throw new Error(message);
  }

  // 204 No Content has no body to parse
  if (response.status === 204) return null;
  return response.json();
}

async function fetchProducts(category) {
  const query = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
  const data = await apiRequest(`/products${query}`);
  return data.products;
}

async function checkHealth() {
  await apiRequest('/health');
}

async function placeOrder(orderPayload) {
  return apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload),
  });
}

/* =========================================================================
   2. RENDERING
   Building product cards with createElement + textContent instead of
   innerHTML - even though this data comes from our own backend, this is
   the safe habit for anything that touches user-influenced data, so
   we're doing it here on purpose.
   ========================================================================= */

function showLoadingState() {
  shopContent.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'loading-state';
  wrap.innerHTML = `<div class="spinner" aria-hidden="true"></div>`;
  const text = document.createElement('p');
  text.textContent = 'Fetching products from the server…';
  wrap.appendChild(text);
  shopContent.appendChild(wrap);
  resultsCount.textContent = 'Loading the collection…';
}

function showErrorState(message) {
  shopContent.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'error-state';

  const strong = document.createElement('strong');
  strong.textContent = 'Could not load products.';

  const detail = document.createElement('p');
  detail.textContent = message; // textContent, not innerHTML - never trust error text blindly

  const retryBtn = document.createElement('button');
  retryBtn.className = 'retry-btn';
  retryBtn.textContent = 'Try again';
  retryBtn.addEventListener('click', () => loadProducts(activeCategory));

  wrap.append(strong, detail, retryBtn);
  shopContent.appendChild(wrap);
  resultsCount.textContent = 'Could not load products';
}

function buildProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';

  const media = document.createElement('div');
  media.className = 'product-media';
  media.style.background = mediaColor(product.category);
  media.textContent = iconFor(product.category); // emoji as plain text, not markup

  const body = document.createElement('div');
  body.className = 'product-body';

  const categoryEl = document.createElement('span');
  categoryEl.className = 'product-category';
  categoryEl.textContent = product.category;

  const nameEl = document.createElement('h3');
  nameEl.className = 'product-name';
  nameEl.textContent = product.name;

  const descEl = document.createElement('p');
  descEl.className = 'product-desc';
  descEl.textContent = product.description;

  const footer = document.createElement('div');
  footer.className = 'product-footer';

  const priceEl = document.createElement('span');
  priceEl.className = 'product-price';
  priceEl.textContent = `$${Number(product.price).toFixed(2)}`;

  const addBtn = document.createElement('button');
  addBtn.className = 'add-btn';
  addBtn.textContent = 'Add';
  addBtn.setAttribute('aria-label', `Add ${product.name} to cart`);
  addBtn.dataset.id = product.id;
  addBtn.addEventListener('click', () => addToCart(product.id));

  footer.append(priceEl, addBtn);
  body.append(categoryEl, nameEl, descEl, footer);
  card.append(media, body);
  return card;
}

function mediaColor(category) {
  const map = { home: '#F2F0EA', kitchen: '#A0D4E0', decor: '#A5958F', 'self-care': '#E8DED9' };
  return map[category] || '#F2F0EA';
}
function iconFor(category) {
  const map = { home: '🧺', kitchen: '☕', decor: '🏺', 'self-care': '🕯️' };
  return map[category] || '🛍️';
}

function renderProductGrid() {
  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(searchTerm) || p.description.toLowerCase().includes(searchTerm)
  );

  shopContent.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No pieces match your search — try a different term or category.';
    shopContent.appendChild(empty);
    resultsCount.textContent = 'No results';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'product-grid';
  filtered.forEach((product) => grid.appendChild(buildProductCard(product)));
  shopContent.appendChild(grid);

  resultsCount.textContent = activeCategory === 'all'
    ? `Showing all ${filtered.length} pieces`
    : `Showing ${filtered.length} pieces in ${activeCategory}`;
}

/* =========================================================================
   3. LOADING PRODUCTS FROM THE BACKEND
   This is the actual async/await flow: try the request, fall back to a
   clear error state if it fails, and always clear the loading spinner
   in finally() regardless of what happened.
   ========================================================================= */

async function loadProducts(category) {
  showLoadingState();

  try {
    const products = await fetchProducts(category);
    allProducts = products;
    setConnectionStatus(true);
    renderProductGrid();
  } catch (err) {
    // fetch() itself throws a generic "Failed to fetch" for network-level
    // problems (server not running, CORS blocked) - that's the signal to
    // show the connection banner instead of just a product-grid error
    if (err instanceof TypeError) {
      setConnectionStatus(false);
      showErrorState('The backend server is not reachable. Is it running on http://localhost:3000?');
    } else {
      showErrorState(err.message);
    }
  }
}

function setConnectionStatus(reachable) {
  isBackendReachable = reachable;
  if (reachable) {
    connectionBanner.classList.remove('is-visible', 'offline');
  } else {
    connectionBanner.classList.add('is-visible', 'offline');
    connectionText.textContent = "Can't reach the server — start the backend and try again.";
  }
}

/* =========================================================================
   4. CATEGORY FILTER + SEARCH
   Category = a real round trip to the backend (?category=...).
   Search = filtered client-side over whatever we already have, no need
   to hit the network for every keystroke.
   ========================================================================= */

categoryPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    categoryPills.forEach((p) => p.classList.remove('is-active'));
    pill.classList.add('is-active');
    activeCategory = pill.dataset.category;
    loadProducts(activeCategory);
  });
});

searchToggle.addEventListener('click', () => {
  const isHidden = searchBar.hidden;
  searchBar.hidden = !isHidden;
  searchToggle.setAttribute('aria-expanded', String(isHidden));
  if (isHidden) searchInput.focus();
});

searchInput.addEventListener('input', (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderProductGrid();
});

/* ---------- mobile nav ---------- */
menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
mainNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

/* =========================================================================
   5. CART (still client-side - the cart itself doesn't need to live in
   the database until checkout actually happens)
   ========================================================================= */

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  renderCart();
  showToast('Added to cart');
}

function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  renderCart();
}

function removeFromCart(id) {
  delete cart[id];
  renderCart();
}

function renderCart() {
  const ids = Object.keys(cart);
  cartCountEl.textContent = ids.reduce((sum, id) => sum + cart[id], 0);

  cartItemsEl.innerHTML = '';

  if (ids.length === 0) {
    cartItemsEl.appendChild(cartEmptyEl);
    cartEmptyEl.hidden = false;
    cartTotalEl.textContent = '$0.00';
    return;
  }
  cartEmptyEl.hidden = true;

  let total = 0;
  ids.forEach((id) => {
    const product = allProducts.find((p) => String(p.id) === String(id));
    if (!product) return; // product might have come from a different category fetch
    const qty = cart[id];
    total += product.price * qty;

    const row = document.createElement('div');
    row.className = 'cart-item';

    const media = document.createElement('div');
    media.className = 'cart-item-media';
    media.textContent = iconFor(product.category);

    const info = document.createElement('div');
    const nameEl = document.createElement('p');
    nameEl.className = 'cart-item-name';
    nameEl.textContent = product.name;
    const priceEl = document.createElement('p');
    priceEl.className = 'cart-item-price';
    priceEl.textContent = `$${product.price.toFixed(2)} each`;

    const qtyRow = document.createElement('div');
    qtyRow.className = 'cart-item-qty';
    const minusBtn = document.createElement('button');
    minusBtn.className = 'qty-btn';
    minusBtn.textContent = '−';
    minusBtn.setAttribute('aria-label', `Decrease quantity of ${product.name}`);
    minusBtn.addEventListener('click', () => changeQty(id, -1));
    const qtySpan = document.createElement('span');
    qtySpan.textContent = qty;
    const plusBtn = document.createElement('button');
    plusBtn.className = 'qty-btn';
    plusBtn.textContent = '+';
    plusBtn.setAttribute('aria-label', `Increase quantity of ${product.name}`);
    plusBtn.addEventListener('click', () => changeQty(id, 1));
    qtyRow.append(minusBtn, qtySpan, plusBtn);

    info.append(nameEl, priceEl, qtyRow);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'cart-item-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.setAttribute('aria-label', `Remove ${product.name} from cart`);
    removeBtn.addEventListener('click', () => removeFromCart(id));

    row.append(media, info, removeBtn);
    cartItemsEl.appendChild(row);
  });

  cartTotalEl.textContent = `$${total.toFixed(2)}`;
}

function openCart() {
  cartDrawer.classList.add('is-open');
  cartDrawer.setAttribute('aria-hidden', 'false');
  drawerOverlay.hidden = false;
  requestAnimationFrame(() => drawerOverlay.classList.add('is-visible'));
  cartToggle.setAttribute('aria-expanded', 'true');
}
function closeCart() {
  cartDrawer.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  drawerOverlay.classList.remove('is-visible');
  setTimeout(() => { drawerOverlay.hidden = true; }, 250);
  cartToggle.setAttribute('aria-expanded', 'false');
}
cartToggle.addEventListener('click', openCart);
cartClose.addEventListener('click', closeCart);
drawerOverlay.addEventListener('click', closeCart);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

/* =========================================================================
   6. CHECKOUT - the other half of the integration: POSTing data instead
   of just GETting it. Same try/catch/finally shape as loadProducts().
   ========================================================================= */

checkoutBtn.addEventListener('click', async () => {
  const ids = Object.keys(cart);
  if (ids.length === 0) return;

  if (!isBackendReachable) {
    showToast("Can't check out — the server isn't reachable right now.", true);
    return;
  }

  // in a real app this would come from a login/account or a checkout form;
  // keeping it simple and asking right here for the demo
  const customerName = window.prompt('Name for this order:', 'Hamza');
  if (!customerName) return;
  const customerEmail = window.prompt('Email for this order:', 'hamza@example.com');
  if (!customerEmail) return;

  const orderPayload = {
    customerName,
    customerEmail,
    items: ids.map((id) => ({ productId: Number(id), quantity: cart[id] })),
  };

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Placing order…';

  try {
    const order = await placeOrder(orderPayload);
    showToast(`Order #${order.id} placed — total $${order.total.toFixed(2)}`);
    Object.keys(cart).forEach((id) => delete cart[id]);
    renderCart();
    closeCart();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'Checkout';
  }
});

/* ---------- tiny toast helper ---------- */
let toastTimer = null;
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', isError);
  toastEl.classList.add('is-visible');
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
}

/* =========================================================================
   7. STARTUP
   Health check and the first product fetch don't depend on each other,
   so they go out together with Promise.all() instead of one after
   another - no reason to make the user wait twice.
   ========================================================================= */

async function init() {
  showLoadingState();

  const results = await Promise.allSettled([checkHealth(), fetchProducts('all')]);
  const [healthResult, productsResult] = results;

  setConnectionStatus(healthResult.status === 'fulfilled');

  if (productsResult.status === 'fulfilled') {
    allProducts = productsResult.value;
    renderProductGrid();
  } else {
    showErrorState('The backend server is not reachable. Is it running on http://localhost:3000?');
  }

  renderCart();
}

init();