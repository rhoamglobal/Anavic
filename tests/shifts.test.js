const request = require('supertest');
const { app } = require('../server/app');
const db = require('../server/db');
const { resetAndSeed } = require('../server/db');

describe('Pump Attendant Shift Operations', () => {
  let attendantToken;

  beforeEach(async () => {
    // Completely isolate tests by resetting database state
    resetAndSeed();

    // Login as attendant
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'attendant', password: 'attendant123' });
    attendantToken = loginRes.body.token;
  });

  it('should initially return active: false', async () => {
    const res = await request(app)
      .get('/api/shifts/active')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it('should open a new shift with standard prices successfully', async () => {
    const res = await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('shiftId');
  });

  it('should open a new shift with CUSTOM attendant prices successfully', async () => {
    const res = await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0,
        ago_price: 1200.0,
        dpk_price: 1050.0,
        petrol_price: 1000.0
      });

    expect(res.statusCode).toBe(201);
    const shiftId = res.body.shiftId;

    // Check custom prices are stored on shift_meters
    const meters = db.prepare("SELECT * FROM shift_meters WHERE shift_id = ?").all(shiftId);
    const agoM = meters.find(m => m.fuel_type === 'ago');
    const dpkM = meters.find(m => m.fuel_type === 'dpk');
    const petrolM = meters.find(m => m.fuel_type === 'petrol');

    expect(agoM.unit_price).toBe(1200.0);
    expect(dpkM.unit_price).toBe(1050.0);
    expect(petrolM.unit_price).toBe(1000.0);
  });

  it('should fail to open a second concurrent shift', async () => {
    // Open first
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0
      });

    const res = await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 50.0,
        ago_start_meter: 1010.0,
        dpk_start_meter: 3010.0,
        petrol_start_meter: 5020.0
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('already have an open shift');
  });

  it('should log, edit, and delete shift expenses successfully', async () => {
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0
      });

    // 1. Log expense
    const res = await request(app)
      .post('/api/shifts/expense')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        amount: 25.50,
        category: 'Generator Fuel',
        description: 'AGO for emergency generator'
      });

    expect(res.statusCode).toBe(201);

    const logged = db.prepare("SELECT * FROM shift_expenses").get();
    expect(logged).toBeDefined();

    // 2. Edit expense
    const editRes = await request(app)
      .put(`/api/shifts/expense/${logged.id}`)
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        amount: 50.00,
        category: 'Cleaning',
        description: 'Corrected detergent purchase'
      });

    expect(editRes.statusCode).toBe(200);
    const updated = db.prepare("SELECT * FROM shift_expenses WHERE id = ?").get(logged.id);
    expect(updated.amount).toBe(50.00);
    expect(updated.category).toBe('Cleaning');

    // 3. Delete expense
    const delRes = await request(app)
      .delete(`/api/shifts/expense/${logged.id}`)
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(delRes.statusCode).toBe(200);
    const finalCheck = db.prepare("SELECT * FROM shift_expenses WHERE id = ?").get(logged.id);
    expect(finalCheck).toBeUndefined();
  });

  it('should log a credit sale successfully with AGO custom price rules', async () => {
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0
      });

    const customer = db.prepare("SELECT * FROM credit_customers WHERE name = 'Swift Logistics'").get();

    const res = await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customer.id,
        fuel_type: 'ago',
        liters: 100.0
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.totalAmount).toBe(105000.0); // 100 liters * 1050.00 custom AGO pricing rule
  });

  it('should block corporate credit sales if the customer is INACTIVE', async () => {
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0
      });

    const customer = db.prepare("SELECT * FROM credit_customers WHERE name = 'Swift Logistics'").get();

    // Set customer status to inactive
    db.prepare("UPDATE credit_customers SET status = 'inactive' WHERE id = ?").run(customer.id);

    const res = await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customer.id,
        fuel_type: 'ago',
        liters: 100.0
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('is currently INACTIVE');
  });

  it('should close shift, record POS actual card transactions, and calculate expected cash correctly across three products', async () => {
    // Open shift with standard prices: AGO = 1100, DPK = 1000, Petrol = 950
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        ago_start_meter: 1000.0,
        dpk_start_meter: 3000.0,
        petrol_start_meter: 5000.0
      });

    // Log Expense
    await request(app)
      .post('/api/shifts/expense')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        amount: 25.50,
        category: 'Generator Fuel',
        description: 'Diesel for emergency generator'
      });

    // Log Credit Sale to corporate customer
    const customer = db.prepare("SELECT * FROM credit_customers WHERE name = 'Swift Logistics'").get();
    await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customer.id,
        fuel_type: 'ago',
        liters: 100.0 // Custom AGO Price 1050 = 105,000.00
      });

    // Readings submitted:
    // AGO: 1200 (200L sold @ 1100 = 220,000)
    // DPK: 3100 (100L sold @ 1000 = 100,000)
    // Petrol: 5100 (100L sold @ 950 = 95,000)
    // Total Nozzle Revenue = 415,000
    // Expenses = 25.50
    // Credit Sales = 105,000 (100L @ 1050 custom AGO price)
    // Corporate Price Discount = 5,000 (100L @ (1100 standard - 1050 custom))
    // POS Card Sales submitted = 50,000
    // Opening Float = 100
    // Expected Cash = Nozzle Revenue (415000) - Expenses (25.50) - Credit (105000) - Corporate Discount (5000) - POS (50000) + Float (100) = 255074.50

    const res = await request(app)
      .post('/api/shifts/close')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        ago_end_meter: 1200.0,
        dpk_end_meter: 3100.0,
        petrol_end_meter: 5100.0,
        closing_cash_actual: 150000.00,
        closing_pos_actual: 50000.00
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.reconciliation.agoLiters).toBe(200.0); // 1200 - 1000 = 200
    expect(res.body.reconciliation.totalRevenue).toBe(415000.00);
    expect(res.body.reconciliation.expectedCash).toBe(255074.50);
  });
});
