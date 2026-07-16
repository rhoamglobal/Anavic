const request = require('supertest');
const { app } = require('../server/app');
const db = require('../server/db');

describe('Tanks Inventory & Prices Management', () => {
  let accountantToken;

  beforeAll(async () => {
    // Clean tank logs
    db.prepare("DELETE FROM tank_inventory").run();

    // Login as accountant
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'accountant', password: 'accountant123' });
    accountantToken = loginRes.body.token;
  });

  it('should get current fuel prices', async () => {
    const res = await request(app)
      .get('/api/tanks/prices')
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should update fuel price successfully', async () => {
    const res = await request(app)
      .post('/api/tanks/prices')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fuel_type: 'petrol',
        price_per_liter: 1000.00
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.price_per_liter).toBe(1000.00);

    // Verify in db
    const priceCheck = db.prepare("SELECT price_per_liter FROM fuel_prices WHERE fuel_type = 'petrol'").get();
    expect(priceCheck.price_per_liter).toBe(1000.00);
  });

  it('should record daily tank inventory dip and deliveries successfully across three products', async () => {
    const today = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/tanks')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        date: today,
        ago_start_dip: 50000.0,
        ago_end_dip: 48000.0,
        ago_delivery: 0.0,
        dpk_start_dip: 30000.0,
        dpk_end_dip: 29500.0,
        dpk_delivery: 0.0,
        petrol_start_dip: 80000.0,
        petrol_end_dip: 128000.0,
        petrol_delivery: 50000.0
      });

    expect(res.statusCode).toBe(201);
  });

  it('should query tank logs and return calculated variance across three products', async () => {
    const res = await request(app)
      .get('/api/tanks')
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);

    const log = res.body[0];
    expect(log.ago_start_dip).toBe(50000.0);
    expect(log.ago_end_dip).toBe(48000.0);
    expect(log.petrol_delivery).toBe(50000.0);

    // Check variance fields are calculated
    expect(log).toHaveProperty('ago_variance');
    expect(log).toHaveProperty('dpk_variance');
    expect(log).toHaveProperty('petrol_variance');
  });

  it('should return live stock status reflecting real-time sales correctly across three products', async () => {
    const res = await request(app)
      .get('/api/tanks/status')
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('ago');
    expect(res.body).toHaveProperty('dpk');
    expect(res.body).toHaveProperty('petrol');
    expect(res.body.ago.live_estimated_stock).toBeDefined();
    expect(res.body.dpk.live_estimated_stock).toBeDefined();
    expect(res.body.petrol.live_estimated_stock).toBeDefined();
  });
});
