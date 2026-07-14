const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gas_station_super_secret_key';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden. Access restricted.' });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  requireAuth,
  requireRole
};
