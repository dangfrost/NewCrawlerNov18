// Authentication middleware using Google OAuth via Passport

export function requireAuth(req, res, next) {
  // Check if user is authenticated via Passport session
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Unauthorized - Please sign in with your @adaptive.co.uk Google account',
      requiresAuth: true
    });
  }

  // Verify user has @adaptive.co.uk email
  if (!req.user || !req.user.email || !req.user.email.endsWith('@adaptive.co.uk')) {
    return res.status(403).json({
      error: 'Access denied - Only @adaptive.co.uk email addresses are allowed',
      requiresAuth: true
    });
  }

  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    // For now, all @adaptive.co.uk users are admins
    // You can add role-based access later if needed
    next();
  });
}
