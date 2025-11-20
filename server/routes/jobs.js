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

// Delete job and all its logs
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Check if job exists
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Delete all job logs first (foreign key constraint)
    await db.delete(jobLogs).where(eq(jobLogs.job_id, id));

    // Delete the job
    await db.delete(jobs).where(eq(jobs.id, id));

    res.json({ success: true, message: 'Job and all logs deleted' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
router.post('/:job_id/cancel', requireAuth, async (req, res) => {
  try {
    const { job_id } = req.params;
    const db = getDb();

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, job_id));

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'running' && job.status !== 'pending') {
      return res.status(400).json({ error: 'Job is not running or pending' });
    }

    await db
      .update(jobs)
      .set({ status: 'cancelled', updated_date: new Date() })
      .where(eq(jobs.id, job_id));

    res.json({ success: true, message: 'Job cancelled' });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job exceptions (failed records)
router.get('/:id/exceptions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Get job first
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id));

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get error logs for this job
    const errorLogs = await db
      .select()
      .from(jobLogs)
      .where(eq(jobLogs.job_id, id))
      .orderBy(desc(jobLogs.created_date))
      .limit(200); // Get more logs to find all errors

    // Filter for error logs
    const errorMessages = errorLogs.filter(log => log.level === 'ERROR' || log.message.includes('Failed') || log.message.includes('failed'));

    // Parse out failed record information
    const exceptions = errorMessages
      .filter(log => log.message.includes('✗ Failed') || log.message.includes('failed after'))
      .map(log => {
        const recordIdMatch = log.message.match(/Record (\S+):/);
        const errorMatch = log.message.match(/Failed - (.+)$/) || log.message.match(/failed after .+: (.+)$/);

        return {
          id: log.id,
          recordId: recordIdMatch ? recordIdMatch[1] : 'Unknown',
          error: errorMatch ? errorMatch[1] : log.message,
          timestamp: log.created_date
        };
      });

    // Summary statistics
    const summary = {
      totalRecords: job.total_records || 0,
      processedRecords: job.processed_records || 0,
      failedRecords: job.failed_records || 0,
      successRate: job.processed_records > 0
        ? Math.round((job.processed_records / (job.processed_records + job.failed_records)) * 100)
        : 0
    };

    res.json({
      job: {
        id: job.id,
        status: job.status,
        details: job.details
      },
      summary,
      exceptions,
      totalExceptions: exceptions.length
    });
  } catch (error) {
    console.error('Get exceptions error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
