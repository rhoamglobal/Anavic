const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware');

// GET /api/customers - Get all credit customers
router.get('/', requireAuth, (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM credit_customers ORDER BY name ASC').all();
    res.json(customers);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to retrieve credit customers.' });
  }
});

// POST /api/customers - Create a new credit customer (Accountant only)
router.post('/', requireAuth, requireRole('accountant'), (req, res) => {
  const { name, custom_diesel_price, credit_limit } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }

  const customPrice = custom_diesel_price !== undefined && custom_diesel_price !== '' ? parseFloat(custom_diesel_price) : null;
  const limit = credit_limit !== undefined ? parseFloat(credit_limit) : 5000.0;

  if (customPrice !== null && (isNaN(customPrice) || customPrice < 0)) {
    return res.status(400).json({ error: 'Custom diesel price must be a positive number.' });
  }
  if (isNaN(limit) || limit < 0) {
    return res.status(400).json({ error: 'Credit limit must be a positive number.' });
  }

  try {
    // Check duplicate name
    const existing = db.prepare('SELECT id FROM credit_customers WHERE name = ?').get(name);
    if (existing) {
      return res.status(400).json({ error: 'A corporate customer with this name already exists.' });
    }

    const result = db.prepare(`
      INSERT INTO credit_customers (name, custom_diesel_price, credit_limit, balance)
      VALUES (?, ?, ?, 0.0)
    `).run(name, customPrice, limit);

    res.status(201).json({
      message: 'Credit customer created successfully.',
      customerId: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ error: 'Failed to create credit customer.' });
  }
});

// GET /api/customers/:id/ledger - Retrieve audit ledger for a customer
router.get('/:id/ledger', requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid customer ID.' });
  }

  try {
    const customer = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Credit customer not found.' });
    }

    // Retrieve all debits (fuel purchases)
    const debits = db.prepare(`
      SELECT
        id,
        'purchase' AS type,
        fuel_type,
        liters,
        price_per_liter,
        total_amount AS amount,
        created_at AS date
      FROM credit_sales
      WHERE customer_id = ?
    `).all(customerId);

    // Retrieve all credits (payments received)
    const credits = db.prepare(`
      SELECT
        cp.id,
        'payment' AS type,
        '' AS fuel_type,
        0 AS liters,
        0 AS price_per_liter,
        cp.amount,
        cp.payment_date AS date,
        cp.payment_method,
        cp.reference_no,
        u.full_name AS recorded_by_name
      FROM customer_payments cp
      JOIN users u ON cp.recorded_by = u.id
      WHERE cp.customer_id = ?
    `).all(customerId);

    // Merge and sort ledger by date ascending
    const ledger = [...debits, ...credits].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate rolling balances
    let runningBalance = 0;
    const ledgerWithBalance = ledger.map(entry => {
      if (entry.type === 'purchase') {
        runningBalance += entry.amount;
      } else {
        runningBalance -= entry.amount;
      }
      return {
        ...entry,
        runningBalance
      };
    });

    res.json({
      customer,
      ledger: ledgerWithBalance.reverse() // Return newest first for standard view
    });
  } catch (err) {
    console.error('Error fetching ledger:', err);
    res.status(500).json({ error: 'Failed to fetch ledger statement.' });
  }
});

// POST /api/customers/:id/payments - Record a payment from a corporate customer (Accountant only)
router.post('/:id/payments', requireAuth, requireRole('accountant'), (req, res) => {
  const customerId = parseInt(req.params.id);
  const { amount, payment_method, reference_no } = req.body;

  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid customer ID.' });
  }

  if (!amount || !payment_method) {
    return res.status(400).json({ error: 'Amount and payment method are required.' });
  }

  const amtVal = parseFloat(amount);
  if (isNaN(amtVal) || amtVal <= 0) {
    return res.status(400).json({ error: 'Payment amount must be a positive number.' });
  }

  try {
    const customer = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Credit customer not found.' });
    }

    // Process payment in a transaction
    const paymentTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO customer_payments (customer_id, amount, payment_method, reference_no, recorded_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(customerId, amtVal, payment_method, reference_no || null, req.user.id);

      db.prepare(`
        UPDATE credit_customers
        SET balance = balance - ?
        WHERE id = ?
      `).run(amtVal, customerId);
    });

    paymentTx();

    const updatedCustomer = db.prepare('SELECT balance FROM credit_customers WHERE id = ?').get(customerId);

    res.status(201).json({
      message: 'Payment recorded successfully.',
      newBalance: updatedCustomer.balance
    });
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: 'Failed to record payment.' });
  }
});

module.exports = router;
