import express from 'express';
import OpenAI from 'openai';
import { getDb, generateId } from '../db/client.js';
import { databaseInstances, jobs, jobLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const BATCH_SIZE = 5; // Increased from 2 for better performance on Railway
const MAX_CONTENT_LENGTH = 12000;
const OPENAI_TIMEOUT = 120000; // 120 seconds
const MAX_RETRIES = 3;

// Utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(operation, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
      console.log(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

async function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

async function zillizApiCall(endpoint, token, path, body, timeout = 30000) {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${endpoint}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zilliz API error (${response.status}): ${errorText}`);
      }

      let responseText = await response.text();
      // Handle large IDs by converting to strings
      responseText = responseText.replace(/"id":\s*(\d{15,})/g, '"id":"$1"');
      return JSON.parse(responseText);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Zilliz request timeout after ${timeout}ms`);
      }
      throw error;
    }
  });
}

// Start a new augmentor job
router.post('/start', requireAuth, async (req, res) => {
  try {
    const { instance_id } = req.body;

    if (!instance_id) {
      return res.status(400).json({ error: 'Missing instance_id' });
    }

    const db = getDb();

    // Get instance
    const [instance] = await db
      .select()
      .from(databaseInstances)
      .where(eq(databaseInstances.id, instance_id));

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    if (instance.instance_type !== 'augmentor') {
      return res.status(400).json({ error: 'Instance is not an augmentor type' });
    }

    console.log(`Starting augmentor job for instance: ${instance.name}`);

    // Create new job
    const jobId = generateId();
    const now = new Date();

    await db.insert(jobs).values({
      id: jobId,
      created_date: now,
      updated_date: now,
      instance_id: instance.id,
      status: 'pending',
      execution_type: 'full_execution',
      current_batch_offset: 0,
      total_records: 0,
      processed_records: 0,
      failed_records: 0,
      is_processing_batch: false,
      created_by: req.user?.email || 'unknown'
    });

    // Log job creation
    await db.insert(jobLogs).values({
      id: generateId(),
      job_id: jobId,
      level: 'INFO',
      message: 'Job created',
      created_date: now
    });

    // Trigger first batch processing (async)
    processBatch(jobId).catch(err =>
      console.error(`Failed to start batch processing for job ${jobId}:`, err)
    );

    res.json({
      success: true,
      job_id: jobId,
      message: 'Augmentor job started'
    });

  } catch (error) {
    console.error('Start job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dry run - process one record and show before/after
router.post('/dry-run', requireAuth, async (req, res) => {
  try {
    const { instance_id } = req.body;

    if (!instance_id) {
      return res.status(400).json({ error: 'Missing instance_id' });
    }

    const db = getDb();

    // Get instance
    const [instance] = await db
      .select()
      .from(databaseInstances)
      .where(eq(databaseInstances.id, instance_id));

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    if (instance.instance_type !== 'augmentor') {
      return res.status(400).json({ error: 'Instance is not an augmentor type' });
    }

    console.log(`Dry run for instance: ${instance.name}`);

    // Fetch ONE record
    const queryBody = {
      collectionName: instance.collection_name,
      filter: instance.query_filter || '',
      offset: 0,
      limit: 1,
      outputFields: ['*']
    };

    const queryResponse = await zillizApiCall(
      instance.zilliz_endpoint,
      instance.zilliz_token,
      '/v2/vectordb/entities/query',
      queryBody
    );

    const records = queryResponse.data || [];

    if (records.length === 0) {
      return res.status(404).json({ error: 'No records found in collection' });
    }

    const record = records[0];
    const originalContent = record[instance.target_field] || '';

    // Extract content from tags if present
    let contentToProcess = originalContent;
    const tagRegex = /\[pagecontent\](.*?)\[\/pagecontent\]/gs;
    const match = tagRegex.exec(originalContent);
    if (match) {
      contentToProcess = match[1];
    }

    if (contentToProcess.length > MAX_CONTENT_LENGTH) {
      contentToProcess = contentToProcess.substring(0, MAX_CONTENT_LENGTH);
    }

    // Process with OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const promptWithContent = instance.prompt.replace(/\{\{FIELD_VALUE\}\}/g, contentToProcess);

    console.log('Sending to OpenAI for dry run...');

    const aiResult = await withTimeout(
      withRetry(async () => {
        return await openai.chat.completions.create({
          model: instance.generative_model_name,
          messages: [
            { role: 'user', content: promptWithContent }
          ],
          temperature: 0.3,
        });
      }),
      OPENAI_TIMEOUT,
      'OpenAI request timeout - the prompt may be too long or the service is slow'
    );

    const processedContent = aiResult.choices[0].message.content.trim();

    // Generate embedding for processed content
    let embedding = null;
    if (instance.vector_field_name) {
      console.log('Generating embedding for processed content...');
      const embeddingResult = await withTimeout(
        withRetry(async () => {
          return await openai.embeddings.create({
            model: instance.embedding_model_name,
            input: processedContent
          });
        }),
        30000, // 30 second timeout for embeddings (they should be fast)
        'Embedding generation timeout - this should not take more than 30 seconds'
      );
      embedding = embeddingResult.data[0].embedding;
      console.log(`Embedding generated: ${embedding.length} dimensions`);
    }

    // Return before/after comparison
    console.log('Dry run complete, sending response');
    res.json({
      success: true,
      before: {
        content: contentToProcess,
        record_id: record[instance.primary_key_field]
      },
      after: {
        content: processedContent,
        embedding_dimensions: embedding ? embedding.length : null
      },
      metadata: {
        model: instance.generative_model_name,
        embedding_model: instance.embedding_model_name,
        prompt_used: instance.prompt
      }
    });
    console.log('Dry run response sent successfully');

  } catch (error) {
    console.error('Dry run error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process a batch (called recursively)
async function processBatch(jobId) {
  const db = getDb();

  try {
    console.log(`[Batch] Processing job ${jobId}`);

    // Get job
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) {
      console.error(`[Batch] Job ${jobId} not found`);
      return;
    }

    if (job.status === 'cancelled') {
      console.log(`[Batch] Job ${jobId} is cancelled, stopping`);
      return;
    }

    // Get instance
    const [instance] = await db
      .select()
      .from(databaseInstances)
      .where(eq(databaseInstances.id, job.instance_id));

    if (!instance) {
      await db.update(jobs)
        .set({ status: 'failed', details: 'Instance not found', updated_date: new Date() })
        .where(eq(jobs.id, jobId));
      return;
    }

    // Log helper
    const addLog = async (message, level = 'INFO') => {
      console.log(`[${level}] ${message}`);
      await db.insert(jobLogs).values({
        id: generateId(),
        job_id: jobId,
        level,
        message,
        created_date: new Date()
      });
    };

    // Start job if pending
    if (job.status === 'pending') {
      await db.update(jobs)
        .set({ status: 'running', started_at: new Date(), updated_date: new Date() })
        .where(eq(jobs.id, jobId));
      await addLog('Job started');
    }

    // Fetch batch
    await addLog(`Fetching batch at offset ${job.current_batch_offset} (batch size: ${BATCH_SIZE})`);

    const queryBody = {
      collectionName: instance.collection_name,
      filter: instance.query_filter || '',
      offset: job.current_batch_offset,
      limit: BATCH_SIZE,
      outputFields: ['*']
    };

    const queryResponse = await zillizApiCall(
      instance.zilliz_endpoint,
      instance.zilliz_token,
      '/v2/vectordb/entities/query',
      queryBody
    );

    const records = queryResponse.data || [];
    await addLog(`Fetched ${records.length} records`);

    if (records.length === 0) {
      await db.update(jobs)
        .set({ status: 'completed', details: 'All records processed', updated_date: new Date() })
        .where(eq(jobs.id, jobId));
      await addLog('Job completed - no more records to process');
      return;
    }

    // Process batch with AI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const batchPrompts = records.map((record, idx) => {
      let content = record[instance.target_field] || '';
      const tagRegex = /\[pagecontent\](.*?)\[\/pagecontent\]/gs;
      const match = tagRegex.exec(content);
      if (match) {
        content = match[1];
      }

      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH);
      }

      const promptWithContent = instance.prompt.replace(/\{\{FIELD_VALUE\}\}/g, content);
      return `[RECORD ${idx + 1}]\n${promptWithContent}`;
    });

    const combinedPrompt = batchPrompts.join('\n\n---\n\n');

    await addLog('Sending batch to OpenAI for processing...');

    let aiResponses = [];
    try {
      const aiResult = await withTimeout(
        withRetry(async () => {
          return await openai.chat.completions.create({
            model: instance.generative_model_name,
            messages: [
              { role: 'system', content: 'Process each record separately. Return responses in the format: [RECORD X]\n<processed content>' },
              { role: 'user', content: combinedPrompt }
            ],
            temperature: 0.3,
          });
        }),
        OPENAI_TIMEOUT,
        'OpenAI processing timeout - batch may be too large or service is slow'
      );

      const fullResponse = aiResult.choices[0].message.content;
      const recordResponses = fullResponse.split(/\[RECORD \d+\]/);
      aiResponses = recordResponses.slice(1).map(r => r.trim());

      if (aiResponses.length !== records.length) {
        throw new Error(`AI returned ${aiResponses.length} responses but expected ${records.length}`);
      }

      await addLog(`AI processing completed for ${aiResponses.length} records`);

    } catch (batchError) {
      await addLog(`Batch AI processing failed: ${batchError.message}. Skipping this batch.`, 'ERROR');

      const newOffset = job.current_batch_offset + records.length;
      const newFailedRecords = job.failed_records + records.length;

      await db.update(jobs).set({
        current_batch_offset: newOffset,
        failed_records: newFailedRecords,
        last_batch_at: new Date(),
        updated_date: new Date()
      }).where(eq(jobs.id, jobId));

      // Continue to next batch
      setTimeout(() => processBatch(jobId), 1000);
      return;
    }

    // Process each record
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const processedContent = aiResponses[i];
      const recordId = record[instance.primary_key_field];

      await addLog(`Record ${recordId}: Processing...`);

      try {
        let updatedContent = processedContent;
        const originalContent = record[instance.target_field] || '';
        const tagRegex = /\[pagecontent\](.*?)\[\/pagecontent\]/gs;

        if (tagRegex.test(originalContent)) {
          updatedContent = originalContent.replace(tagRegex, `[pagecontent]${processedContent}[/pagecontent]`);
        }

        const updatedRecord = { ...record, [instance.target_field]: updatedContent };

        // Generate new embedding for processed content
        if (instance.vector_field_name) {
          await addLog(`Record ${recordId}: Generating embedding...`);
          const embeddingResult = await withTimeout(
            withRetry(async () => {
              return await openai.embeddings.create({
                model: instance.embedding_model_name,
                input: processedContent
              });
            }),
            30000, // 30 second timeout
            'Embedding generation timeout'
          );
          updatedRecord[instance.vector_field_name] = embeddingResult.data[0].embedding;
          await addLog(`Record ${recordId}: Embedding generated (${embeddingResult.data[0].embedding.length} dims)`);
        }

        // Delete old record
        await zillizApiCall(
          instance.zilliz_endpoint,
          instance.zilliz_token,
          '/v2/vectordb/entities/delete',
          {
            collectionName: instance.collection_name,
            filter: `${instance.primary_key_field} == "${recordId}"`
          }
        );

        // Insert updated record
        await zillizApiCall(
          instance.zilliz_endpoint,
          instance.zilliz_token,
          '/v2/vectordb/entities/insert',
          {
            collectionName: instance.collection_name,
            data: [updatedRecord]
          }
        );

        successCount++;
        await addLog(`Record ${recordId}: ✓ Complete`);

      } catch (error) {
        failCount++;
        await addLog(`Record ${recordId}: ✗ Failed - ${error.message}`, 'ERROR');
      }
    }

    // Update job progress
    const newOffset = job.current_batch_offset + records.length;
    const newProcessed = job.processed_records + successCount;
    const newFailed = job.failed_records + failCount;

    await db.update(jobs).set({
      current_batch_offset: newOffset,
      processed_records: newProcessed,
      failed_records: newFailed,
      last_batch_at: new Date(),
      updated_date: new Date()
    }).where(eq(jobs.id, jobId));

    await addLog(`Batch complete: ${successCount} succeeded, ${failCount} failed`);

    // Trigger next batch after a short delay
    setTimeout(() => processBatch(jobId), 1000);

  } catch (error) {
    console.error(`[Batch] Job ${jobId} processing error:`, error);

    try {
      await db.update(jobs).set({
        status: 'failed',
        details: error.message,
        updated_date: new Date()
      }).where(eq(jobs.id, jobId));

      await db.insert(jobLogs).values({
        id: generateId(),
        job_id: jobId,
        level: 'ERROR',
        message: `Fatal error: ${error.message}`,
        created_date: new Date()
      });
    } catch (e) {
      console.error('Failed to update job status:', e);
    }
  }
}

export default router;
