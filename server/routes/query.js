import express from 'express';
import OpenAI from 'openai';
import { getDb } from '../db/client.js';
import { databaseInstances } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Run a query against a Zilliz instance
router.post('/', requireAuth, async (req, res) => {
  try {
    const { instance_id, search_term } = req.body;

    if (!instance_id || !search_term) {
      return res.status(400).json({ error: 'Missing instance_id or search_term' });
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

    if (instance.instance_type !== 'query') {
      return res.status(400).json({ error: 'Instance is not a query type' });
    }

    console.log(`Query instance: ${instance.name}, search: "${search_term}"`);

    // Initialize OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Generate embedding for search term
    const embeddingResponse = await openai.embeddings.create({
      model: instance.embedding_model_name,
      input: search_term
    });

    const searchVector = embeddingResponse.data[0].embedding;

    // Query Zilliz
    const zillizUrl = `${instance.zilliz_endpoint}/v2/vectordb/entities/search`;
    const queryPayload = {
      collectionName: instance.collection_name,
      data: [searchVector],  // Zilliz v2 API expects vectors in a data array
      limit: instance.top_k || 5,
      outputFields: ['*']
    };

    console.log(`Querying Zilliz: ${zillizUrl}`);

    const zillizResponse = await fetch(zillizUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instance.zilliz_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryPayload)
    });

    if (!zillizResponse.ok) {
      const errorText = await zillizResponse.text();
      console.error('Zilliz error:', errorText);
      return res.status(500).json({
        error: `Zilliz API error: ${errorText}`
      });
    }

    let responseText = await zillizResponse.text();
    // Handle large IDs by converting them to strings
    responseText = responseText.replace(/"id":\s*(\d{15,})/g, '"id":"$1"');
    const zillizData = JSON.parse(responseText);

    console.log('Zilliz raw response:', JSON.stringify(zillizData, null, 2));

    const results = zillizData.data || [];

    console.log(`Found ${results.length} results`);

    res.json({
      data: {
        results,
        debug_info: {
          zilliz_url: zillizUrl,
          zilliz_query: {
            collectionName: queryPayload.collectionName,
            limit: queryPayload.limit,
            outputFields: queryPayload.outputFields,
            vectorCount: queryPayload.data.length
          },
          embedding_vector_length: searchVector.length,
          zilliz_response_code: zillizResponse.status
        }
      }
    });

  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
