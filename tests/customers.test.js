const request = require('supertest');
const { app } = require('../server/app');
const db = require('../server/db');

describe('Corporate Credit Ledgers & Accountant Operations', () => {
  let bossToken;
  let customerId;

  beforeAll(async () => {
    // Clean tables for perfect test runs
    db.prepare("DELETE FROM customer_payments").run();
    db.prepare("DELETE FROM credit_sales").run();
    db.prepare("DELETE FROM credit_customers").run();

    // Login as boss
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'boss', password: 'boss123' });
    bossToken = loginRes.body.token;
  });

  it('should successfully create a new credit customer', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({
        name: 'Globex Corp',
        custom_ago_price: 1045.0,
        custom_dpk_price: 980.0,
        credit_limit: 800000.00
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('customerId');
    customerId = res.body.customerId;
  });

  it('should prevent creating customer with duplicate name', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${bossToken}`)
      .send({
        name: 'Globex Corp',
        custom_ago_price: 1050.0,
        credit_limit: 500000.00
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('already exists');
  });

  it('should fetch all credit customers', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${bossToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const globex = res.body.find(c => c.name === 'Globex Corp');
    expect(globex).toBeDefined();
    expect(globex.custom_ago_price).toBe(1045.0);
    expect(globex.custom_dpk_price).toBe(980.0);
  });

  it('should log a credit purchase, record a payment, and verify the statement ledger details', async () => {
    // 1. Setup an open shift and record a sale to Globex Corp
    const attendantLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'attendant', password: 'attendant123' });
    const attendantToken = attendantLogin.body.token;

    // Open shift
    await request(app)
      .post('/api/shifts/open')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        opening_float: 50.0,
        ago_start_meter: 100.0,
        dpk_start_meter: 300.0,
        petrol_start_meter: 200.0
      });

    // Record credit purchase: 100 Liters of AGO at custom Globex price of 1045.0 = 104,500.00
    const saleRes = await request(app)
      .post('/api/shifts/credit-sale')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        customer_id: customerId,
        fuel_type: 'ago',
        liters: 100.0
      });
    expect(saleRes.statusCode).toBe(201);

    // Verify balance is 104,500.00
    let customerCheck = db.prepare("SELECT balance FROM credit_customers WHERE id = ?").get(customerId);
    expect(customerCheck.balance).toBe(104500.00);

    // 2. Record payment of 100,000.00 from Globex Corp by Accountant
    const accLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'accountant', password: 'accountant123' });
    const accountantToken = accLoginRes.body.token;

    const paymentRes = await request(app)
      .post(`/api/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        amount: 100000.00,
        payment_method: 'Bank Transfer',
        reference_no: 'TXN-998811'
      });
    expect(paymentRes.statusCode).toBe(201);
    expect(paymentRes.body.newBalance).toBe(4500.00);

    // 3. Retrieve and inspect the ledger
    const ledgerRes = await request(app)
      .get(`/api/customers/${customerId}/ledger`)
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(ledgerRes.statusCode).toBe(200);
    expect(ledgerRes.body.customer.balance).toBe(4500.00);
    expect(ledgerRes.body.ledger.length).toBe(2);

    // The ledger is sorted newest first (reverse order)
    const paymentRow = ledgerRes.body.ledger[0];
    const purchaseRow = ledgerRes.body.ledger[1];

    expect(paymentRow.type).toBe('payment');
    expect(paymentRow.amount).toBe(100000.00);
    expect(paymentRow.runningBalance).toBe(4500.00);

    expect(purchaseRow.type).toBe('purchase');
    expect(purchaseRow.amount).toBe(104500.00);
    expect(purchaseRow.runningBalance).toBe(104500.00);
  });
});
