const request = require('supertest');
const { app } = require('../server/app');
const { resetAndSeed } = require('../server/db');

describe('Authentication API', () => {
  beforeAll(() => {
    resetAndSeed();
  });

  it('should fail login with incorrect credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'attendant', password: 'wrongpassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should successfully log in with correct attendant credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'attendant', password: 'attendant123' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('username', 'attendant');
    expect(res.body.user).toHaveProperty('role', 'attendant');
  });

  it('should successfully log in with correct accountant credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'accountant', password: 'accountant123' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('username', 'accountant');
    expect(res.body.user).toHaveProperty('role', 'accountant');
  });

  it('should reject access to protected endpoint without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });

  it('should grant access to protected endpoint with valid token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'attendant', password: 'attendant123' });

    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.statusCode).toBe(200);
    expect(meRes.body.user).toHaveProperty('username', 'attendant');
  });

  it('should allow accountant/boss to register a new user', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'accountant', password: 'accountant123' });
    const accountantToken = loginRes.body.token;

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        username: 'new_attendant',
        password: 'password123',
        role: 'attendant',
        full_name: 'David New'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.user.username).toBe('new_attendant');
  });

  it('should reject registration with duplicate username', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'accountant', password: 'accountant123' });
    const accountantToken = loginRes.body.token;

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        username: 'new_attendant',
        password: 'password123',
        role: 'attendant',
        full_name: 'David New Duplicate'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('already taken');
  });

  it('should prevent standard attendants from registering new users', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'attendant', password: 'attendant123' });
    const attendantToken = loginRes.body.token;

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        username: 'malicious_user',
        password: 'password123',
        role: 'attendant',
        full_name: 'Malicious Attendant'
      });

    expect(res.statusCode).toBe(403);
  });
});
