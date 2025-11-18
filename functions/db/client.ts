import { drizzle } from 'npm:drizzle-orm@0.29.3/neon-serverless';
import { Pool, neonConfig } from 'npm:@neondatabase/serverless@0.9.0';
import * as schema from './schema.js';

// Configure for Deno Deploy
neonConfig.webSocketConstructor = WebSocket;

let dbInstance = null;

// Create a single connection that can be reused
export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  
  const connectionString = Deno.env.get('DATABASE_URL');
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set. Please configure it in your app settings.');
  }
  
  try {
    const pool = new Pool({ connectionString });
    dbInstance = drizzle(pool, { schema });
    console.log('Database connection created with Neon serverless driver');
    return dbInstance;
  } catch (error) {
    console.error('Database connection error:', error);
    throw new Error(`Failed to connect to database: ${error.message}`);
  }
}

// Helper to generate UUIDs
export function generateId() {
  return crypto.randomUUID();
}