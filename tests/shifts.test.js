const request = require('supertest');
const { app } = require('../server/app');
const db = require('../server/db');
const { resetAndSeed } = require('../server/db');

describe('Pump Attendant Shift Operations', () => {
  let attendantToken;
  let activeShiftId;

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
        diesel_start_meter: 1000.0,
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
        diesel_start_meter: 1000.0,
        petrol_start_meter: 5000.0,
        diesel_price: 1200.0, // Custom diesel rate
        petrol_price: 1000.0  // Custom petrol rate
      });

    expect(res.statusCode).toBe(201);
    const shiftId = res.body.shiftId;

    // Check custom prices are stored on shift_meters
    const meters = db.prepare("SELECT * FROM shift_meters WHERE shift_id = ?").all(shiftId);
    const dMeter = meters.find(m => m.fuel_type === 'diesel');
    const pMeter = meters.find(m => m.fuel_type === 'petrol');

    expect(dMeter.unit_price).toBe(1200.0);
    expect(pMeter.unit_price).toBe(1000.0);
  });

  it('should fail to open a second concurrent shift', async () => {
    // Open first
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        diesel_start_meter: 1000.0,
        petrol_start_meter: 5000.0
      });

    const res = await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 50.0,
        diesel_start_meter: 1010.0,
        petrol_start_meter: 5020.0
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('already have an open shift');
  });

  it('should log a petty cash expense successfully', async () => {
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        diesel_start_meter: 1000.0,
        petrol_start_meter: 5000.0
      });

    const res = await request(app)
      .post('/api/shifts/expense')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        amount: 25.50,
        category: 'Generator Fuel',
        description: 'Diesel for emergency generator'
      });

    expect(res.statusCode).toBe(201);
  });

  it('should log a diesel credit sale successfully', async () => {
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        diesel_start_meter: 1000.0,
        petrol_start_meter: 5000.0
      });

    const customer = db.prepare("SELECT * FROM credit_customers WHERE name = 'Swift Logistics'").get();

    const res = await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customer.id,
        fuel_type: 'diesel',
        liters: 100.0
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.totalAmount).toBe(105000.0); // 100 liters * 1050.00 custom rate
  });

  it('should block corporate credit sales if the customer is INACTIVE', async () => {
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        diesel_start_meter: 1000.0,
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
        fuel_type: 'diesel',
        liters: 100.0
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('is currently INACTIVE');
  });

  it('should close shift, record POS actual card transactions, and calculate expected cash correctly', async () => {
    // Open shift with standard prices: Diesel = 1100, Petrol = 950
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 100.0,
        diesel_start_meter: 1000.0,
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

    // Log Credit Sale
    const customer = db.prepare("SELECT * FROM credit_customers WHERE name = 'Swift Logistics'").get();
    await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customer.id,
        fuel_type: 'diesel',
        liters: 100.0 // Custom Price 1050 = 105000.00
      });

    // Readings submitted: Diesel: 1200 (200L sold @ 1100 = 220,000), Petrol: 5100 (100L sold @ 950 = 95,000)
    // Total Revenue = 315,000
    // Expenses = 25.50
    // Credit Sales = 105,000
    // POS Card Sales submitted = 50,000
    // Opening Float = 100
    // Expected Cash = Revenue (315000) - Expenses (25.50) - Credit (105000) - POS (50000) + Float (100) = 160074.50
    // If attendant submits physical cash = 160000.00, variance should be -74.50 (shortage)

    const res = await request(app)
      .post('/api/shifts/close')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        diesel_end_meter: 1200.0,
        petrol_end_meter: 5100.0,
        closing_cash_actual: 160000.00,
        closing_pos_actual: 50000.00
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.reconciliation.dieselLiters).toBe(200.0);
    expect(res.body.reconciliation.totalRevenue).toBe(315000.00);
    expect(res.body.reconciliation.totalExpenses).toBe(25.50);
    expect(res.body.reconciliation.totalCreditSales).toBe(105000.00);
    expect(res.body.reconciliation.expectedCash).toBe(160074.50);
    expect(res.body.reconciliation.actualCashCollected).toBe(160000.00);
    expect(res.body.reconciliation.actualPosCollected).toBe(50000.00);
    expect(res.body.reconciliation.variance).toBe(-74.50);
  });
});
