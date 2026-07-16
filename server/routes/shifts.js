const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole, requireAnyRole } = require('../middleware');

// Helper to get active shift for an attendant
function getActiveShift(attendantId) {
  return db.prepare(`
    SELECT * FROM shifts
    WHERE attendant_id = ? AND status = 'open'
  `).get(attendantId);
}

// GET /api/shifts/active - Get the current open shift for the logged-in attendant
router.get('/active', requireAuth, requireRole('attendant'), (req, res) => {
  try {
    const shift = getActiveShift(req.user.id);
    if (!shift) {
      return res.json({ active: false, shift: null });
    }

    // Load meters, expenses, and credit sales for this shift
    const meters = db.prepare('SELECT * FROM shift_meters WHERE shift_id = ?').all(shift.id);
    const expenses = db.prepare('SELECT * FROM shift_expenses WHERE shift_id = ?').all(shift.id);
    const creditSales = db.prepare(`
      SELECT cs.*, cc.name as customer_name
      FROM credit_sales cs
      JOIN credit_customers cc ON cs.customer_id = cc.id
      WHERE cs.shift_id = ?
    `).all(shift.id);

    res.json({
      active: true,
      shift: {
        ...shift,
        meters,
        expenses,
        creditSales
      }
    });
  } catch (err) {
    console.error('Error fetching active shift:', err);
    res.status(500).json({ error: 'Failed to retrieve active shift details.' });
  }
});

// POST /api/shifts/open - Open a new shift (Attendants can input current pump selling prices)
router.post('/open', requireAuth, requireRole('attendant'), (req, res) => {
  const { opening_float, ago_start_meter, dpk_start_meter, petrol_start_meter, ago_price, dpk_price, petrol_price } = req.body;

  if (opening_float === undefined || ago_start_meter === undefined || dpk_start_meter === undefined || petrol_start_meter === undefined) {
    return res.status(400).json({ error: 'Opening float and start meters for all three products (AGO, DPK, Petrol) are required.' });
  }

  const floatVal = parseFloat(opening_float);
  const agoStart = parseFloat(ago_start_meter);
  const dpkStart = parseFloat(dpk_start_meter);
  const petrolStart = parseFloat(petrol_start_meter);

  if (isNaN(floatVal) || isNaN(agoStart) || isNaN(dpkStart) || isNaN(petrolStart)) {
    return res.status(400).json({ error: 'All input readings must be valid numbers.' });
  }

  try {
    // Check if attendant already has an active shift
    const activeShift = getActiveShift(req.user.id);
    if (activeShift) {
      return res.status(400).json({ error: 'You already have an open shift. Please close it first.' });
    }

    // Determine selling prices: If attendant inputs them, use them; else fallback to global prices
    let activeAgoPrice = parseFloat(ago_price);
    let activeDpkPrice = parseFloat(dpk_price);
    let activePetrolPrice = parseFloat(petrol_price);

    const prices = db.prepare('SELECT * FROM fuel_prices').all();
    if (isNaN(activeAgoPrice) || activeAgoPrice <= 0) {
      activeAgoPrice = prices.find(p => p.fuel_type === 'ago')?.price_per_liter || 1100.0;
    }
    if (isNaN(activeDpkPrice) || activeDpkPrice <= 0) {
      activeDpkPrice = prices.find(p => p.fuel_type === 'dpk')?.price_per_liter || 1000.0;
    }
    if (isNaN(activePetrolPrice) || activePetrolPrice <= 0) {
      activePetrolPrice = prices.find(p => p.fuel_type === 'petrol')?.price_per_liter || 950.0;
    }

    // Use transaction to create shift and insert meters for all three products
    const openShiftTx = db.transaction(() => {
      const insertShift = db.prepare(`
        INSERT INTO shifts (attendant_id, status, opening_float)
        VALUES (?, 'open', ?)
      `);
      const result = insertShift.run(req.user.id, floatVal);
      const shiftId = result.lastInsertRowid;

      const insertMeter = db.prepare(`
        INSERT INTO shift_meters (shift_id, fuel_type, start_meter, unit_price)
        VALUES (?, ?, ?, ?)
      `);

      insertMeter.run(shiftId, 'ago', agoStart, activeAgoPrice);
      insertMeter.run(shiftId, 'dpk', dpkStart, activeDpkPrice);
      insertMeter.run(shiftId, 'petrol', petrolStart, activePetrolPrice);

      return shiftId;
    });

    const newShiftId = openShiftTx();

    res.status(201).json({
      message: 'Shift opened successfully.',
      shiftId: newShiftId
    });
  } catch (err) {
    console.error('Error opening shift:', err);
    res.status(500).json({ error: 'Failed to open a new shift.' });
  }
});

// POST /api/shifts/expense - Add petty cash expense
router.post('/expense', requireAuth, requireRole('attendant'), (req, res) => {
  const { amount, category, description } = req.body;

  if (!amount || !category || !description) {
    return res.status(400).json({ error: 'Amount, category, and description are required.' });
  }

  const amtVal = parseFloat(amount);
  if (isNaN(amtVal) || amtVal <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }

  try {
    const shift = getActiveShift(req.user.id);
    if (!shift) {
      return res.status(400).json({ error: 'No active shift found. Open a shift first.' });
    }

    db.prepare(`
      INSERT INTO shift_expenses (shift_id, amount, category, description)
      VALUES (?, ?, ?, ?)
    `).run(shift.id, amtVal, category, description);

    res.status(201).json({ message: 'Expense logged successfully.' });
  } catch (err) {
    console.error('Error logging expense:', err);
    res.status(500).json({ error: 'Failed to log petty cash expense.' });
  }
});

// PUT /api/shifts/expense/:id - Edit an expense (Attendants can edit during active open shifts)
router.put('/expense/:id', requireAuth, requireRole('attendant'), (req, res) => {
  const expenseId = parseInt(req.params.id);
  const { amount, category, description } = req.body;

  if (isNaN(expenseId)) {
    return res.status(400).json({ error: 'Invalid expense ID.' });
  }

  if (!amount || !category || !description) {
    return res.status(400).json({ error: 'Amount, category, and description are required.' });
  }

  const amtVal = parseFloat(amount);
  if (isNaN(amtVal) || amtVal <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }

  try {
    const expense = db.prepare('SELECT * FROM shift_expenses WHERE id = ?').get(expenseId);
    if (!expense) {
      return res.status(404).json({ error: 'Expense record not found.' });
    }

    // Verify shift status is still open
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(expense.shift_id);
    if (!shift) {
      return res.status(404).json({ error: 'Associated shift not found.' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'Action denied. Expenses can only be edited while their shift is still open.' });
    }

    // Verify the attendant logged in is the owner of this shift
    if (shift.attendant_id !== req.user.id) {
      return res.status(403).json({ error: 'Action denied. You can only edit expenses from your own shift.' });
    }

    db.prepare(`
      UPDATE shift_expenses
      SET amount = ?, category = ?, description = ?
      WHERE id = ?
    `).run(amtVal, category, description, expenseId);

    res.json({ message: 'Expense updated successfully.' });
  } catch (err) {
    console.error('Error editing expense:', err);
    res.status(500).json({ error: 'Failed to update expense.' });
  }
});

// DELETE /api/shifts/expense/:id - Delete an expense (Attendants can delete during active open shifts)
router.delete('/expense/:id', requireAuth, requireRole('attendant'), (req, res) => {
  const expenseId = parseInt(req.params.id);

  if (isNaN(expenseId)) {
    return res.status(400).json({ error: 'Invalid expense ID.' });
  }

  try {
    const expense = db.prepare('SELECT * FROM shift_expenses WHERE id = ?').get(expenseId);
    if (!expense) {
      return res.status(404).json({ error: 'Expense record not found.' });
    }

    // Verify shift status is open
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(expense.shift_id);
    if (!shift) {
      return res.status(404).json({ error: 'Associated shift not found.' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'Action denied. Expenses can only be deleted while their shift is still open.' });
    }

    // Verify attendant is shift owner
    if (shift.attendant_id !== req.user.id) {
      return res.status(403).json({ error: 'Action denied. You can only delete expenses from your own shift.' });
    }

    db.prepare('DELETE FROM shift_expenses WHERE id = ?').run(expenseId);

    res.json({ message: 'Expense deleted successfully.' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

// POST /api/shifts/credit-sale - Add credit sales (corporate accounts)
router.post('/credit-sale', requireAuth, requireRole('attendant'), (req, res) => {
  const { customer_id, fuel_type, liters } = req.body;

  if (!customer_id || !fuel_type || !liters) {
    return res.status(400).json({ error: 'Customer, fuel type, and liters are required.' });
  }

  const litersVal = parseFloat(liters);
  if (isNaN(litersVal) || litersVal <= 0) {
    return res.status(400).json({ error: 'Liters must be a positive number.' });
  }

  if (fuel_type !== 'ago' && fuel_type !== 'dpk' && fuel_type !== 'petrol') {
    return res.status(400).json({ error: 'Invalid fuel type. Must be ago, dpk, or petrol.' });
  }

  try {
    const shift = getActiveShift(req.user.id);
    if (!shift) {
      return res.status(400).json({ error: 'No active shift found. Open a shift first.' });
    }

    // Get customer details
    const customer = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Credit customer not found.' });
    }

    if (customer.status !== 'active') {
      return res.status(400).json({ error: `Corporate account '${customer.name}' is currently INACTIVE. Credit sales are blocked.` });
    }

    // Determine unit price based on three products custom fields
    let pricePerLiter;
    if (fuel_type === 'ago' && customer.custom_ago_price !== null) {
      pricePerLiter = customer.custom_ago_price;
    } else if (fuel_type === 'dpk' && customer.custom_dpk_price !== null) {
      pricePerLiter = customer.custom_dpk_price;
    } else if (fuel_type === 'petrol' && customer.custom_petrol_price !== null) {
      pricePerLiter = customer.custom_petrol_price;
    } else {
      // Use active unit price from shift meters
      const shiftMeter = db.prepare(`
        SELECT unit_price FROM shift_meters
        WHERE shift_id = ? AND fuel_type = ?
      `).get(shift.id, fuel_type);
      pricePerLiter = shiftMeter?.unit_price || 0;
    }

    const totalAmount = litersVal * pricePerLiter;

    // Check Credit Limit
    if (customer.balance + totalAmount > customer.credit_limit) {
      return res.status(400).json({
        error: `Credit limit exceeded. Current Balance: ₦${customer.balance.toFixed(2)}, ` +
               `Limit: ₦${customer.credit_limit.toFixed(2)}. Adding ₦${totalAmount.toFixed(2)} exceeds limit.`
      });
    }

    // Transaction to insert credit sale and update customer balance
    const creditSaleTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO credit_sales (shift_id, customer_id, fuel_type, liters, price_per_liter, total_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(shift.id, customer.id, fuel_type, litersVal, pricePerLiter, totalAmount);

      db.prepare(`
        UPDATE credit_customers
        SET balance = balance + ?
        WHERE id = ?
      `).run(totalAmount, customer.id);
    });

    creditSaleTx();

    res.status(201).json({
      message: 'Credit sale logged successfully.',
      totalAmount
    });
  } catch (err) {
    console.error('Error logging credit sale:', err);
    res.status(500).json({ error: 'Failed to record credit sale.' });
  }
});

// PUT /api/shifts/credit-sale/:id - Edit a credit sale (Attendants can edit during active open shifts)
router.put('/credit-sale/:id', requireAuth, requireRole('attendant'), (req, res) => {
  const saleId = parseInt(req.params.id);
  const { liters } = req.body;

  if (isNaN(saleId)) {
    return res.status(400).json({ error: 'Invalid credit sale ID.' });
  }

  const litersVal = parseFloat(liters);
  if (isNaN(litersVal) || litersVal <= 0) {
    return res.status(400).json({ error: 'Liters must be a positive number.' });
  }

  try {
    const sale = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(saleId);
    if (!sale) {
      return res.status(404).json({ error: 'Credit sale record not found.' });
    }

    // Verify shift status is still open
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(sale.shift_id);
    if (!shift) {
      return res.status(404).json({ error: 'Associated shift not found.' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'Action denied. Credit sales can only be edited while their shift is still open.' });
    }

    // Verify the attendant logged in is the owner of this shift
    if (shift.attendant_id !== req.user.id) {
      return res.status(403).json({ error: 'Action denied. You can only edit credit sales from your own shift.' });
    }

    const customer = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(sale.customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Associated credit customer not found.' });
    }

    const newTotalAmount = litersVal * sale.price_per_liter;
    const balanceDiff = newTotalAmount - sale.total_amount;

    // Check Credit Limit with new balance diff
    if (customer.balance + balanceDiff > customer.credit_limit) {
      return res.status(400).json({
        error: `Credit limit exceeded. Current Balance: ₦${customer.balance.toFixed(2)}, ` +
               `Limit: ₦${customer.credit_limit.toFixed(2)}. This edit would exceed limit by ₦${(customer.balance + balanceDiff - customer.credit_limit).toFixed(2)}.`
      });
    }

    // Transaction to update credit sale and rollback/update balance
    const updateSaleTx = db.transaction(() => {
      db.prepare(`
        UPDATE credit_sales
        SET liters = ?, total_amount = ?
        WHERE id = ?
      `).run(litersVal, newTotalAmount, saleId);

      db.prepare(`
        UPDATE credit_customers
        SET balance = balance + ?
        WHERE id = ?
      `).run(balanceDiff, customer.id);
    });

    updateSaleTx();

    res.json({ message: 'Credit sale updated successfully.', newTotalAmount });
  } catch (err) {
    console.error('Error editing credit sale:', err);
    res.status(500).json({ error: 'Failed to update credit sale.' });
  }
});

// DELETE /api/shifts/credit-sale/:id - Delete a credit sale (Attendants can delete during active open shifts)
router.delete('/credit-sale/:id', requireAuth, requireRole('attendant'), (req, res) => {
  const saleId = parseInt(req.params.id);

  if (isNaN(saleId)) {
    return res.status(400).json({ error: 'Invalid credit sale ID.' });
  }

  try {
    const sale = db.prepare('SELECT * FROM credit_sales WHERE id = ?').get(saleId);
    if (!sale) {
      return res.status(404).json({ error: 'Credit sale record not found.' });
    }

    // Verify shift status is open
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(sale.shift_id);
    if (!shift) {
      return res.status(404).json({ error: 'Associated shift not found.' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'Action denied. Credit sales can only be deleted while their shift is still open.' });
    }

    // Verify attendant is shift owner
    if (shift.attendant_id !== req.user.id) {
      return res.status(403).json({ error: 'Action denied. You can only delete credit sales from your own shift.' });
    }

    // Transaction to delete sale and revert customer balance
    const deleteSaleTx = db.transaction(() => {
      db.prepare(`
        UPDATE credit_customers
        SET balance = balance - ?
        WHERE id = ?
      `).run(sale.total_amount, sale.customer_id);

      db.prepare('DELETE FROM credit_sales WHERE id = ?').run(saleId);
    });

    deleteSaleTx();

    res.json({ message: 'Credit sale deleted successfully.' });
  } catch (err) {
    console.error('Error deleting credit sale:', err);
    res.status(500).json({ error: 'Failed to delete credit sale.' });
  }
});

// POST /api/shifts/close - Close active shift, record POS Card Sales, and calculate final reconciliation
router.post('/close', requireAuth, requireRole('attendant'), (req, res) => {
  const { ago_end_meter, dpk_end_meter, petrol_end_meter, closing_cash_actual, closing_pos_actual } = req.body;

  if (ago_end_meter === undefined || dpk_end_meter === undefined || petrol_end_meter === undefined || closing_cash_actual === undefined) {
    return res.status(400).json({ error: 'End meters for all three products and actual closing cash are required.' });
  }

  const agoEnd = parseFloat(ago_end_meter);
  const dpkEnd = parseFloat(dpk_end_meter);
  const petrolEnd = parseFloat(petrol_end_meter);
  const cashActual = parseFloat(closing_cash_actual);
  const posActual = parseFloat(closing_pos_actual || 0);

  if (isNaN(agoEnd) || isNaN(dpkEnd) || isNaN(petrolEnd) || isNaN(cashActual) || isNaN(posActual)) {
    return res.status(400).json({ error: 'All inputs must be valid numbers.' });
  }

  try {
    const shift = getActiveShift(req.user.id);
    if (!shift) {
      return res.status(400).json({ error: 'No active shift found to close.' });
    }

    // Load shift meter details
    const meters = db.prepare('SELECT * FROM shift_meters WHERE shift_id = ?').all(shift.id);
    const agoMeter = meters.find(m => m.fuel_type === 'ago');
    const dpkMeter = meters.find(m => m.fuel_type === 'dpk');
    const petrolMeter = meters.find(m => m.fuel_type === 'petrol');

    if (!agoMeter || !dpkMeter || !petrolMeter) {
      return res.status(500).json({ error: 'Meter structures are corrupted for this shift.' });
    }

    if (agoEnd < agoMeter.start_meter) {
      return res.status(400).json({ error: `AGO end meter (${agoEnd}) cannot be less than start meter (${agoMeter.start_meter}).` });
    }
    if (dpkEnd < dpkMeter.start_meter) {
      return res.status(400).json({ error: `DPK end meter (${dpkEnd}) cannot be less than start meter (${dpkMeter.start_meter}).` });
    }
    if (petrolEnd < petrolMeter.start_meter) {
      return res.status(400).json({ error: `Petrol end meter (${petrolEnd}) cannot be less than start meter (${petrolMeter.start_meter}).` });
    }

    // Fetch summaries of expenses and credit sales
    const totalExpenses = db.prepare('SELECT SUM(amount) as total FROM shift_expenses WHERE shift_id = ?').get(shift.id).total || 0;
    const totalCreditSales = db.prepare('SELECT SUM(total_amount) as total FROM credit_sales WHERE shift_id = ?').get(shift.id).total || 0;

    // Fuel sales quantities
    const agoLiters = agoEnd - agoMeter.start_meter;
    const dpkLiters = dpkEnd - dpkMeter.start_meter;
    const petrolLiters = petrolEnd - petrolMeter.start_meter;

    // Revenue calculations
    const agoRevenue = agoLiters * agoMeter.unit_price;
    const dpkRevenue = dpkLiters * dpkMeter.unit_price;
    const petrolRevenue = petrolLiters * petrolMeter.unit_price;
    const totalRevenue = agoRevenue + dpkRevenue + petrolRevenue;

    // Expected cash calculation
    const expectedCash = totalRevenue - totalCreditSales - totalExpenses - posActual + shift.opening_float;
    const variance = cashActual - expectedCash;

    // Close Shift transaction
    const closeShiftTx = db.transaction(() => {
      // Update ending meters
      db.prepare('UPDATE shift_meters SET end_meter = ? WHERE shift_id = ? AND fuel_type = ?')
        .run(agoEnd, shift.id, 'ago');
      db.prepare('UPDATE shift_meters SET end_meter = ? WHERE shift_id = ? AND fuel_type = ?')
        .run(dpkEnd, shift.id, 'dpk');
      db.prepare('UPDATE shift_meters SET end_meter = ? WHERE shift_id = ? AND fuel_type = ?')
        .run(petrolEnd, shift.id, 'petrol');

      // Update shift header with actual physical cash and actual POS sales
      db.prepare(`
        UPDATE shifts
        SET status = 'closed', closed_at = datetime('now'), closing_cash_actual = ?, closing_pos_actual = ?
        WHERE id = ?
      `).run(cashActual, posActual, shift.id);
    });

    closeShiftTx();

    res.json({
      message: 'Shift closed successfully.',
      reconciliation: {
        agoLiters,
        agoRevenue,
        dpkLiters,
        dpkRevenue,
        petrolLiters,
        petrolRevenue,
        totalRevenue,
        totalExpenses,
        totalCreditSales,
        openingFloat: shift.opening_float,
        expectedCash,
        actualCashCollected: cashActual,
        actualPosCollected: posActual,
        variance
      }
    });

  } catch (err) {
    console.error('Error closing shift:', err);
    res.status(500).json({ error: 'Failed to close shift and calculate reconciliation.' });
  }
});

// ==========================================
// ACCOUNTANT & BOSS ENDPOINTS
// ==========================================

// GET /api/shifts - Fetch all shifts with filter options (Accountant & Boss only)
router.get('/', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const { status } = req.query;
  try {
    let query = `
      SELECT s.*, u.full_name as attendant_name, u2.full_name as reconciled_by_name
      FROM shifts s
      JOIN users u ON s.attendant_id = u.id
      LEFT JOIN users u2 ON s.reconciled_by = u2.id
    `;
    const params = [];

    if (status) {
      query += ` WHERE s.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY s.opened_at DESC`;

    const shifts = db.prepare(query).all(params);

    // Enrich each shift with detail tallies (meters, expenses, credit sales)
    const enrichedShifts = shifts.map(shift => {
      const meters = db.prepare('SELECT * FROM shift_meters WHERE shift_id = ?').all(shift.id);
      const expenses = db.prepare('SELECT * FROM shift_expenses WHERE shift_id = ?').all(shift.id);
      const creditSales = db.prepare(`
        SELECT cs.*, cc.name as customer_name
        FROM credit_sales cs
        JOIN credit_customers cc ON cs.customer_id = cc.id
        WHERE cs.shift_id = ?
      `).all(shift.id);

      // Perform calculations
      const agoMeter = meters.find(m => m.fuel_type === 'ago');
      const dpkMeter = meters.find(m => m.fuel_type === 'dpk');
      const petrolMeter = meters.find(m => m.fuel_type === 'petrol');

      const agoLiters = agoMeter && agoMeter.end_meter !== null ? (agoMeter.end_meter - agoMeter.start_meter) : 0;
      const dpkLiters = dpkMeter && dpkMeter.end_meter !== null ? (dpkMeter.end_meter - dpkMeter.start_meter) : 0;
      const petrolLiters = petrolMeter && petrolMeter.end_meter !== null ? (petrolMeter.end_meter - petrolMeter.start_meter) : 0;

      const agoRevenue = agoMeter ? (agoLiters * agoMeter.unit_price) : 0;
      const dpkRevenue = dpkMeter ? (dpkLiters * dpkMeter.unit_price) : 0;
      const petrolRevenue = petrolMeter ? (petrolLiters * petrolMeter.unit_price) : 0;
      const totalRevenue = agoRevenue + dpkRevenue + petrolRevenue;

      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
      const totalCreditSales = creditSales.reduce((sum, c) => sum + c.total_amount, 0);

      // expectedCash uses POS deduction
      const expectedCash = totalRevenue - totalCreditSales - totalExpenses - shift.closing_pos_actual + shift.opening_float;
      const variance = shift.status === 'open' ? 0 : (shift.closing_cash_actual - expectedCash);

      return {
        ...shift,
        meters,
        expenses,
        creditSales,
        calculations: {
          agoLiters,
          agoRevenue,
          dpkLiters,
          dpkRevenue,
          petrolLiters,
          petrolRevenue,
          totalRevenue,
          totalExpenses,
          totalCreditSales,
          expectedCash,
          variance
        }
      };
    });

    res.json(enrichedShifts);
  } catch (err) {
    console.error('Error fetching shifts list:', err);
    res.status(500).json({ error: 'Failed to retrieve shifts list.' });
  }
});

// POST /api/shifts/:id/approve - Reconcile/Approve a closed shift (Accountant & Boss only)
router.post('/:id/approve', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const shiftId = parseInt(req.params.id);
  const { notes } = req.body;

  if (isNaN(shiftId)) {
    return res.status(400).json({ error: 'Invalid shift ID.' });
  }

  try {
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found.' });
    }

    if (shift.status !== 'closed') {
      return res.status(400).json({ error: `Only closed shifts can be approved. Current status: ${shift.status}` });
    }

    db.prepare(`
      UPDATE shifts
      SET status = 'approved', reconciled_at = datetime('now'), reconciled_by = ?, reconciliation_notes = ?
      WHERE id = ?
    `).run(req.user.id, notes || null, shiftId);

    res.json({ message: 'Shift approved and reconciled successfully.' });
  } catch (err) {
    console.error('Error approving shift:', err);
    res.status(500).json({ error: 'Failed to approve shift.' });
  }
});

// GET /api/shifts/analytics - Financial summary of approved and closed shifts (Accountant & Boss only)
router.get('/analytics', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  try {
    const closedApprovedShifts = db.prepare(`
      SELECT s.* FROM shifts s WHERE s.status IN ('closed', 'approved')
    `).all();

    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalCreditSales = 0;
    let totalCashCollected = 0;
    let totalPosCollected = 0;
    let totalVariance = 0;
    let totalAgoLiters = 0;
    let totalDpkLiters = 0;
    let totalPetrolLiters = 0;

    closedApprovedShifts.forEach(shift => {
      const meters = db.prepare('SELECT * FROM shift_meters WHERE shift_id = ?').all(shift.id);
      const expenses = db.prepare('SELECT * FROM shift_expenses WHERE shift_id = ?').all(shift.id);
      const creditSales = db.prepare('SELECT * FROM credit_sales WHERE shift_id = ?').all(shift.id);

      const agoMeter = meters.find(m => m.fuel_type === 'ago');
      const dpkMeter = meters.find(m => m.fuel_type === 'dpk');
      const petrolMeter = meters.find(m => m.fuel_type === 'petrol');

      const aLiters = agoMeter && agoMeter.end_meter !== null ? (agoMeter.end_meter - agoMeter.start_meter) : 0;
      const dLiters = dpkMeter && dpkMeter.end_meter !== null ? (dpkMeter.end_meter - dpkMeter.start_meter) : 0;
      const pLiters = petrolMeter && petrolMeter.end_meter !== null ? (petrolMeter.end_meter - petrolMeter.start_meter) : 0;

      const aRevenue = agoMeter ? (aLiters * agoMeter.unit_price) : 0;
      const dRevenue = dpkMeter ? (dLiters * dpkMeter.unit_price) : 0;
      const pRevenue = petrolMeter ? (pLiters * petrolMeter.unit_price) : 0;

      const tRev = aRevenue + dRevenue + pRevenue;
      const tExp = expenses.reduce((sum, e) => sum + e.amount, 0);
      const tCredit = creditSales.reduce((sum, c) => sum + c.total_amount, 0);

      const expectedCash = tRev - tCredit - tExp - shift.closing_pos_actual + shift.opening_float;
      const variance = shift.closing_cash_actual - expectedCash;

      totalRevenue += tRev;
      totalExpenses += tExp;
      totalCreditSales += tCredit;
      totalCashCollected += shift.closing_cash_actual;
      totalPosCollected += shift.closing_pos_actual;
      totalVariance += variance;
      totalAgoLiters += aLiters;
      totalDpkLiters += dLiters;
      totalPetrolLiters += pLiters;
    });

    // Expenses categorized tally
    const expenseTally = db.prepare(`
      SELECT category, SUM(amount) as amount
      FROM shift_expenses
      GROUP BY category
    `).all();

    // Credit clients tally
    const creditTally = db.prepare(`
      SELECT cc.name, SUM(cs.total_amount) as amount
      FROM credit_sales cs
      JOIN credit_customers cc ON cs.customer_id = cc.id
      GROUP BY cc.name
    `).all();

    res.json({
      summary: {
        totalRevenue,
        totalExpenses,
        totalCreditSales,
        totalCashCollected,
        totalPosCollected,
        totalVariance,
        totalAgoLiters,
        totalDpkLiters,
        totalPetrolLiters,
        netCashFlow: totalCashCollected - totalExpenses
      },
      expenseTally,
      creditTally
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to retrieve analytics summaries.' });
  }
});

module.exports = router;
