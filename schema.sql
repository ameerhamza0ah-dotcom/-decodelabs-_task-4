-- schema.sql
-- Project 3 - Database Integration
--
-- Three tables:
--   products     -> the catalog (same items as Project 1/2)
--   orders       -> one row per checkout
--   order_items  -> one row per product inside an order (this is the
--                   "junction" table that links orders <-> products,
--                   because one order can have many products and the
--                   relationship needs its own table)
--
-- This gives a One-to-Many between orders and order_items, and a
-- One-to-Many between products and order_items (a product can appear
-- in many different orders over time).

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('home', 'kitchen', 'decor', 'self-care')),
  price       REAL NOT NULL CHECK (price > 0),
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  total          REAL NOT NULL CHECK (total >= 0),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  REAL NOT NULL,

  -- foreign keys = how we "bind the system together with keys"
  -- if an order gets deleted, its line items should go with it (CASCADE)
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  -- products should not be deletable if they're referenced in a past order,
  -- so this one is left as the default (RESTRICT)
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- small indexes so lookups by order/product don't have to scan the whole table
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);