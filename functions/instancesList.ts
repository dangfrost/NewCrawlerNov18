import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { neon } from 'npm:@neondatabase/serverless@0.9.0';
import { drizzle } from 'npm:drizzle-orm@0.29.3/neon-http';
import { databaseInstances } from './db/schema.js';
import { desc } from 'npm:drizzle-orm@0.29.3';

Deno.serve(async (req) => {
    try {
        console.log('instancesList: Starting request');
        
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        console.log('instancesList: User authenticated:', user?.email);

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('instancesList: Getting database connection');
        const connectionString = Deno.env.get('DATABASE_URL');
        if (!connectionString) {
            throw new Error('DATABASE_URL not configured');
        }
        
        const sql = neon(connectionString);
        const db = drizzle(sql);
        
        console.log('instancesList: Querying database');
        const instances = await db.select().from(databaseInstances).orderBy(desc(databaseInstances.created_date));
        
        console.log('instancesList: Found instances:', instances.length);
        return Response.json({ data: instances });
    } catch (error) {
        console.error('List instances error:', error);
        console.error('Error stack:', error.stack);
        return Response.json({ 
            error: error.message,
            details: error.stack?.substring(0, 500)
        }, { status: 500 });
    }
});