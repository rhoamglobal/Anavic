const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, requireAuth, requireAnyRole } = require('../middleware');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// GET /api/auth/me - Verify current token and return user details
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/register - Register a new user (Accountant & Boss only)
router.post('/register', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const { username, password, role, full_name } = req.body;

  if (!username || !password || !role || !full_name) {
    return res.status(400).json({ error: 'Username, password, role, and full name are required.' });
  }

  if (role !== 'attendant' && role !== 'accountant' && role !== 'boss') {
    return res.status(400).json({ error: 'Invalid role. Must be attendant, accountant, or boss.' });
  }

  try {
    // Check duplicate username
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const result = db.prepare(`
      INSERT INTO users (username, password, role, full_name)
      VALUES (?, ?, ?, ?)
    `).run(username, hashedPassword, role, full_name);

    res.status(201).json({
      message: 'User registered successfully.',
      userId: result.lastInsertRowid,
      user: {
        username,
        role,
        fullName: full_name
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create user account.' });
  }
});

module.exports = router;
