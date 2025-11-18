import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import { randomUUID } from 'crypto';

// Use HTTP driver for better reliability
export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set. Please configure it in your Railway settings.');
  }

  try {
    const sql = neon(connectionString);
    const db = drizzle(sql, { schema });
    return db;
  } catch (error) {
    console.error('Database connection error:', error);
    throw new Error(`Failed to connect to database: ${error.message}`);
  }
}

// Helper to generate UUIDs
export function generateId() {
  return randomUUID();
}
