# Quick Start Guide

## What Changed?

Your app has been converted from Deno/Base44 to Node.js/Express for Railway deployment. This gives you:

- ✅ No timeout limits for batch jobs
- ✅ Built-in scheduler for recurring tasks
- ✅ Better control over background workers
- ✅ Standard Node.js ecosystem

## File Structure

```
.
├── server/                      # New Express backend
│   ├── index.js                # Main server file
│   ├── db/
│   │   ├── client.js           # Database connection
│   │   └── schema.js           # Database schema
│   ├── routes/
│   │   ├── instances.js        # Instance CRUD routes
│   │   └── jobs.js             # Jobs routes
│   ├── middleware/
│   │   └── auth.js             # Authentication middleware
│   └── workers/
│       └── scheduler.js        # Batch job scheduler
├── src/                         # React frontend (unchanged)
│   └── api/
│       └── client.js           # New API client for Express backend
├── functions/                   # Old Deno functions (keep for reference)
├── railway.json                 # Railway config
├── .env.example                 # Environment variables template
└── RAILWAY_DEPLOYMENT.md        # Deployment guide
```

## Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your DATABASE_URL
   ```

3. **Run the app**
   ```bash
   # Run both frontend and backend
   npm run dev:all

   # Or run separately:
   npm run dev          # Frontend only (port 5173)
   npm run dev:server   # Backend only (port 3000)
   ```

4. **Test the API**
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/api/instances
   ```

## Deploy to Railway

### Quick Deploy

1. Push to GitHub:
   ```bash
   git add .
   git commit -m "Convert to Node.js/Express for Railway"
   git push origin main
   ```

2. Go to [Railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub"
4. Select your repo
5. Add environment variable: `DATABASE_URL` (from NeonDB)
6. Deploy!

### Detailed Instructions

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for complete deployment guide.

## API Changes

### Old (Base44 Functions)
```javascript
import { instancesApi } from '@/components/utils/neonClient';
```

### New (Express API)
```javascript
import { instancesApi } from '@/api/client';
```

The API interface is the same, so your frontend code should work without changes!

## Environment Variables

### Required
- `DATABASE_URL` - Your NeonDB connection string

### Optional
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `ENABLE_SCHEDULER` - Enable batch job scheduler (default: true)
- `VITE_API_URL` - API URL for frontend (auto-detected in dev)

## Authentication

⚠️ **Important:** The current auth is a placeholder!

Update `server/middleware/auth.js` with your real authentication:
- JWT tokens
- Passport.js
- Auth0, Clerk, Supabase, etc.

## Batch Jobs

The scheduler runs every minute and checks for instances that need processing.

Configure in `server/workers/scheduler.js`:
- Change cron schedule
- Add custom job logic
- Integrate with Zilliz/OpenAI

## Next Steps

1. ✅ Test locally
2. ✅ Deploy to Railway
3. 🔲 Add real authentication
4. 🔲 Implement batch job logic
5. 🔲 Update frontend to use new API client

## Troubleshooting

### Can't connect to database
- Check `DATABASE_URL` is set correctly
- Verify NeonDB is not paused

### Frontend can't reach API
- Check `VITE_API_URL` environment variable
- Verify CORS is enabled (it is by default)

### Batch jobs not running
- Check logs for scheduler startup message
- Verify `ENABLE_SCHEDULER` is not set to 'false'

## Support

Need help? Check:
- [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) - Full deployment guide
- [Railway Docs](https://docs.railway.app)
- [Express Docs](https://expressjs.com)
