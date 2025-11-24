// Migration script to add new scheduling fields
// Run this script to update the database schema with the new scheduling columns

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in environment variables');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function migrate() {
  console.log('Starting migration: Adding new scheduling fields...');

  try {
    // Add new columns to database_instances table
    await sql`
      ALTER TABLE database_instances
      ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'disabled',
      ADD COLUMN IF NOT EXISTS schedule_day_of_week INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS schedule_hour INTEGER DEFAULT 9,
      ADD COLUMN IF NOT EXISTS schedule_minute INTEGER DEFAULT 0
    `;

    console.log('✅ Added new scheduling columns successfully');

    // Update existing records to set schedule_type based on schedule_interval
    await sql`
      UPDATE database_instances
      SET schedule_type = CASE
        WHEN schedule_interval > 0 THEN 'minutes'
        ELSE 'disabled'
      END
      WHERE schedule_type IS NULL OR schedule_type = 'disabled'
    `;

    console.log('✅ Updated existing records with appropriate schedule_type');

    // Verify the migration
    const result = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'database_instances'
      AND column_name IN ('schedule_type', 'schedule_day_of_week', 'schedule_hour', 'schedule_minute')
      ORDER BY column_name
    `;

    console.log('\n📊 New columns in database_instances table:');
    result.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'none'})`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrate().then(() => {
  console.log('\n🎉 Database schema updated successfully');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});