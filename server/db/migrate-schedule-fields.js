// Migration script to add new scheduling fields
// Run this script to update the database schema with the new scheduling columns

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

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
      ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS schedule_days TEXT,
      ADD COLUMN IF NOT EXISTS schedule_frequency TEXT DEFAULT 'once_daily',
      ADD COLUMN IF NOT EXISTS schedule_hours_interval INTEGER DEFAULT 4,
      ADD COLUMN IF NOT EXISTS schedule_time TEXT DEFAULT '09:00',
      ADD COLUMN IF NOT EXISTS schedule_time_second TEXT DEFAULT '21:00'
    `;

    console.log('✅ Added new scheduling columns successfully');

    // Convert any existing schedules
    await sql`
      UPDATE database_instances
      SET schedule_enabled = CASE
        WHEN schedule_interval > 0 OR (schedule_type IS NOT NULL AND schedule_type != 'disabled')
        THEN true
        ELSE false
      END
    `;

    console.log('✅ Updated existing records with schedule_enabled');

    // Verify the migration
    const result = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'database_instances'
      AND column_name IN ('schedule_enabled', 'schedule_days', 'schedule_frequency', 'schedule_hours_interval', 'schedule_time', 'schedule_time_second')
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