import express from 'express';
import passport from 'passport';

const router = express.Router();

// Initiate Google OAuth login
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login-failed',
    failureMessage: true
  }),
  (req, res) => {
    // Successful authentication, redirect to dashboard
    res.redirect('/');
  }
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

// Get current user info
router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

export default router;
