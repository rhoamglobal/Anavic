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
        price_per_liter: 1.95
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.price_per_liter).toBe(1.95);

    // Verify in db
    const priceCheck = db.prepare("SELECT price_per_liter FROM fuel_prices WHERE fuel_type = 'petrol'").get();
    expect(priceCheck.price_per_liter).toBe(1.95);
  });

  it('should record daily tank inventory dip and deliveries successfully', async () => {
    const today = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/tanks')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        date: today,
        diesel_start_dip: 5000.0,
        diesel_end_dip: 4800.0,
        diesel_delivery: 0.0,
        petrol_start_dip: 8000.0,
        petrol_end_dip: 12800.0,
        petrol_delivery: 5000.0
      });

    expect(res.statusCode).toBe(201);
  });

  it('should query tank logs and return calculated variance', async () => {
    const res = await request(app)
      .get('/api/tanks')
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);

    const log = res.body[0];
    expect(log.diesel_start_dip).toBe(5000.0);
    expect(log.diesel_end_dip).toBe(4800.0);
    expect(log.petrol_delivery).toBe(5000.0);

    // Check variance fields are calculated
    expect(log).toHaveProperty('diesel_variance');
    expect(log).toHaveProperty('petrol_variance');
  });
});
