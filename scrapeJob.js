import jwt from 'jsonwebtoken';
import { Users } from '../db/airtable.js';

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    req.userPlan = payload.plan;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function planGuard(...allowedPlans) {
  return (req, res, next) => {
    if (!allowedPlans.includes(req.userPlan)) {
      return res.status(403).json({
        error: 'Upgrade required',
        requiredPlans: allowedPlans,
      });
    }
    next();
  };
}
