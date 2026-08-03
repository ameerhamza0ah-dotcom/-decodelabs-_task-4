// db/connection.js
// Opens (or creates) the SQLite file and makes sure the schema exists.
// Every other file just does require('./db/connection') to get the
// same open connection - no need to open it more than once.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_FILE = path.join(__dirname, '..', 'store.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

const db = new Database(DB_FILE);

// SQLite doesn't enforce foreign keys unless you turn this on
db.pragma('foreign_keys = ON');

// run the schema every time the app starts - all the CREATE TABLE
// statements use "IF NOT EXISTS" so this is safe to run repeatedly
const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
db.exec(schema);

module.exports = db;