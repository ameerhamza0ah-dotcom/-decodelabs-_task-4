// validators.js
// Same idea as Project 2 - check the data BEFORE it touches the database.
// The database also has its own CHECK/NOT NULL constraints as a second
// line of defense, but catching bad input here lets us send back a
// helpful error message instead of a confusing SQLite error.

const ALLOWED_CATEGORIES = ['home', 'kitchen', 'decor', 'self-care'];

function validateProduct(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return ['Request body is missing or not valid JSON.'];
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string.');
  }

  if (!body.category || !ALLOWED_CATEGORIES.includes(body.category)) {
    errors.push(`category is required and must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`);
  }

  if (body.price === undefined || typeof body.price !== 'number' || body.price <= 0) {
    errors.push('price is required and must be a number greater than 0.');
  }

  if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
    errors.push('description is required and must be a non-empty string.');
  }

  return errors;
}

function validateOrder(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return ['Request body is missing or not valid JSON.'];
  }

  if (!body.customerName || typeof body.customerName !== 'string' || body.customerName.trim().length === 0) {
    errors.push('customerName is required and must be a non-empty string.');
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!body.customerEmail || !emailPattern.test(body.customerEmail)) {
    errors.push('customerEmail is required and must look like a valid email address.');
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items must be a non-empty array.');
  } else {
    body.items.forEach((item, index) => {
      if (!item.productId || typeof item.productId !== 'number') {
        errors.push(`items[${index}].productId is required and must be a number.`);
      }
      if (!item.quantity || typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors.push(`items[${index}].quantity must be a positive whole number.`);
      }
    });
  }

  return errors;
}

module.exports = { validateProduct, validateOrder, ALLOWED_CATEGORIES };