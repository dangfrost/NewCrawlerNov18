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

    // Fetch instances from Base44 entities
    console.log('Fetching instances from Base44 entities...');
    const instances = await base44.asServiceRole.entities.DatabaseInstance.list();

    console.log(`Found: ${instances.length} instances`);

    let migratedInstances = 0;
    const errors = [];

    // Migrate instances
    for (const instance of instances) {
      try {
        console.log(`Migrating instance: ${instance.id} - ${instance.name}`);
        const result = await pool.query(
          `INSERT INTO database_instances (
            id, created_date, updated_date, created_by,
            instance_type, name, description, zilliz_endpoint, zilliz_token,
            collection_name, embedding_model_name, primary_key_field,
            query_filter, target_field, vector_field_name, ai_operation,
            prompt, generative_model_name, status, schedule_interval,
            last_run, top_k
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (id) DO UPDATE SET
            updated_date = EXCLUDED.updated_date,
            name = EXCLUDED.name,
            status = EXCLUDED.status`,
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
        console.log(`Instance ${instance.id} migrated, rows affected: ${result.rowCount}`);
        migratedInstances++;
      } catch (err) {
        const errorMsg = `Failed to migrate instance ${instance.id}: ${err.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    await pool.end();

    console.log('Instance migration completed');

    return Response.json({ 
      success: true, 
      message: errors.length > 0 
        ? `Migration completed with ${errors.length} errors. Check logs for details.`
        : 'Instances migrated successfully to NeonDB!',
      migrated: {
        instances: migratedInstances
      },
      found: {
        instances: instances.length
      },
      errors: errors.length > 0 ? errors : undefined
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