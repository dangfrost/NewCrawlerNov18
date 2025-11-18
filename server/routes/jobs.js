import express from 'express';
import { getDb } from '../db/client.js';
import { jobs, jobLogs } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// List jobs
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const db = getDb();

    const jobsList = await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.created_date))
      .limit(limit);

    res.json({ data: jobsList });
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single job
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id));

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ data: job });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job logs
router.get('/:job_id/logs', requireAuth, async (req, res) => {
  try {
    const { job_id } = req.params;
    const db = getDb();

    const logs = await db
      .select()
      .from(jobLogs)
      .where(eq(jobLogs.job_id, job_id))
      .orderBy(desc(jobLogs.created_date));

    res.json({ data: logs });
  } catch (error) {
    console.error('Get job logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
