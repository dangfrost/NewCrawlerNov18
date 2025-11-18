import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import instancesRouter from './routes/instances.js';
import jobsRouter from './routes/jobs.js';
import queryRouter from './routes/query.js';
import augmentorRouter from './routes/augmentor.js';
import { startScheduler } from './workers/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Start batch job scheduler
if (process.env.ENABLE_SCHEDULER !== 'false') {
  startScheduler();
}

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
app.use('/api/query', queryRouter);
app.use('/api/augmentor', augmentorRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// One-time migration: Update augmentors to GPT-3.5-turbo (allow GET for easy access)
app.all('/api/admin/update-to-gpt35', async (req, res) => {
  try {
    const { getDb } = await import('./db/client.js');
    const { databaseInstances } = await import('./db/schema.js');
    const { eq } = await import('drizzle-orm');

    const db = getDb();

    // Get all augmentor instances
    const instances = await db
      .select()
      .from(databaseInstances)
      .where(eq(databaseInstances.instance_type, 'augmentor'));

    const updates = [];
    for (const instance of instances) {
      await db
        .update(databaseInstances)
        .set({
          generative_model_name: 'gpt-3.5-turbo',
          updated_date: new Date()
        })
        .where(eq(databaseInstances.id, instance.id));

      updates.push({
        id: instance.id,
        name: instance.name,
        old_model: instance.generative_model_name,
        new_model: 'gpt-3.5-turbo'
      });
    }

    res.json({
      success: true,
      message: `Updated ${updates.length} augmentor instances to GPT-3.5-turbo`,
      updates
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message });
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
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
