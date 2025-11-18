// Authentication middleware
// TODO: Replace with your preferred authentication system (JWT, Passport, etc.)

export function requireAuth(req, res, next) {
  // Placeholder authentication
  // In production, validate JWT token, session, or API key here

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized - No authorization header' });
  }

  // For now, accept any bearer token and extract user info
  // TODO: Validate the token properly
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }

  // Mock user object - replace with real user validation
  req.user = {
    email: 'user@example.com',
    role: 'user',
    id: 'user-id'
  };

  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}
