import cron from 'node-cron';
import { getDb } from '../db/client.js';
import { databaseInstances } from '../db/schema.js';
import { eq, and, lte, or, isNull } from 'drizzle-orm';

/**
 * Batch job worker for processing scheduled instances
 * Runs every minute to check for instances that need processing
 */

export function startScheduler() {
  console.log('Starting batch job scheduler...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledInstances();
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  });

  console.log('Batch job scheduler started');
}

async function processScheduledInstances() {
  const db = getDb();
  const now = new Date();

  try {
    // Find active instances with schedule_interval > 0
    // and (last_run is null OR last_run + interval < now)
    const instances = await db
      .select()
      .from(databaseInstances)
      .where(
        and(
          eq(databaseInstances.status, 'active'),
          lte(databaseInstances.schedule_interval, 0)
        )
      );

    if (instances.length === 0) {
      console.log('No scheduled instances to process');
      return;
    }

    console.log(`Found ${instances.length} scheduled instances to check`);

    for (const instance of instances) {
      // Check if enough time has passed since last run
      if (instance.last_run) {
        const nextRun = new Date(instance.last_run);
        nextRun.setMinutes(nextRun.getMinutes() + instance.schedule_interval);

        if (nextRun > now) {
          console.log(`Instance ${instance.id} not ready yet. Next run: ${nextRun}`);
          continue;
        }
      }

      // Process this instance
      console.log(`Processing instance ${instance.id}: ${instance.name}`);
      await processInstance(instance);
    }
  } catch (error) {
    console.error('Error processing scheduled instances:', error);
    throw error;
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
