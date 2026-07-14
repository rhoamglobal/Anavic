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

// GET /api/auth/users - List all users (Accountant & Boss only)
router.get('/users', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, full_name, created_at FROM users ORDER BY full_name ASC').all();
    res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to retrieve staff directory.' });
  }
});

// POST /api/auth/users/:id/password - Change a user's password (Accountant & Boss only)
router.post('/users/:id/password', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const targetUserId = parseInt(req.params.id);
  const { password } = req.body;

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  if (!password || password.trim() === '') {
    return res.status(400).json({ error: 'New password is required.' });
  }

  try {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, targetUserId);

    res.json({ message: 'User password updated successfully.' });
  } catch (err) {
    console.error('Update password error:', err);
    res.status(500).json({ error: 'Failed to update user password.' });
  }
});

// DELETE /api/auth/users/:id - Delete a user's account (Accountant & Boss only)
router.delete('/users/:id', requireAuth, requireAnyRole(['accountant', 'boss']), (req, res) => {
  const targetUserId = parseInt(req.params.id);

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Prevent self-deletion
  if (req.user.id === targetUserId) {
    return res.status(400).json({ error: 'Action denied. You cannot delete your own logged-in account.' });
  }

  try {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Use transaction to ensure shift constraints or other records remain intact
    // (In our SQLite schemas, deletions are clean; shifts keep references but we can check if active shifts are open first)
    const activeShift = db.prepare(`
      SELECT id FROM shifts WHERE attendant_id = ? AND status = 'open'
    `).get(targetUserId);

    if (activeShift) {
      return res.status(400).json({ error: 'Action denied. Attendant has an active open shift. Close the shift before deleting.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);

    res.json({ message: 'User account deleted successfully.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user account.' });
  }
});

module.exports = router;
