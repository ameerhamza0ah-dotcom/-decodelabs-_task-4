// server.js
// Project 3 - Database Integration
// Terra & Co. Store API, now backed by a real SQLite database instead
// of an array sitting in memory (that was Project 2 - this is the
// upgrade). Still plain Node.js http module, no Express, so the
// routing logic is the same shape as Project 2, just talking to the
// database instead of an array now.
//
// How to run:
//   npm install        (only needed once, installs better-sqlite3)
//   node server.js
// Server starts on http://localhost:3000
// A store.db file will appear in this folder - that's the actual database.

const http = require('http');
const url = require('url');
const db = require('./db/connection');
const seed = require('./db/seed');
const { validateProduct, validateOrder } = require('./validators');

const PORT = 3000;

// make sure there's at least some data to look at on first run
seed();

// ---------- small helpers ----------

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (raw.trim().length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------- prepared statements ----------
// these get reused across requests instead of writing a new query
// (with the value pasted in) every single time. This is what actually
// stops SQL injection - the "?" is filled in by the driver, never by
// string concatenation.

const getAllProductsStmt = db.prepare('SELECT * FROM products ORDER BY id');
const getProductsByCategoryStmt = db.prepare('SELECT * FROM products WHERE category = ? ORDER BY id');
const getProductByIdStmt = db.prepare('SELECT * FROM products WHERE id = ?');
const insertProductStmt = db.prepare(
  'INSERT INTO products (name, category, price, description) VALUES (?, ?, ?, ?)'
);
const updateProductStmt = db.prepare(
  'UPDATE products SET name = ?, category = ?, price = ?, description = ? WHERE id = ?'
);
const deleteProductStmt = db.prepare('DELETE FROM products WHERE id = ?');

const getAllOrdersStmt = db.prepare('SELECT * FROM orders ORDER BY id DESC');
const getOrderByIdStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
const getOrderItemsStmt = db.prepare(
  `SELECT order_items.*, products.name AS product_name
   FROM order_items
   JOIN products ON products.id = order_items.product_id
   WHERE order_items.order_id = ?`
);
const insertOrderStmt = db.prepare(
  'INSERT INTO orders (customer_name, customer_email, total) VALUES (?, ?, ?)'
);
const insertOrderItemStmt = db.prepare(
  'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
);
const deleteOrderStmt = db.prepare('DELETE FROM orders WHERE id = ?');

// ---------- route handlers: products ----------

function handleGetProducts(req, res, query) {
  const rows = query.category
    ? getProductsByCategoryStmt.all(query.category)
    : getAllProductsStmt.all();

  sendJson(res, 200, { count: rows.length, products: rows });
}

function handleGetProductById(req, res, id) {
  const product = getProductByIdStmt.get(id);

  if (!product) {
    sendJson(res, 404, { error: `No product found with id ${id}.` });
    return;
  }

  sendJson(res, 200, product);
}

async function handleCreateProduct(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: 'Could not read request body. Make sure it is valid JSON.' });
    return;
  }

  const errors = validateProduct(body);
  if (errors.length > 0) {
    sendJson(res, 400, { error: 'Validation failed.', details: errors });
    return;
  }

  const info = insertProductStmt.run(
    body.name.trim(),
    body.category,
    body.price,
    body.description.trim()
  );

  const newProduct = getProductByIdStmt.get(info.lastInsertRowid);
  sendJson(res, 201, newProduct);
}

async function handleUpdateProduct(req, res, id) {
  const existing = getProductByIdStmt.get(id);
  if (!existing) {
    sendJson(res, 404, { error: `No product found with id ${id}.` });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: 'Could not read request body. Make sure it is valid JSON.' });
    return;
  }

  const errors = validateProduct(body);
  if (errors.length > 0) {
    sendJson(res, 400, { error: 'Validation failed.', details: errors });
    return;
  }

  updateProductStmt.run(body.name.trim(), body.category, body.price, body.description.trim(), id);

  const updated = getProductByIdStmt.get(id);
  sendJson(res, 200, updated);
}

function handleDeleteProduct(req, res, id) {
  const existing = getProductByIdStmt.get(id);
  if (!existing) {
    sendJson(res, 404, { error: `No product found with id ${id}.` });
    return;
  }

  try {
    deleteProductStmt.run(id);
  } catch (err) {
    // this fires if the product is still referenced by an order_items row
    // (there's no ON DELETE CASCADE on that foreign key on purpose -
    // we don't want to silently erase order history)
    sendJson(res, 409, {
      error: 'This product cannot be deleted because it is part of an existing order.',
    });
    return;
  }

  sendJson(res, 200, { message: `Product ${id} deleted.` });
}

// ---------- route handlers: orders ----------

function attachItemsToOrder(order) {
  const items = getOrderItemsStmt.all(order.id);
  return {
    ...order,
    items: items.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: Number((item.unit_price * item.quantity).toFixed(2)),
    })),
  };
}

function handleGetOrders(req, res) {
  const orders = getAllOrdersStmt.all().map(attachItemsToOrder);
  sendJson(res, 200, { count: orders.length, orders });
}

function handleGetOrderById(req, res, id) {
  const order = getOrderByIdStmt.get(id);

  if (!order) {
    sendJson(res, 404, { error: `No order found with id ${id}.` });
    return;
  }

  sendJson(res, 200, attachItemsToOrder(order));
}

async function handleCreateOrder(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: 'Could not read request body. Make sure it is valid JSON.' });
    return;
  }

  const errors = validateOrder(body);
  if (errors.length > 0) {
    sendJson(res, 400, { error: 'Validation failed.', details: errors });
    return;
  }

  // check every product actually exists before we create anything
  const missingIds = [];
  let total = 0;
  const resolvedItems = body.items.map((item) => {
    const product = getProductByIdStmt.get(item.productId);
    if (!product) {
      missingIds.push(item.productId);
      return null;
    }
    total += product.price * item.quantity;
    return { productId: product.id, quantity: item.quantity, unitPrice: product.price };
  });

  if (missingIds.length > 0) {
    sendJson(res, 400, {
      error: 'One or more products in this order do not exist.',
      details: missingIds.map((id) => `No product found with id ${id}.`),
    });
    return;
  }

  // an order + its items need to be created together - if writing the
  // items fails halfway through, we don't want a half-finished order
  // sitting in the database. db.transaction() handles that rollback.
  const createOrder = db.transaction(() => {
    const orderInfo = insertOrderStmt.run(
      body.customerName.trim(),
      body.customerEmail.trim(),
      Number(total.toFixed(2))
    );
    const orderId = orderInfo.lastInsertRowid;

    for (const item of resolvedItems) {
      insertOrderItemStmt.run(orderId, item.productId, item.quantity, item.unitPrice);
    }

    return orderId;
  });

  const newOrderId = createOrder();
  const newOrder = attachItemsToOrder(getOrderByIdStmt.get(newOrderId));
  sendJson(res, 201, newOrder);
}

function handleDeleteOrder(req, res, id) {
  const existing = getOrderByIdStmt.get(id);
  if (!existing) {
    sendJson(res, 404, { error: `No order found with id ${id}.` });
    return;
  }

  // order_items has ON DELETE CASCADE, so this cleans up the line
  // items automatically
  deleteOrderStmt.run(id);
  sendJson(res, 200, { message: `Order ${id} deleted.` });
}

function handleHealthCheck(req, res) {
  sendJson(res, 200, { status: 'ok', message: 'Terra & Co. API is running (with a real database now).' });
}

// ---------- router ----------

async function router(req, res) {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const query = parsed.query;
  const method = req.method;

  if (method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (path === '/api/health' && method === 'GET') {
      return handleHealthCheck(req, res);
    }

    if (path === '/api/products' && method === 'GET') {
      return handleGetProducts(req, res, query);
    }
    if (path === '/api/products' && method === 'POST') {
      return await handleCreateProduct(req, res);
    }

    const productMatch = path.match(/^\/api\/products\/(\d+)$/);
    if (productMatch) {
      const id = Number(productMatch[1]);
      if (method === 'GET') return handleGetProductById(req, res, id);
      if (method === 'PUT') return await handleUpdateProduct(req, res, id);
      if (method === 'DELETE') return handleDeleteProduct(req, res, id);
      sendJson(res, 405, { error: `Method ${method} is not allowed on ${path}.` });
      return;
    }

    if (path === '/api/orders' && method === 'GET') {
      return handleGetOrders(req, res);
    }
    if (path === '/api/orders' && method === 'POST') {
      return await handleCreateOrder(req, res);
    }

    const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
    if (orderMatch) {
      const id = Number(orderMatch[1]);
      if (method === 'GET') return handleGetOrderById(req, res, id);
      if (method === 'DELETE') return handleDeleteOrder(req, res, id);
      sendJson(res, 405, { error: `Method ${method} is not allowed on ${path}.` });
      return;
    }

    const knownPaths = ['/api/health', '/api/products', '/api/orders'];
    const pathIsKnown = knownPaths.some((p) => path.startsWith(p));
    if (pathIsKnown) {
      sendJson(res, 405, { error: `Method ${method} is not allowed on ${path}.` });
      return;
    }

    sendJson(res, 404, { error: `Route ${method} ${path} does not exist.` });
  } catch (err) {
    console.error('Unexpected server error:', err);
    sendJson(res, 500, { error: 'Something went wrong on the server.' });
  }
}

const server = http.createServer(router);

server.listen(PORT, () => {
  console.log(`Terra & Co. API (Project 3) listening on http://localhost:${PORT}`);
  console.log('Database file: store.db');
  console.log('Try: GET http://localhost:3000/api/products');
});