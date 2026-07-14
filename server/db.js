const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// Database connection
const dbPath = path.resolve(__dirname, '../gas_station.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schemas
function initDatabase() {
  // Create tables if they do not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('attendant', 'accountant')),
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fuel_prices (
      fuel_type TEXT PRIMARY KEY CHECK(fuel_type IN ('diesel', 'petrol')),
      price_per_liter REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendant_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'closed', 'approved')),
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      opening_float REAL DEFAULT 0.0,
      closing_cash_actual REAL DEFAULT 0.0,
      reconciled_at DATETIME,
      reconciled_by INTEGER,
      reconciliation_notes TEXT,
      FOREIGN KEY (attendant_id) REFERENCES users(id),
      FOREIGN KEY (reconciled_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS shift_meters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      fuel_type TEXT NOT NULL CHECK(fuel_type IN ('diesel', 'petrol')),
      start_meter REAL NOT NULL,
      end_meter REAL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      UNIQUE(shift_id, fuel_type)
    );

    CREATE TABLE IF NOT EXISTS shift_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('Generator Fuel', 'Cleaning', 'Utilities', 'Staff Refreshments', 'Other')),
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credit_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      custom_diesel_price REAL,
      credit_limit REAL NOT NULL DEFAULT 5000.0,
      balance REAL NOT NULL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credit_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      fuel_type TEXT NOT NULL CHECK(fuel_type IN ('diesel', 'petrol')),
      liters REAL NOT NULL,
      price_per_liter REAL NOT NULL,
      total_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES credit_customers(id)
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('Bank Transfer', 'Cash', 'Cheque')),
      reference_no TEXT,
      recorded_by INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES credit_customers(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tank_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      diesel_start_dip REAL NOT NULL,
      diesel_end_dip REAL NOT NULL,
      diesel_delivery REAL NOT NULL DEFAULT 0.0,
      petrol_start_dip REAL NOT NULL,
      petrol_end_dip REAL NOT NULL,
      petrol_delivery REAL NOT NULL DEFAULT 0.0,
      recorded_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );
  `);

  seedDefaultData();
}

// Seed helper
function seedDefaultData() {
  // Check if users exist, seed if not
  const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const attendantPassword = bcrypt.hashSync('attendant123', salt);
    const accountantPassword = bcrypt.hashSync('accountant123', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password, role, full_name)
      VALUES (?, ?, ?, ?)
    `);

    insertUser.run('attendant', attendantPassword, 'attendant', 'John Doe (Attendant)');
    insertUser.run('accountant', accountantPassword, 'accountant', 'Jane Smith (Accountant)');
    console.log('Database users seeded successfully.');
  }

  // Seed default prices if empty
  const priceCount = db.prepare('SELECT count(*) as count FROM fuel_prices').get().count;
  if (priceCount === 0) {
    const insertPrice = db.prepare(`
      INSERT INTO fuel_prices (fuel_type, price_per_liter) VALUES (?, ?)
    `);
    insertPrice.run('diesel', 1.65);
    insertPrice.run('petrol', 1.80);
    console.log('Fuel prices seeded successfully.');
  }

  // Seed default credit customers if empty
  const customerCount = db.prepare('SELECT count(*) as count FROM credit_customers').get().count;
  if (customerCount === 0) {
    const insertCustomer = db.prepare(`
      INSERT INTO credit_customers (name, custom_diesel_price, credit_limit, balance) VALUES (?, ?, ?, ?)
    `);
    insertCustomer.run('Swift Logistics', 1.55, 10000.0, 0.0);
    insertCustomer.run('Mega Construction', null, 5000.0, 0.0);
    console.log('Credit customers seeded successfully.');
  }
}

// Drops all tables and re-seeds (highly useful for automated testing isolation)
function resetAndSeed() {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS tank_inventory;
    DROP TABLE IF EXISTS customer_payments;
    DROP TABLE IF EXISTS credit_sales;
    DROP TABLE IF EXISTS credit_customers;
    DROP TABLE IF EXISTS shift_expenses;
    DROP TABLE IF EXISTS shift_meters;
    DROP TABLE IF EXISTS shifts;
    DROP TABLE IF EXISTS fuel_prices;
    DROP TABLE IF EXISTS users;
    PRAGMA foreign_keys = ON;
  `);
  initDatabase();
}

// Execute schema creation & seeding on load
initDatabase();

module.exports = db;
module.exports.resetAndSeed = resetAndSeed;
