import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

// DatabaseInstance table
export const databaseInstances = pgTable('database_instances', {
  id: text('id').primaryKey(),
  created_date: timestamp('created_date').defaultNow().notNull(),
  updated_date: timestamp('updated_date').defaultNow().notNull(),
  created_by: text('created_by'),

  instance_type: text('instance_type').notNull().default('augmentor'), // 'augmentor' | 'query'
  name: text('name').notNull(),
  description: text('description'),
  zilliz_endpoint: text('zilliz_endpoint').notNull(),
  zilliz_token: text('zilliz_token').notNull(),
  collection_name: text('collection_name').notNull(),
  embedding_model_name: text('embedding_model_name').default('text-embedding-3-large'),
  primary_key_field: text('primary_key_field').default('id'),
  query_filter: text('query_filter'),
  target_field: text('target_field'),
  vector_field_name: text('vector_field_name'),
  ai_operation: text('ai_operation'), // 'strip_english' | 'translate' | 'extract_entities' | 'summarize' | 'custom'
  prompt: text('prompt'),
  generative_model_name: text('generative_model_name').default('gpt-4o'),

  // Two-pass processing configuration
  languages_to_remove: text('languages_to_remove').default('en'), // Comma-separated: 'en,fr,de'
  enable_two_pass: boolean('enable_two_pass').default(true), // Enable programmatic + AI passes

  status: text('status').notNull().default('active'), // 'active' | 'paused' | 'error'

  // New scheduling fields
  schedule_enabled: boolean('schedule_enabled').default(false),
  schedule_days: text('schedule_days'), // JSON array: ['monday', 'tuesday', etc.]
  schedule_frequency: text('schedule_frequency').default('once_daily'), // 'once_daily' | 'twice_daily' | 'every_x_hours' | 'hourly'
  schedule_hours_interval: integer('schedule_hours_interval').default(4), // For every X hours
  schedule_time: text('schedule_time').default('09:00'), // Time format HH:MM
  schedule_time_second: text('schedule_time_second').default('21:00'), // Second time for twice daily

  // Legacy scheduling fields (kept for backward compatibility)
  schedule_interval: integer('schedule_interval').default(0),
  schedule_type: text('schedule_type').default('disabled'),
  schedule_day_of_week: integer('schedule_day_of_week').default(1),
  schedule_hour: integer('schedule_hour').default(9),
  schedule_minute: integer('schedule_minute').default(0),

  last_run: timestamp('last_run'),
  top_k: integer('top_k').default(5),
});

// Job table
export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  created_date: timestamp('created_date').defaultNow().notNull(),
  updated_date: timestamp('updated_date').defaultNow().notNull(),
  created_by: text('created_by'),

  instance_id: text('instance_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  execution_type: text('execution_type').notNull().default('full_execution'), // 'full_execution' | 'dry_run'
  started_at: timestamp('started_at'),
  last_batch_at: timestamp('last_batch_at'),
  current_batch_offset: integer('current_batch_offset').default(0),
  total_records: integer('total_records').default(0),
  processed_records: integer('processed_records').default(0),
  failed_records: integer('failed_records').default(0),
  is_processing_batch: boolean('is_processing_batch').default(false),

  // Two-pass processing tracking
  current_pass: integer('current_pass').default(1), // 1 = programmatic, 2 = AI
  pass1_processed: integer('pass1_processed').default(0), // Records processed in pass 1
  pass1_cleaned: integer('pass1_cleaned').default(0), // Records fully cleaned in pass 1 (skip pass 2)
  pass2_needed: integer('pass2_needed').default(0), // Records that need AI processing
  pass2_processed: integer('pass2_processed').default(0), // Records processed in pass 2

  details: text('details'),
});

// JobLog table
export const jobLogs = pgTable('job_logs', {
  id: text('id').primaryKey(),
  created_date: timestamp('created_date').defaultNow().notNull(),

  job_id: text('job_id').notNull(),
  level: text('level').notNull().default('INFO'), // 'INFO' | 'ERROR'
  message: text('message').notNull(),
});
