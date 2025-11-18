import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

export function configurePassport() {
  // Serialize user into session
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  // Deserialize user from session
  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  // Configure Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
      },
      (accessToken, refreshToken, profile, done) => {
        // Extract email from profile
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

        // Check if email ends with @adaptive.co.uk
        if (!email || !email.endsWith('@adaptive.co.uk')) {
          return done(null, false, {
            message: 'Access denied. Only @adaptive.co.uk email addresses are allowed.'
          });
        }

        // Create user object
        const user = {
          id: profile.id,
          email: email,
          name: profile.displayName,
          picture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
        };

        return done(null, user);
      }
    )
  );
}

export default passport;
