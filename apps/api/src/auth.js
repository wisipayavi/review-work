const jwt = require('jsonwebtoken');
const { hashPassword, hashToken } = require('./db');
const { logAudit } = require('./audit');

const ACCESS_SECRET = process.env.ACCESS_SECRET || 'dev-access-secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'dev-refresh-secret';

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, brandId: user.brand_id, partnerId: user.partner_id },
    ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

function issueRefreshToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, REFRESH_SECRET, { expiresIn: '7d' });
}

function authenticate(db) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    try {
      const decoded = jwt.verify(token, ACCESS_SECRET);
      const user = db
        .prepare('SELECT id, email, role, brand_id, partner_id FROM users WHERE id = ?')
        .get(decoded.sub);
      if (!user) return res.status(401).json({ error: 'User not found' });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function loginHandler(db) {
  return (req, res) => {
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || hashPassword(password || '') !== user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = issueAccessToken(user);
    const refreshToken = issueRefreshToken(user);

    db.prepare(
      `INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
       VALUES (?, ?, datetime('now', '+7 days'))`
    ).run(user.id, hashToken(refreshToken));

    logAudit(db, {
      actorUserId: user.id,
      action: 'AUTH_LOGIN',
      resourceType: 'auth',
      resourceId: String(user.id),
      metadata: { email: user.email }
    });

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, role: user.role, brandId: user.brand_id, partnerId: user.partner_id }
    });
  };
}

function refreshHandler(db) {
  return (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    try {
      const payload = jwt.verify(refreshToken, REFRESH_SECRET);
      const tokenRow = db
        .prepare(
          `SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ?
           AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`
        )
        .get(payload.sub, hashToken(refreshToken));
      if (!tokenRow) return res.status(401).json({ error: 'Refresh token invalid' });

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
      const accessToken = issueAccessToken(user);

      logAudit(db, {
        actorUserId: user.id,
        action: 'AUTH_REFRESH',
        resourceType: 'auth',
        resourceId: String(user.id)
      });

      return res.json({ accessToken });
    } catch {
      return res.status(401).json({ error: 'Refresh token invalid' });
    }
  };
}

module.exports = { authenticate, requireRole, loginHandler, refreshHandler };
