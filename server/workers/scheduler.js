import cron from 'node-cron';
import { getDb } from '../db/client.js';
import { databaseInstances, jobs } from '../db/schema.js';
import { eq, and, gt, or, isNull, inArray, ne } from 'drizzle-orm';

/**
 * Batch job worker for processing scheduled instances and resuming jobs
 * Runs every minute to:
 * 1. Resume running jobs (in case of timeout/restart)
 * 2. Retry failed jobs (if they can be recovered)
 * 3. Check for scheduled instances that need processing
 */

export function startScheduler() {
  console.log('Starting batch job scheduler...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await resumeJobs();
      await processScheduledInstances();
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  });

  console.log('Batch job scheduler started');
}

/**
 * Resume jobs that are in 'running' or 'failed' status
 * This handles cases where jobs were interrupted by timeouts/restarts or failed
 */
async function resumeJobs() {
  const db = getDb();

  try {
    // Get both running and failed jobs
    const jobsToResume = await db
      .select()
      .from(jobs)
      .where(inArray(jobs.status, ['running', 'failed']));

    if (jobsToResume.length === 0) {
      return;
    }

    console.log(`Found ${jobsToResume.length} jobs to resume (running/failed)`);

    // Import processBatch dynamically to avoid circular dependency
    const { processBatch } = await import('../routes/augmentor.js');

    for (const job of jobsToResume) {
      // Check if job is not already being processed (is_processing_batch flag)
      if (!job.is_processing_batch) {
        // For failed jobs, check if they're recoverable
        if (job.status === 'failed') {
          // Don't retry if all records have failed
          if (job.failed_records >= job.total_records && job.total_records > 0) {
            console.log(`Job ${job.id} - all records failed, skipping retry`);
            continue;
          }
          // Don't retry if more than 50% have failed
          if (job.total_records > 0 && job.failed_records / job.total_records > 0.5) {
            console.log(`Job ${job.id} - >50% failed, skipping retry`);
            continue;
          }
          // Reset status to running to retry
          await db.update(jobs)
            .set({ status: 'running', updated_date: new Date() })
            .where(eq(jobs.id, job.id));
          console.log(`Retrying failed job ${job.id}`);
        } else {
          console.log(`Resuming running job ${job.id}`);
        }

        // Don't await - let it run in background
        processBatch(job.id, 0).catch(err => {
          console.error(`Error resuming job ${job.id}:`, err);
        });
      }
    }
  } catch (error) {
    console.error('Error resuming jobs:', error);
  }
}

async function processScheduledInstances() {
  const db = getDb();
  const now = new Date();

  try {
    // Find active instances that have scheduling enabled
    const instances = await db
      .select()
      .from(databaseInstances)
      .where(
        and(
          eq(databaseInstances.status, 'active'),
          or(
            gt(databaseInstances.schedule_interval, 0), // Legacy: minutes interval
            and(
              databaseInstances.schedule_type ? ne(databaseInstances.schedule_type, 'disabled') : false
            )
          )
        )
      );

    if (instances.length === 0) {
      return; // No scheduled instances to process
    }

    console.log(`Checking ${instances.length} scheduled instances`);

    for (const instance of instances) {
      const shouldRun = shouldInstanceRun(instance, now);

      if (shouldRun) {
        console.log(`Processing instance ${instance.id}: ${instance.name} (type: ${instance.schedule_type || 'minutes'})`);
        await processInstance(instance);
      }
    }
  } catch (error) {
    console.error('Error processing scheduled instances:', error);
    throw error;
  }
}

/**
 * Determine if an instance should run based on its schedule configuration
 */
function shouldInstanceRun(instance, now) {
  // If no last run, it should run
  if (!instance.last_run) {
    return true;
  }

  const lastRun = new Date(instance.last_run);
  const scheduleType = instance.schedule_type || 'minutes'; // Default to minutes for legacy

  switch (scheduleType) {
    case 'disabled':
      return false;

    case 'minutes':
      // Legacy behavior: check if enough minutes have passed
      const minuteInterval = instance.schedule_interval || 0;
      if (minuteInterval <= 0) return false;

      const nextRunMinutes = new Date(lastRun);
      nextRunMinutes.setMinutes(nextRunMinutes.getMinutes() + minuteInterval);
      return now >= nextRunMinutes;

    case 'daily':
      // Check if it's the right time today and hasn't run today yet
      const todayScheduledTime = new Date(now);
      todayScheduledTime.setHours(instance.schedule_hour || 9, instance.schedule_minute || 0, 0, 0);

      // Has it already run today?
      const lastRunDate = lastRun.toDateString();
      const todayDate = now.toDateString();

      if (lastRunDate === todayDate) {
        return false; // Already ran today
      }

      // Is it past the scheduled time?
      return now >= todayScheduledTime;

    case 'weekly':
      // Check if it's the right day and time
      const currentDayOfWeek = now.getDay();
      const scheduledDayOfWeek = instance.schedule_day_of_week || 1;

      // Not the right day
      if (currentDayOfWeek !== scheduledDayOfWeek) {
        return false;
      }

      // Right day - check time
      const todayWeeklyTime = new Date(now);
      todayWeeklyTime.setHours(instance.schedule_hour || 9, instance.schedule_minute || 0, 0, 0);

      // Has it already run this week? (within last 7 days on same weekday)
      const daysSinceLastRun = Math.floor((now - lastRun) / (1000 * 60 * 60 * 24));
      if (daysSinceLastRun < 7 && lastRun.getDay() === currentDayOfWeek) {
        return false; // Already ran this week
      }

      // Is it past the scheduled time?
      return now >= todayWeeklyTime;

    default:
      console.warn(`Unknown schedule type: ${scheduleType}`);
      return false;
  }
}

async function processInstance(instance) {
  const db = getDb();

  try {
    console.log(`Starting job for instance ${instance.id}`);

    // TODO: Implement actual job processing logic here
    // This is where you would:
    // 1. Create a job record
    // 2. Process the Zilliz data
    // 3. Update job status
    // 4. Create job logs

    // Example: Create a job record
    // const jobId = generateId();
    // await db.insert(jobs).values({
    //   id: jobId,
    //   instance_id: instance.id,
    //   status: 'pending',
    //   execution_type: 'full_execution',
    //   created_by: 'scheduler'
    // });

    // Update last_run timestamp
    await db
      .update(databaseInstances)
      .set({ last_run: new Date() })
      .where(eq(databaseInstances.id, instance.id));

    console.log(`Completed processing instance ${instance.id}`);
  } catch (error) {
    console.error(`Error processing instance ${instance.id}:`, error);

    // Update instance status to error
    await db
      .update(databaseInstances)
      .set({ status: 'error' })
      .where(eq(databaseInstances.id, instance.id));

    throw error;
  }
}

// Example of a long-running batch job function
export async function runBatchJob(instanceId) {
  const db = getDb();

  try {
    const [instance] = await db
      .select()
      .from(databaseInstances)
      .where(eq(databaseInstances.id, instanceId));

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    console.log(`Running batch job for instance ${instance.name}`);

    // TODO: Implement your batch job logic here
    // Examples:
    // - Web scraping and crawling
    // - Generating embeddings and storing in Zilliz
    // - Data transformation and migration
    // - AI processing of large datasets

    // Simulate long-running job
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`Batch job completed for instance ${instance.name}`);
  } catch (error) {
    console.error(`Batch job error for instance ${instanceId}:`, error);
    throw error;
  }
}
