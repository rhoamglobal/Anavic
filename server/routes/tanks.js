const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole, requireAnyRole } = require('../middleware');

// GET /api/tanks/prices - Get current standard fuel prices
router.get('/prices', requireAuth, (req, res) => {
  try {
    const prices = db.prepare('SELECT * FROM fuel_prices').all();
    res.json(prices);
  } catch (err) {
    console.error('Error fetching prices:', err);
    res.status(500).json({ error: 'Failed to retrieve fuel prices.' });
  }
});

// POST /api/tanks/prices - Update standard fuel prices (Accountant & Boss only)
router.post('/prices', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const { fuel_type, price_per_liter } = req.body;

  if (!fuel_type || price_per_liter === undefined) {
    return res.status(400).json({ error: 'Fuel type and price per liter are required.' });
  }

  if (fuel_type !== 'diesel' && fuel_type !== 'petrol') {
    return res.status(400).json({ error: 'Invalid fuel type. Must be diesel or petrol.' });
  }

  const priceVal = parseFloat(price_per_liter);
  if (isNaN(priceVal) || priceVal <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number.' });
  }

  try {
    db.prepare(`
      INSERT INTO fuel_prices (fuel_type, price_per_liter, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(fuel_type) DO UPDATE SET
        price_per_liter = excluded.price_per_liter,
        updated_at = datetime('now')
    `).run(fuel_type, priceVal);

    res.json({ message: 'Price updated successfully.', fuel_type, price_per_liter: priceVal });
  } catch (err) {
    console.error('Error updating price:', err);
    res.status(500).json({ error: 'Failed to update price.' });
  }
});

// GET /api/tanks - Get historical tank inventory and wet stock reconciliation reports
router.get('/', requireAuth, (req, res) => {
  try {
    const dips = db.prepare(`
      SELECT ti.*, u.full_name as recorded_by_name
      FROM tank_inventory ti
      JOIN users u ON ti.recorded_by = u.id
      ORDER BY ti.date DESC
    `).all();

    // Enrich logs with sales and variance analysis
    const enrichedDips = dips.map(dip => {
      // Find total liters sold on this date from shift meters
      const salesQuery = db.prepare(`
        SELECT
          SUM(CASE WHEN sm.fuel_type = 'diesel' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as diesel_sold,
          SUM(CASE WHEN sm.fuel_type = 'petrol' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as petrol_sold
        FROM shift_meters sm
        JOIN shifts s ON sm.shift_id = s.id
        WHERE strftime('%Y-%m-%d', s.opened_at) = ? AND s.status IN ('closed', 'approved')
      `).get(dip.date);

      const dieselSold = salesQuery?.diesel_sold || 0;
      const petrolSold = salesQuery?.petrol_sold || 0;

      // Expected Ending = Starting + Delivery - Sold
      const dieselExpected = dip.diesel_start_dip + dip.diesel_delivery - dieselSold;
      const petrolExpected = dip.petrol_start_dip + dip.petrol_delivery - petrolSold;

      // Variance = Ending - Expected
      const dieselVariance = dip.diesel_end_dip - dieselExpected;
      const petrolVariance = dip.petrol_end_dip - petrolExpected;

      return {
        ...dip,
        diesel_sold: dieselSold,
        diesel_expected: dieselExpected,
        diesel_variance: dieselVariance,
        petrol_sold: petrolSold,
        petrol_expected: petrolExpected,
        petrol_variance: petrolVariance
      };
    });

    res.json(enrichedDips);
  } catch (err) {
    console.error('Error fetching tank reports:', err);
    res.status(500).json({ error: 'Failed to retrieve tank inventory reports.' });
  }
});

// POST /api/tanks - Record new tank dip levels & supplier deliveries (Accountant & Boss only)
router.post('/', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const {
    date,
    diesel_start_dip,
    diesel_end_dip,
    diesel_delivery,
    petrol_start_dip,
    petrol_end_dip,
    petrol_delivery
  } = req.body;

  if (!date || diesel_start_dip === undefined || diesel_end_dip === undefined || petrol_start_dip === undefined || petrol_end_dip === undefined) {
    return res.status(400).json({ error: 'Date and dip values are required.' });
  }

  const dStart = parseFloat(diesel_start_dip);
  const dEnd = parseFloat(diesel_end_dip);
  const dDeliv = parseFloat(diesel_delivery || 0);
  const pStart = parseFloat(petrol_start_dip);
  const pEnd = parseFloat(petrol_end_dip);
  const pDeliv = parseFloat(petrol_delivery || 0);

  if (isNaN(dStart) || isNaN(dEnd) || isNaN(dDeliv) || isNaN(pStart) || isNaN(pEnd) || isNaN(pDeliv)) {
    return res.status(400).json({ error: 'All quantities and dips must be valid numbers.' });
  }

  try {
    db.prepare(`
      INSERT INTO tank_inventory (
        date, diesel_start_dip, diesel_end_dip, diesel_delivery,
        petrol_start_dip, petrol_end_dip, petrol_delivery, recorded_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        diesel_start_dip = excluded.diesel_start_dip,
        diesel_end_dip = excluded.diesel_end_dip,
        diesel_delivery = excluded.diesel_delivery,
        petrol_start_dip = excluded.petrol_start_dip,
        petrol_end_dip = excluded.petrol_end_dip,
        petrol_delivery = excluded.petrol_delivery,
        recorded_by = excluded.recorded_by,
        created_at = datetime('now')
    `).run(date, dStart, dEnd, dDeliv, pStart, pEnd, pDeliv, req.user.id);

    res.status(201).json({ message: 'Tank dip and delivery log recorded successfully.' });
  } catch (err) {
    console.error('Error inserting tank log:', err);
    res.status(500).json({ error: 'Failed to record tank inventory dip.' });
  }
});

module.exports = router;
