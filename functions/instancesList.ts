import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { drizzle } from 'npm:drizzle-orm@0.29.3/neon-serverless';
import { Pool, neonConfig } from 'npm:@neondatabase/serverless@0.9.0';
import { databaseInstances } from './db/schema.js';
import { desc } from 'npm:drizzle-orm@0.29.3';

neonConfig.webSocketConstructor = WebSocket;

Deno.serve(async (req) => {
    let pool;
    try {
        console.log('instancesList: Starting request');

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        console.log('instancesList: User authenticated:', user?.email);

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('instancesList: Getting DATABASE_URL');
        const connectionString = Deno.env.get('DATABASE_URL');
        if (!connectionString) {
            throw new Error('DATABASE_URL not set');
        }
        console.log('instancesList: DATABASE_URL exists');

        console.log('instancesList: Creating pool');
        pool = new Pool({ connectionString });
        const db = drizzle(pool);

        console.log('instancesList: Querying database');
        const instances = await db.select().from(databaseInstances).orderBy(desc(databaseInstances.created_date));

        console.log('instancesList: Found instances:', instances.length);

        await pool.end();

        return Response.json({ data: instances });
    } catch (error) {
        console.error('List instances error:', error);
        console.error('Error stack:', error.stack);

        if (pool) {
            try {
                await pool.end();
            } catch (e) {
                console.error('Error closing pool:', e);
            }
        }

        return Response.json({
            error: error.message,
            details: error.stack?.substring(0, 500)
        }, { status: 500 });
    }
});