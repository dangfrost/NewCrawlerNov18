import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { Pool, neonConfig } from 'npm:@neondatabase/serverless@0.9.0';

// Configure for Deno Deploy
neonConfig.webSocketConstructor = WebSocket;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ 
        error: 'Admin access required',
        details: `Current role: ${user?.role || 'unknown'}. Admin role required.`
      }, { status: 403 });
    }

    console.log('Starting data migration for user:', user.email);

    const connectionString = Deno.env.get('DATABASE_URL');
    if (!connectionString) {
      return Response.json({ 
        error: 'DATABASE_URL not set',
        details: 'Environment variable DATABASE_URL is missing'
      }, { status: 500 });
    }

    const pool = new Pool({ connectionString });

    // Fetch all data from Base44 entities
    console.log('Fetching data from Base44 entities...');
    const instances = await base44.asServiceRole.entities.DatabaseInstance.list();
    const jobs = await base44.asServiceRole.entities.Job.list();
    const jobLogs = await base44.asServiceRole.entities.JobLog.list();

    console.log(`Found: ${instances.length} instances, ${jobs.length} jobs, ${jobLogs.length} logs`);
    
    // Return early if no data to migrate
    if (instances.length === 0 && jobs.length === 0 && jobLogs.length === 0) {
      await pool.end();
      return Response.json({
        success: true,
        message: 'No data found in Base44 entities to migrate. Your Base44 entities are empty.',
        found: { instances: 0, jobs: 0, logs: 0 },
        migrated: { instances: 0, jobs: 0, logs: 0 }
      });
    }

    let migratedInstances = 0;
    let migratedJobs = 0;
    let migratedLogs = 0;

    // Migrate instances
    for (const instance of instances) {
      try {
        await pool.query(
          `INSERT INTO database_instances (
            id, created_date, updated_date, created_by,
            instance_type, name, description, zilliz_endpoint, zilliz_token,
            collection_name, embedding_model_name, primary_key_field,
            query_filter, target_field, vector_field_name, ai_operation,
            prompt, generative_model_name, status, schedule_interval,
            last_run, top_k
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (id) DO NOTHING`,
          [
            instance.id, instance.created_date, instance.updated_date, instance.created_by,
            instance.instance_type || 'augmentor', instance.name, instance.description,
            instance.zilliz_endpoint, instance.zilliz_token, instance.collection_name,
            instance.embedding_model_name || 'text-embedding-3-large',
            instance.primary_key_field || 'id', instance.query_filter,
            instance.target_field, instance.vector_field_name, instance.ai_operation,
            instance.prompt, instance.generative_model_name || 'gpt-4o',
            instance.status || 'active', instance.schedule_interval || 0,
            instance.last_run, instance.top_k || 5
          ]
        );
        migratedInstances++;
      } catch (err) {
        console.error(`Failed to migrate instance ${instance.id}:`, err.message);
      }
    }

    // Migrate jobs
    for (const job of jobs) {
      try {
        await pool.query(
          `INSERT INTO jobs (
            id, created_date, updated_date, created_by,
            instance_id, status, execution_type, started_at, last_batch_at,
            current_batch_offset, total_records, processed_records,
            failed_records, is_processing_batch, details
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO NOTHING`,
          [
            job.id, job.created_date, job.updated_date, job.created_by,
            job.instance_id, job.status || 'pending',
            job.execution_type || 'full_execution', job.started_at, job.last_batch_at,
            job.current_batch_offset || 0, job.total_records || 0,
            job.processed_records || 0, job.failed_records || 0,
            job.is_processing_batch || false, job.details
          ]
        );
        migratedJobs++;
      } catch (err) {
        console.error(`Failed to migrate job ${job.id}:`, err.message);
      }
    }

    // Migrate job logs
    for (const log of jobLogs) {
      try {
        await pool.query(
          `INSERT INTO job_logs (
            id, created_date, job_id, level, message
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING`,
          [log.id, log.created_date, log.job_id, log.level || 'INFO', log.message]
        );
        migratedLogs++;
      } catch (err) {
        console.error(`Failed to migrate log ${log.id}:`, err.message);
      }
    }

    await pool.end();

    console.log('Data migration completed');

    return Response.json({ 
      success: true, 
      message: 'Data migrated successfully to NeonDB!',
      migrated: {
        instances: migratedInstances,
        jobs: migratedJobs,
        logs: migratedLogs
      },
      found: {
        instances: instances.length,
        jobs: jobs.length,
        logs: jobLogs.length
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack?.substring(0, 1000) || 'No additional details',
      type: error.constructor.name
    }, { status: 500 });
  }
});