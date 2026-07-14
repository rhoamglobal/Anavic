const request = require('supertest');
const { app } = require('../server/app');
const db = require('../server/db');
const { resetAndSeed } = require('../server/db');

describe('Pump Attendant Shift Operations', () => {
  let attendantToken;
  let activeShiftId;

  beforeAll(async () => {
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

  it('should open a new shift successfully', async () => {
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
    activeShiftId = res.body.shiftId;
  });

  it('should fail to open a second concurrent shift', async () => {
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

  it('should log a diesel credit sale with custom customer discount', async () => {
    // Swift Logistics has custom diesel price of 1050.0 in Naira
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

    // Check that customer balance was updated in database
    const updatedCustomer = db.prepare("SELECT balance FROM credit_customers WHERE id = ?").get(customer.id);
    expect(updatedCustomer.balance).toBe(105000.0);
  });

  it('should reject a credit sale that exceeds the customer credit limit', async () => {
    const customer = db.prepare("SELECT * FROM credit_customers WHERE name = 'Swift Logistics'").get();

    // Limit is 5,000,000. Let's try to add 6,000 liters (6000 * 1050 = 6,300,000 which exceeds limit)
    const res = await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customer.id,
        fuel_type: 'diesel',
        liters: 6000.0
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('limit exceeded');
  });

  it('should close the active shift and reconcile variances correctly', async () => {
    // Starting: Diesel: 1000, Petrol: 5000
    // Ending readings we will submit: Diesel: 1200 (200L sold), Petrol: 5100 (100L sold)
    // Diesel standard price is 1100.0. Petrol is 950.0
    // Expected Diesel Revenue = 200 * 1100 = 220000.00
    // Expected Petrol Revenue = 100 * 950 = 95000.00
    // Total Expected Revenue = 315000.00
    // Credit Sale logged = 105000.00
    // Expense logged = 25.50
    // Opening Float = 100.00
    // Expected Cash in Drawer = Revenue (315000) - Credit (105000) - Expense (25.50) + Float (100) = 210074.50
    // If attendant submits physical cash = 210000.00, variance should be -74.50 (shortage)

    const res = await request(app)
      .post('/api/shifts/close')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        diesel_end_meter: 1200.0,
        petrol_end_meter: 5100.0,
        closing_cash_actual: 210000.00
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.reconciliation.dieselLiters).toBe(200.0);
    expect(res.body.reconciliation.petrolLiters).toBe(100.0);
    expect(res.body.reconciliation.totalRevenue).toBe(315000.00);
    expect(res.body.reconciliation.totalExpenses).toBe(25.50);
    expect(res.body.reconciliation.totalCreditSales).toBe(105000.00);
    expect(res.body.reconciliation.expectedCash).toBe(210074.50);
    expect(res.body.reconciliation.actualCashCollected).toBe(210000.00);
    expect(res.body.reconciliation.variance).toBe(-74.50);

    // Verify shift is closed in the database
    const closedShift = db.prepare("SELECT status FROM shifts WHERE id = ?").get(activeShiftId);
    expect(closedShift.status).toBe('closed');
  });
});
