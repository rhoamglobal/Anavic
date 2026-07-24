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

  if (fuel_type !== 'ago' && fuel_type !== 'dpk' && fuel_type !== 'petrol') {
    return res.status(400).json({ error: 'Invalid fuel type. Must be ago, dpk, or petrol.' });
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

// GET /api/tanks/status - Fetch live stock estimation in real-time for three products
router.get('/status', requireAuth, (req, res) => {
  try {
    // Get the latest recorded dip level
    const latestDip = db.prepare(`
      SELECT * FROM tank_inventory
      ORDER BY date DESC, created_at DESC
      LIMIT 1
    `).get();

    let agoBase = 30000.0;
    let dpkBase = 20000.0;
    let petrolBase = 25000.0;
    let baseDate = '1970-01-01';
    let baseTimestamp = '1970-01-01 00:00:00';
    let lastRecordedDate = 'None';

    if (latestDip) {
      agoBase = latestDip.ago_end_dip;
      dpkBase = latestDip.dpk_end_dip;
      petrolBase = latestDip.petrol_end_dip;
      baseDate = latestDip.date;
      baseTimestamp = latestDip.created_at;
      lastRecordedDate = latestDip.date;
    }

    // Sum all liters sold across closed/approved shifts opened after the last dip timestamp
    const sales = db.prepare(`
      SELECT
        SUM(CASE WHEN sm.fuel_type = 'ago' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as ago_sold,
        SUM(CASE WHEN sm.fuel_type = 'dpk' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as dpk_sold,
        SUM(CASE WHEN sm.fuel_type = 'petrol' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as petrol_sold
      FROM shift_meters sm
      JOIN shifts s ON sm.shift_id = s.id
      WHERE s.status IN ('closed', 'approved')
        AND (s.opened_at > ? OR strftime('%Y-%m-%d', s.opened_at, 'localtime') > ?)
    `).get(baseTimestamp, baseDate);

    const agoSoldSince = sales?.ago_sold || 0;
    const dpkSoldSince = sales?.dpk_sold || 0;
    const petrolSoldSince = sales?.petrol_sold || 0;

    // Calculate live estimations
    const agoLive = Math.max(0, agoBase - agoSoldSince);
    const dpkLive = Math.max(0, dpkBase - dpkSoldSince);
    const petrolLive = Math.max(0, petrolBase - petrolSoldSince);

    res.json({
      ago: {
        last_physical_dip: agoBase,
        sold_since_last_dip: agoSoldSince,
        live_estimated_stock: agoLive
      },
      dpk: {
        last_physical_dip: dpkBase,
        sold_since_last_dip: dpkSoldSince,
        live_estimated_stock: dpkLive
      },
      petrol: {
        last_physical_dip: petrolBase,
        sold_since_last_dip: petrolSoldSince,
        live_estimated_stock: petrolLive
      },
      last_physical_date: lastRecordedDate
    });
  } catch (err) {
    console.error('Error calculating live tank status:', err);
    res.status(500).json({ error: 'Failed to calculate real-time wet stock tank levels.' });
  }
});

// GET /api/tanks - Get historical tank inventory and wet stock reconciliation reports for three products
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
      // Find total liters sold on this date from shift meters using local timezone
      const salesQuery = db.prepare(`
        SELECT
          SUM(CASE WHEN sm.fuel_type = 'ago' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as ago_sold,
          SUM(CASE WHEN sm.fuel_type = 'dpk' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as dpk_sold,
          SUM(CASE WHEN sm.fuel_type = 'petrol' THEN (sm.end_meter - sm.start_meter) ELSE 0 END) as petrol_sold
        FROM shift_meters sm
        JOIN shifts s ON sm.shift_id = s.id
        WHERE strftime('%Y-%m-%d', s.opened_at, 'localtime') = ? AND s.status IN ('closed', 'approved')
      `).get(dip.date);

      const agoSold = salesQuery?.ago_sold || 0;
      const dpkSold = salesQuery?.dpk_sold || 0;
      const petrolSold = salesQuery?.petrol_sold || 0;

      // Expected Ending = Starting + Delivery - Sold
      const agoExpected = dip.ago_start_dip + dip.ago_delivery - agoSold;
      const dpkExpected = dip.dpk_start_dip + dip.dpk_delivery - dpkSold;
      const petrolExpected = dip.petrol_start_dip + dip.petrol_delivery - petrolSold;

      // Variance = Ending - Expected
      const agoVariance = dip.ago_end_dip - agoExpected;
      const dpkVariance = dip.dpk_end_dip - dpkExpected;
      const petrolVariance = dip.petrol_end_dip - petrolExpected;

      return {
        ...dip,
        ago_sold: agoSold,
        ago_expected: agoExpected,
        ago_variance: agoVariance,
        dpk_sold: dpkSold,
        dpk_expected: dpkExpected,
        dpk_variance: dpkVariance,
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
    ago_start_dip,
    ago_end_dip,
    ago_delivery,
    dpk_start_dip,
    dpk_end_dip,
    dpk_delivery,
    petrol_start_dip,
    petrol_end_dip,
    petrol_delivery
  } = req.body;

  if (!date || ago_start_dip === undefined || ago_end_dip === undefined || dpk_start_dip === undefined || dpk_end_dip === undefined || petrol_start_dip === undefined || petrol_end_dip === undefined) {
    return res.status(400).json({ error: 'Date and dip values are required for all three products.' });
  }

  const aStart = parseFloat(ago_start_dip);
  const aEnd = parseFloat(ago_end_dip);
  const aDeliv = parseFloat(ago_delivery || 0);
  const dStart = parseFloat(dpk_start_dip);
  const dEnd = parseFloat(dpk_end_dip);
  const dDeliv = parseFloat(dpk_delivery || 0);
  const pStart = parseFloat(petrol_start_dip);
  const pEnd = parseFloat(petrol_end_dip);
  const pDeliv = parseFloat(petrol_delivery || 0);

  if (isNaN(aStart) || isNaN(aEnd) || isNaN(aDeliv) || isNaN(dStart) || isNaN(dEnd) || isNaN(dDeliv) || isNaN(pStart) || isNaN(pEnd) || isNaN(pDeliv)) {
    return res.status(400).json({ error: 'All quantities and dips must be valid numbers.' });
  }

  try {
    db.prepare(`
      INSERT INTO tank_inventory (
        date, ago_start_dip, ago_end_dip, ago_delivery,
        dpk_start_dip, dpk_end_dip, dpk_delivery,
        petrol_start_dip, petrol_end_dip, petrol_delivery, recorded_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        ago_start_dip = excluded.ago_start_dip,
        ago_end_dip = excluded.ago_end_dip,
        ago_delivery = excluded.ago_delivery,
        dpk_start_dip = excluded.dpk_start_dip,
        dpk_end_dip = excluded.dpk_end_dip,
        dpk_delivery = excluded.dpk_delivery,
        petrol_start_dip = excluded.petrol_start_dip,
        petrol_end_dip = excluded.petrol_end_dip,
        petrol_delivery = excluded.petrol_delivery,
        recorded_by = excluded.recorded_by,
        created_at = datetime('now')
    `).run(date, aStart, aEnd, aDeliv, dStart, dEnd, dDeliv, pStart, pEnd, pDeliv, req.user.id);

    res.status(201).json({ message: 'Tank dip and delivery log recorded successfully.' });
  } catch (err) {
    console.error('Error inserting tank log:', err);
    res.status(500).json({ error: 'Failed to record tank inventory dip.' });
  }
});

module.exports = router;
