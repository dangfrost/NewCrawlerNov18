import { drizzle } from 'npm:drizzle-orm@0.29.3/postgres-js';
import postgres from 'npm:postgres@3.4.3';
import * as schema from './schema.js';

// Create a connection for each function invocation
// In serverless, we can't reuse connections across invocations
export function getDb() {
  const connectionString = Deno.env.get('DATABASE_URL');
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set. Please configure it in your app settings.');
  }
  
  try {
    const client = postgres(connectionString, {
      ssl: 'require',
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false
    });
    
    const db = drizzle(client, { schema });
    console.log('Database connection created');
    return db;
  } catch (error) {
    console.error('Database connection error:', error);
    throw new Error(`Failed to connect to database: ${error.message}`);
  }
}

// Helper to generate UUIDs
export function generateId() {
  return crypto.randomUUID();
}