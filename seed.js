// db/seed.js
// Fills the products table with some starting data, but only if it's
// empty - so running this twice doesn't create duplicates.
// Run it by hand with: npm run seed
// (server.js also calls this once on startup automatically)

const db = require('./connection');

const starterProducts = [
  { name: 'Stoneware Vase', category: 'decor', price: 42.00, description: 'Hand-thrown, matte-glazed vase in warm clay tones.' },
  { name: 'Linen Table Runner', category: 'home', price: 28.00, description: 'Undyed European linen, stone-washed for softness.' },
  { name: 'Soy Candle - Cedar', category: 'self-care', price: 24.00, description: '40-hour burn, hand-poured in reclaimed glass jars.' },
  { name: 'Ceramic Pour-Over Set', category: 'kitchen', price: 56.00, description: 'Speckled stoneware dripper with matching mug.' },
  { name: 'Woven Wall Hanging', category: 'decor', price: 65.00, description: 'Hand-loomed cotton and jute in natural fibers.' },
  { name: 'Recycled Glass Tumblers', category: 'kitchen', price: 34.00, description: 'Set of 4, each with subtle one-of-a-kind bubbles.' },
  { name: 'Oat Milk Bath Soak', category: 'self-care', price: 19.00, description: 'Colloidal oat and lavender, packaged plastic-free.' },
  { name: 'Rattan Storage Basket', category: 'home', price: 38.00, description: 'Hand-woven rattan, sized for throws or firewood.' },
];

function seed() {
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM products').get();

  if (countRow.count > 0) {
    console.log(`products table already has ${countRow.count} rows, skipping seed.`);
    return;
  }

  const insert = db.prepare(
    'INSERT INTO products (name, category, price, description) VALUES (?, ?, ?, ?)'
  );

  // wrapping all the inserts in one transaction is faster and means
  // either all 8 products get added or none do
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run(item.name, item.category, item.price, item.description);
    }
  });

  insertMany(starterProducts);
  console.log(`Seeded ${starterProducts.length} products.`);
}

seed();

// only export in case another script wants to reuse this later
module.exports = seed;