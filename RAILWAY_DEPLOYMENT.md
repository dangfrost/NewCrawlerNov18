# Railway Deployment Guide

This guide will help you deploy your Zilliz AI Data Flow app to Railway.

## Prerequisites

1. A [Railway](https://railway.app) account
2. A [NeonDB](https://neon.tech) database (or another PostgreSQL database)
3. Your code pushed to GitHub

## Step 1: Set Up Railway Project

1. Go to [Railway](https://railway.app) and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository: `dangfrost/NewCrawlerNov18`

## Step 2: Configure Environment Variables

In your Railway project settings, add the following environment variables:

### Required Variables

```
DATABASE_URL=postgresql://username:password@host:5432/database
NODE_ENV=production
PORT=3000
```

### Optional Variables (for batch jobs)

```
ZILLIZ_ENDPOINT=your-zilliz-endpoint
ZILLIZ_TOKEN=your-zilliz-token
OPENAI_API_KEY=your-openai-key
JWT_SECRET=your-secret-key
```

### Getting your NeonDB Connection String

1. Go to your [Neon Console](https://console.neon.tech/)
2. Select your project
3. Copy the connection string (it will look like: `postgresql://user:pass@host.neon.tech/dbname`)
4. Paste it as the `DATABASE_URL` value in Railway

## Step 3: Deploy

Railway will automatically:
1. Detect your `package.json`
2. Run `npm install && npm run build`
3. Start your server with `npm start`

The deployment should take 2-3 minutes.

## Step 4: Set Up Database Tables

Once deployed, you need to create the database tables. You have two options:

### Option A: Using a migration script (recommended)

Create a migration script in `server/db/migrate.js` and run it manually, or use a tool like Drizzle Kit.

### Option B: Manual SQL

Connect to your NeonDB and run the SQL from the migration files.

## Step 5: Update Frontend API URL

In your Railway deployment, add this environment variable:

```
VITE_API_URL=https://your-app-name.railway.app/api
```

This tells the frontend where to find the backend API.

## Step 6: Test Your Deployment

1. Visit your Railway deployment URL
2. Check the health endpoint: `https://your-app-name.railway.app/health`
3. Test the instances API: `https://your-app-name.railway.app/api/instances`

## Architecture

```
┌─────────────────────────────────────┐
│         Railway Deployment          │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   React Frontend (Vite)      │  │
│  │   Served as static files     │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│  ┌──────────────▼───────────────┐  │
│  │   Express Backend            │  │
│  │   - API Routes               │  │
│  │   - Authentication           │  │
│  │   - Batch Job Workers        │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
└─────────────────┼───────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │   NeonDB       │
         │   (PostgreSQL) │
         └────────────────┘
```

## Local Development

### Install dependencies
```bash
npm install
```

### Set up environment variables
```bash
cp .env.example .env
# Edit .env with your local database URL
```

### Run frontend and backend together
```bash
npm run dev:all
```

Or run them separately:

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run dev:server
```

The frontend will be at `http://localhost:5173` and the backend at `http://localhost:3000`.

## Authentication

The current implementation uses a placeholder authentication system. You'll need to integrate your preferred auth provider:

### Options:
1. **JWT-based auth** - Generate JWT tokens on login
2. **Passport.js** - Supports OAuth, local auth, etc.
3. **Auth0, Clerk, or Supabase Auth** - Third-party providers
4. **Keep Base44** - If you still want to use Base44 for auth

Update `server/middleware/auth.js` to implement your chosen authentication.

## Troubleshooting

### Build fails
- Check that all dependencies are in `package.json`
- Verify Node.js version (Railway uses Node 18+ by default)

### Database connection fails
- Verify `DATABASE_URL` is set correctly
- Check that your Neon database is not paused
- Ensure your IP is allowed (Neon allows all by default)

### API returns 401 Unauthorized
- Check authentication middleware in `server/middleware/auth.js`
- Verify auth tokens are being sent from frontend

## Next Steps

1. **Set up authentication** - Replace placeholder auth with your system
2. **Add batch job workers** - Implement scheduled jobs with node-cron or BullMQ
3. **Add monitoring** - Use Railway's built-in metrics or add Sentry
4. **Set up CI/CD** - Railway auto-deploys from your main branch

## Support

- Railway Docs: https://docs.railway.app
- NeonDB Docs: https://neon.tech/docs
- Express Docs: https://expressjs.com
# Railway Deploy Tue 18 Nov 2025 17:12:13 GMT
