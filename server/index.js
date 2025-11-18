import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import instancesRouter from './routes/instances.js';
import jobsRouter from './routes/jobs.js';
import { startScheduler } from './workers/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Debug: Log all environment variables (excluding secrets)
console.log('=== Environment Check ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL length:', process.env.DATABASE_URL.length);
  console.log('DATABASE_URL starts with:', process.env.DATABASE_URL.substring(0, 15));
}
console.log('========================');

// Start batch job scheduler - TEMPORARILY DISABLED FOR DEBUGGING
// if (process.env.ENABLE_SCHEDULER !== 'false') {
//   startScheduler();
// }
console.log('Scheduler disabled for debugging');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/instances', instancesRouter);
app.use('/api/jobs', jobsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database connection test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL is set:', !!process.env.DATABASE_URL);

    const { getDb } = await import('./db/client.js');
    const db = getDb();

    // Try a simple query
    const { databaseInstances } = await import('./db/schema.js');
    const instances = await db.select().from(databaseInstances).limit(1);

    res.json({
      success: true,
      message: 'Database connection successful',
      instanceCount: instances.length
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Serve static files from Vite build (for production)
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`DATABASE_URL configured: ${!!process.env.DATABASE_URL}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
