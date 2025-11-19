import express from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { franc } from 'franc';
import { getDb, generateId } from '../db/client.js';
import { databaseInstances, jobs, jobLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const BATCH_SIZE = 5; // Increased from 2 for better performance on Railway
const MAX_CONTENT_LENGTH = 100000; // Increased to handle larger content (max seen: 62k chars)
const OPENAI_TIMEOUT = 120000; // 120 seconds
const MAX_RETRIES = 3;
const CLEAN_THRESHOLD = 0.15; // If <15% of content remains after language removal, consider it "clean" (skip AI)

// Language codes that franc can detect
// https://github.com/wooorm/franc/blob/main/packages/franc/support.md
const LANGUAGE_CODES = {
  en: 'eng', // English
  fr: 'fra', // French
  de: 'deu', // German
  es: 'spa', // Spanish
  it: 'ita'  // Italian
};

// Pass 1: Programmatic language filtering using language detection
function removeLanguageSentences(text, languagesToRemove = ['en']) {
  if (!text || text.trim().length === 0) {
    return {
      cleanedText: '',
      stats: {
        original: 0,
        cleaned: 0,
        removed: 0,
        percentRemaining: 0,
        sentencesOriginal: 0,
        sentencesKept: 0,
        sentencesRemoved: 0
      }
    };
  }

  const originalLength = text.length;

  // Split into sentences (handle common sentence endings)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const originalSentenceCount = sentences.length;

  // Convert language codes to franc format
  const francCodes = languagesToRemove.map(lang => LANGUAGE_CODES[lang]).filter(Boolean);

  const keptSentences = [];
  const removedSentences = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10) {
      // Too short to reliably detect - keep it
      keptSentences.push(sentence);
      continue;
    }

    // Detect language
    const detectedLang = franc(trimmed);

    // If detected language is in our remove list, remove it
    if (francCodes.includes(detectedLang)) {
      removedSentences.push(sentence);
    } else {
      keptSentences.push(sentence);
    }
  }

  const cleanedText = keptSentences.join(' ').trim();
  const cleanedLength = cleanedText.length;
  const percentRemaining = originalLength > 0 ? cleanedLength / originalLength : 0;

  return {
    cleanedText,
    stats: {
      original: originalLength,
      cleaned: cleanedLength,
      removed: originalLength - cleanedLength,
      percentRemaining: Math.round(percentRemaining * 100) / 100,
      sentencesOriginal: originalSentenceCount,
      sentencesKept: keptSentences.length,
      sentencesRemoved: removedSentences.length
    }
  };
}

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

// AI Service Router - calls OpenAI or Gemini based on model name
async function callAIService(modelName, messages, temperature = 0.3) {
  if (modelName.startsWith('gemini-')) {
    // Use Google Gemini
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY environment variable is not configured. Please add it to your Railway environment variables to use Gemini models.');
    }

    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      // The SDK expects just the model name without 'models/' prefix
      const model = genAI.getGenerativeModel({ model: modelName });

      // Convert OpenAI message format to Gemini format
      // Gemini uses a simpler format - just concatenate messages
      const prompt = messages.map(msg => {
        if (msg.role === 'system') return `Instructions: ${msg.content}`;
        return msg.content;
      }).join('\n\n');

      // Log prompt details for debugging
      console.log(`[Gemini] Prompt size: ${prompt.length} chars, Preview: ${prompt.substring(0, 200)}...`);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Return in OpenAI-compatible format
      return {
        choices: [{
          message: {
            content: text
          }
        }]
      };
    } catch (error) {
      // Log full error details for debugging
      console.error('[Gemini] Full error object:', JSON.stringify(error, null, 2));
      console.error('[Gemini] Error name:', error.name);
      console.error('[Gemini] Error message:', error.message);
      console.error('[Gemini] Error stack:', error.stack);

      // Provide clearer error messages for common Gemini API errors
      if (error.message?.includes('API key not valid') || error.message?.includes('API_KEY_INVALID')) {
        throw new Error('Google API key is invalid. Please check your GOOGLE_API_KEY in Railway environment variables and redeploy the application.');
      }
      if (error.message?.includes('quota') || error.message?.includes('QUOTA')) {
        throw new Error('Google AI API quota exceeded. Please check your Google AI Studio quota limits.');
      }
      if (error.message?.includes('SAFETY') || error.message?.includes('safety')) {
        throw new Error(`Gemini safety filter triggered: ${error.message}`);
      }
      if (error.message?.includes('RECITATION') || error.message?.includes('recitation')) {
        throw new Error(`Gemini recitation check failed (content may be copyrighted): ${error.message}`);
      }
      // Re-throw with full details
      throw new Error(`Gemini API error: ${error.message} (${error.name || 'unknown error type'})`);
    }
  } else {
    // Use OpenAI
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not configured. Please add it to your Railway environment variables to use OpenAI models.');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return await openai.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: temperature,
    });
  }
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

    // Process with AI (OpenAI or Gemini)
    const promptWithContent = instance.prompt.replace(/\{\{FIELD_VALUE\}\}/g, contentToProcess);

    console.log(`Sending to ${instance.generative_model_name} for dry run...`);

    const aiResult = await withTimeout(
      withRetry(async () => {
        return await callAIService(
          instance.generative_model_name,
          [{ role: 'user', content: promptWithContent }],
          0.3
        );
      }),
      OPENAI_TIMEOUT,
      'AI request timeout - the prompt may be too long or the service is slow'
    );

    const processedContent = aiResult.choices[0].message.content.trim();

    // Generate embedding for processed content
    let embedding = null;
    if (instance.vector_field_name) {
      console.log('Generating embedding for processed content...');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingResult = await withTimeout(
        withRetry(async () => {
          return await openai.embeddings.create({
            model: instance.embedding_model_name,
            input: processedContent
          });
        }),
        60000, // 60 second timeout for embeddings (OpenAI can be slow)
        'Embedding generation timeout - OpenAI took longer than 60 seconds'
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

// Content Analysis - analyze all records' content sizes
router.post('/content-analysis', requireAuth, async (req, res) => {
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

    console.log(`Content analysis for instance: ${instance.name}`);

    // Fetch ALL records (no limit) to analyze
    const queryBody = {
      collectionName: instance.collection_name,
      filter: instance.query_filter || '',
      offset: 0,
      limit: 16384, // Max limit for Zilliz
      outputFields: [instance.primary_key_field, instance.target_field]
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

    // Analyze content sizes
    const contentAnalysis = records.map(record => {
      const content = record[instance.target_field] || '';

      // Check if content has pagecontent tags
      const tagRegex = /\[pagecontent\](.*?)\[\/pagecontent\]/gs;
      const match = tagRegex.exec(content);
      const extractedContent = match ? match[1] : content;

      return {
        id: record[instance.primary_key_field],
        total_size: content.length,
        extracted_size: extractedContent.length,
        has_tags: !!match,
        would_truncate: extractedContent.length > MAX_CONTENT_LENGTH,
        truncated_size: Math.min(extractedContent.length, MAX_CONTENT_LENGTH)
      };
    });

    // Sort by extracted_size descending (largest first)
    contentAnalysis.sort((a, b) => b.extracted_size - a.extracted_size);

    // Calculate statistics
    const stats = {
      total_records: contentAnalysis.length,
      avg_size: Math.round(contentAnalysis.reduce((sum, r) => sum + r.extracted_size, 0) / contentAnalysis.length),
      min_size: Math.min(...contentAnalysis.map(r => r.extracted_size)),
      max_size: Math.max(...contentAnalysis.map(r => r.extracted_size)),
      records_with_tags: contentAnalysis.filter(r => r.has_tags).length,
      records_would_truncate: contentAnalysis.filter(r => r.would_truncate).length,
      current_max_length: MAX_CONTENT_LENGTH
    };

    res.json({
      success: true,
      stats,
      records: contentAnalysis,
      instance: {
        id: instance.id,
        name: instance.name,
        collection: instance.collection_name,
        target_field: instance.target_field
      }
    });

  } catch (error) {
    console.error('Content analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

const MAX_BATCH_RETRIES = 3;

// Process a batch (called recursively) - EXPORTED for scheduler
export async function processBatch(jobId, currentRetry = 0) {
  const db = getDb();

  try {
    console.log(`[Batch] ===== Processing job ${jobId} (retry ${currentRetry}/${MAX_BATCH_RETRIES}) =====`);

    // Get job
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) {
      console.error(`[Batch] Job ${jobId} not found`);
      return;
    }

    console.log(`[Batch] Job ${jobId} status: ${job.status}, offset: ${job.current_batch_offset}, processed: ${job.processed_records}/${job.total_records}, is_processing: ${job.is_processing_batch}`);

    if (job.status === 'cancelled') {
      console.log(`[Batch] Job ${jobId} is cancelled, stopping`);
      return;
    }

    if (job.status === 'completed') {
      console.log(`[Batch] Job ${jobId} is already completed, stopping`);
      return;
    }

    // Check if already processing (race condition prevention)
    if (job.is_processing_batch) {
      console.log(`[Batch] Job ${jobId} is already being processed, skipping`);
      return;
    }

    // Set processing flag
    await db.update(jobs)
      .set({ is_processing_batch: true, updated_date: new Date() })
      .where(eq(jobs.id, jobId));

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
        .set({
          status: 'completed',
          details: 'All records processed',
          is_processing_batch: false,
          updated_date: new Date()
        })
        .where(eq(jobs.id, jobId));
      await addLog('Job completed - no more records to process');
      return;
    }

    // Process batch with AI
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

    // Log detailed content info for debugging
    const contentSizes = records.map((record, idx) => {
      const content = record[instance.target_field] || '';
      return `R${idx + 1}:${content.length}ch`;
    });
    await addLog(`Content sizes: [${contentSizes.join(', ')}], Combined: ${combinedPrompt.length} chars`);
    await addLog(`Content preview: ${combinedPrompt.substring(0, 200)}...`);
    await addLog(`Sending batch to ${instance.generative_model_name} for processing...`);

    let aiResponses = [];
    try {
      const aiResult = await withTimeout(
        withRetry(async () => {
          return await callAIService(
            instance.generative_model_name,
            [
              { role: 'system', content: 'Process each record separately. Return responses in the format: [RECORD X]\n<processed content>' },
              { role: 'user', content: combinedPrompt }
            ],
            0.3
          );
        }),
        OPENAI_TIMEOUT,
        'AI processing timeout - batch may be too large or service is slow'
      );

      const fullResponse = aiResult.choices[0].message.content;
      const recordResponses = fullResponse.split(/\[RECORD \d+\]/);
      aiResponses = recordResponses.slice(1).map(r => r.trim());

      if (aiResponses.length !== records.length) {
        throw new Error(`AI returned ${aiResponses.length} responses but expected ${records.length}`);
      }

      await addLog(`AI processing completed for ${aiResponses.length} records`);

    } catch (batchError) {
      // Retry batch processing if we haven't hit max retries
      if (currentRetry < MAX_BATCH_RETRIES) {
        await addLog(`Batch AI processing failed: ${batchError.message}. Retrying (${currentRetry + 1}/${MAX_BATCH_RETRIES})...`, 'ERROR');

        await db.update(jobs).set({
          is_processing_batch: false, // Clear flag for retry
          updated_date: new Date()
        }).where(eq(jobs.id, jobId));

        // Retry with exponential backoff: 2s, 4s, 8s
        const retryDelay = Math.pow(2, currentRetry + 1) * 1000;
        setTimeout(() => processBatch(jobId, currentRetry + 1), retryDelay);
        return;
      }

      // Max retries exceeded - skip this batch
      await addLog(`Batch AI processing failed after ${MAX_BATCH_RETRIES} attempts: ${batchError.message}. Skipping batch.`, 'ERROR');

      const newOffset = job.current_batch_offset + records.length;
      const newFailedRecords = job.failed_records + records.length;

      await db.update(jobs).set({
        current_batch_offset: newOffset,
        failed_records: newFailedRecords,
        last_batch_at: new Date(),
        is_processing_batch: false, // Clear flag so next batch can start
        updated_date: new Date()
      }).where(eq(jobs.id, jobId));

      // Continue to next batch (reset retry counter)
      await addLog('Moving to next batch');
      setTimeout(() => processBatch(jobId, 0), 1000);
      return;
    }

    // Generate all embeddings in parallel for speed
    let embeddingsByIndex = {};
    if (instance.vector_field_name) {
      await addLog('Generating embeddings for all records in parallel...');

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingPromises = aiResponses.map(async (processedContent, idx) => {
        try {
          const embeddingResult = await withTimeout(
            withRetry(async () => {
              return await openai.embeddings.create({
                model: instance.embedding_model_name,
                input: processedContent
              });
            }),
            60000,
            'Embedding generation timeout'
          );
          return { idx, embedding: embeddingResult.data[0].embedding };
        } catch (error) {
          console.error(`Embedding failed for record ${idx}:`, error);
          return { idx, embedding: null, error: error.message };
        }
      });

      const embeddingResults = await Promise.all(embeddingPromises);
      embeddingResults.forEach(result => {
        embeddingsByIndex[result.idx] = result.embedding;
      });

      await addLog(`Generated ${embeddingResults.filter(r => r.embedding).length} embeddings`);
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

        const updatedRecord = {
          ...record,
          [instance.target_field]: updatedContent,
          changed_flag: 'done' // Mark as processed so it won't be picked up again
        };

        // Add pre-generated embedding
        if (instance.vector_field_name) {
          if (embeddingsByIndex[i]) {
            updatedRecord[instance.vector_field_name] = embeddingsByIndex[i];
            await addLog(`Record ${recordId}: Embedding added (${embeddingsByIndex[i].length} dims)`);
          } else {
            throw new Error('Embedding generation failed for this record');
          }
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
      is_processing_batch: false, // Clear flag so next batch can start
      updated_date: new Date()
    }).where(eq(jobs.id, jobId));

    await addLog(`Batch complete: ${successCount} succeeded, ${failCount} failed`);
    console.log(`[Batch] Job ${jobId} - Batch complete. New offset: ${newOffset}, Processed: ${newProcessed}/${job.total_records}`);

    // Check if we're done
    if (newProcessed + newFailed >= job.total_records) {
      await db.update(jobs).set({
        status: 'completed',
        details: `Completed: ${newProcessed} processed, ${newFailed} failed`,
        updated_date: new Date()
      }).where(eq(jobs.id, jobId));
      await addLog(`Job completed: ${newProcessed} records processed, ${newFailed} failed`);
      console.log(`[Batch] Job ${jobId} - COMPLETED. Total: ${newProcessed} processed, ${newFailed} failed`);
      return;
    }

    console.log(`[Batch] Job ${jobId} - Scheduling next batch in 1 second...`);
    // Continue immediately with setTimeout (fast), reset retry counter for next batch
    // If setTimeout is lost (timeout/restart), scheduler will resume within 60s (reliable)
    setTimeout(() => processBatch(jobId, 0), 1000);

  } catch (error) {
    console.error(`[Batch] Job ${jobId} processing error:`, error);

    try {
      await db.update(jobs).set({
        status: 'failed',
        details: error.message,
        is_processing_batch: false, // Clear flag on error
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
