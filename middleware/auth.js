const jwt = require('jsonwebtoken');

// Protect any route — requires valid JWT
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized. No token.' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired.' });
  }
};

// Admin only
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access only.' });
  }
  next();
};

// Agent only
const agentOnly = (req, res, next) => {
  if (req.user?.role !== 'agent') {
    return res.status(403).json({ message: 'Agent access only.' });
  }
  next();
};

module.exports = { protect, adminOnly, agentOnly };
