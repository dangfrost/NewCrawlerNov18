import express from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pLimit from 'p-limit';
import { getDb, generateId } from '../db/client.js';
import { databaseInstances, jobs, jobLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const BATCH_SIZE = 25; // Increased for better throughput with parallel AI processing
const MAX_CONTENT_LENGTH = 100000; // Increased to handle larger content (max seen: 62k chars)
const OPENAI_TIMEOUT = 60000; // 60 seconds base timeout (30s was too aggressive for large content)
const MAX_RETRIES = 3;
const CLEAN_THRESHOLD = 0.15; // If <15% of content remains after language removal, consider it "clean" (skip AI)

// Top 300 most common words for each supported language
const COMMON_WORDS = {
  en: new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with',
    'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
    'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him',
    'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
    'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
    'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give',
    'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had', 'were', 'said', 'did', 'having', 'may',
    'should', 'am', 'being', 'can', 'could', 'would', 'will', 'shall', 'might', 'must', 'ought',
    'very', 'here', 'where', 'why', 'how', 'when', 'who', 'what', 'which', 'whose', 'whom',
    'man', 'woman', 'child', 'person', 'people', 'family', 'friend', 'group', 'government', 'company',
    'number', 'part', 'place', 'case', 'fact', 'hand', 'eye', 'life', 'world', 'house', 'point', 'thing',
    'tell', 'call', 'try', 'ask', 'need', 'feel', 'become', 'leave', 'put', 'mean', 'keep', 'let', 'begin',
    'seem', 'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe', 'hold', 'bring', 'happen',
    'write', 'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead',
    'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'read', 'spend', 'grow', 'open', 'walk', 'win',
    'teach', 'offer', 'remember', 'consider', 'appear', 'buy', 'serve', 'die', 'send', 'expect', 'build',
    'stay', 'fall', 'cut', 'reach', 'kill', 'raise', 'pass', 'sell', 'decide', 'return', 'explain', 'hope',
    'develop', 'carry', 'break', 'receive', 'agree', 'support', 'hit', 'produce', 'eat', 'cover', 'catch',
    'draw', 'choose', 'cause', 'point', 'identify', 'turn', 'listen', 'buy', 'pick', 'wear', 'introduce'
  ]),

  fr: new Set([
    'le', 'de', 'un', 'être', 'et', 'à', 'il', 'avoir', 'ne', 'je', 'son', 'que', 'se', 'qui', 'ce',
    'dans', 'en', 'du', 'elle', 'au', 'pour', 'pas', 'que', 'vous', 'par', 'sur', 'faire', 'plus', 'dire',
    'me', 'on', 'mon', 'lui', 'nous', 'comme', 'mais', 'pouvoir', 'avec', 'tout', 'y', 'aller', 'voir',
    'en', 'bien', 'où', 'sans', 'tu', 'ou', 'leur', 'homme', 'si', 'deux', 'moi', 'vouloir', 'te', 'là',
    'dont', 'autre', 'celui', 'votre', 'très', 'ni', 'jour', 'même', 'aussi', 'savoir', 'notre', 'temps',
    'peu', 'chose', 'ses', 'tant', 'encore', 'tous', 'venir', 'monde', 'croire', 'grand', 'main', 'premier',
    'car', 'donc', 'toujours', 'dire', 'avant', 'quelque', 'année', 'France', 'trop', 'rendre', 'tenir',
    'prendre', 'sous', 'vie', 'puis', 'mettre', 'entre', 'moins', 'fois', 'contre', 'parler', 'après',
    'donner', 'quel', 'trouver', 'heure', 'bon', 'falloir', 'demander', 'sentir', 'nouvelle', 'pays', 'moment',
    'alors', 'cas', 'suite', 'part', 'devenir', 'sembler', 'vers', 'dès', 'reste', 'ainsi', 'raison', 'jeune',
    'femme', 'cela', 'enfant', 'passer', 'point', 'soit', 'chaque', 'quelqu', 'père', 'seulement', 'esprit',
    'laisser', 'regard', 'besoin', 'présent', 'comprendre', 'ville', 'lever', 'seul', 'chez', 'devant', 'entendre',
    'fond', 'famille', 'tant', 'cœur', 'place', 'certain', 'ensemble', 'arriver', 'depuis', 'vivre', 'quand',
    'lieu', 'reprendre', 'penser', 'arrêter', 'rentrer', 'long', 'mourir', 'effet', 'connaître', 'nombre',
    'personne', 'aujourd', 'sortir', 'rester', 'ouvrir', 'loi', 'œil', 'travers', 'hui', 'mois', 'porter',
    'attendre', 'suivre', 'tomber', 'écrire', 'garder', 'beau', 'devoir', 'forme', 'cause', 'merci', 'ami',
    'jamais', 'toute', 'côté', 'dernier', 'fin', 'face', 'exemple', 'voix', 'appeler', 'mieux', 'retourner',
    'besoin', 'question', 'matin', 'quitter', 'servir', 'entrer', 'revenir', 'soir', 'vue', 'répondre', 'obtenir',
    'groupe', 'manière', 'société', 'agir', 'corps', 'aimer', 'montrer', 'reconnaître', 'blanc', 'politique',
    'suivant', 'jouer', 'permettre', 'assez', 'mener', 'fille', 'début', 'changer', 'continuer', 'produire'
  ]),

  de: new Set([
    'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im',
    'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie',
    'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über', 'einen', 'so', 'zum',
    'war', 'haben', 'nur', 'oder', 'aber', 'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein', 'wurde', 'sei',
    'in', 'prozent', 'hatte', 'kann', 'gegen', 'vom', 'können', 'schon', 'wenn', 'habe', 'seine', 'mark',
    'ihre', 'dann', 'unter', 'wir', 'soll', 'ich', 'eines', 'es', 'jahr', 'zwei', 'jahren', 'diese', 'dieser',
    'wieder', 'keine', 'seinem', 'ob', 'dir', 'allen', 'großen', 'bereits', 'damit', 'da', 'seit', 'können',
    'dies', 'all', 'doch', 'worden', 'dazu', 'gehabt', 'menschen', 'zeit', 'land', 'ihm', 'heute', 'teil',
    'gut', 'neue', 'seite', 'dabei', 'gewesen', 'dr', 'ohne', 'jedoch', 'selbst', 'ersten', 'nun', 'leben',
    'ende', 'anderen', 'ja', 'gemacht', 'während', 'tag', 'zwischen', 'immer', 'deutscher', 'ganz', 'deinem',
    'stelle', 'neuen', 'fall', 'vor', 'deutsche', 'drei', 'werk', 'dort', 'staat', 'kein', 'etwas', 'deutschland',
    'welt', 'sollte', 'liegt', 'wohl', 'gleichzeitig', 'weitere', 'weg', 'geben', 'tage', 'macht', 'kommt',
    'frage', 'haus', 'erst', 'hand', 'gleich', 'stehen', 'einzelnen', 'weil', 'ihnen', 'außerdem', 'späteren',
    'mann', 'frau', 'stelle', 'lässt', 'musik', 'gegeben', 'seines', 'meter', 'allein', 'gerade', 'weise',
    'beiden', 'ihrem', 'wenig', 'trotz', 'gehen', 'sogar', 'gar', 'sehen', 'setzen', 'kleinen', 'wissen',
    'letzte', 'anderen', 'bald', 'wegen', 'bleiben', 'zeigen', 'lassen', 'meisten', 'scheint', 'finden',
    'neben', 'zweiten', 'gebracht', 'kommen', 'hinter', 'denen', 'entwicklung', 'warum', 'oft', 'ebenso',
    'nächsten', 'gute', 'statt', 'kunst', 'ersten', 'darin', 'deutlich', 'zunächst', 'ihres', 'führen',
    'bekannt', 'nie', 'fest', 'darauf', 'gilt', 'große', 'vielen', 'erreichen', 'tun', 'aller', 'einmal',
    'gegenüber', 'genannt', 'erhalten', 'wahr', 'zwar', 'besonders', 'schließlich', 'wollen', 'dessen', 'gab'
  ]),

  pt: new Set([
    'o', 'a', 'de', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na',
    'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou',
    'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso',
    'ela', 'entre', 'era', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles',
    'estão', 'você', 'tinha', 'foram', 'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos',
    'elas', 'havia', 'seja', 'qual', 'será', 'nós', 'tenho', 'lhe', 'deles', 'essas', 'esses', 'pelas', 'este',
    'fosse', 'dele', 'tu', 'te', 'vocês', 'vos', 'lhes', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas', 'nosso',
    'nossa', 'nossos', 'nossas', 'dela', 'delas', 'esta', 'estes', 'estas', 'aquele', 'aquela', 'aqueles',
    'aquelas', 'isto', 'aquilo', 'estou', 'está', 'estamos', 'estão', 'estive', 'esteve', 'estivemos', 'estiveram',
    'estava', 'estávamos', 'estavam', 'estivera', 'estivéramos', 'esteja', 'estejamos', 'estejam', 'estivesse',
    'estivéssemos', 'estivessem', 'estiver', 'estivermos', 'estiverem', 'hei', 'há', 'havemos', 'hão', 'houve',
    'houvemos', 'houveram', 'houvera', 'houvéramos', 'haja', 'hajamos', 'hajam', 'houvesse', 'houvéssemos',
    'houvessem', 'houver', 'houvermos', 'houverem', 'houverei', 'houverá', 'houveremos', 'houverão', 'houveria',
    'houveríamos', 'houveriam', 'sou', 'somos', 'são', 'era', 'éramos', 'eram', 'fui', 'foi', 'fomos', 'foram',
    'fora', 'fôramos', 'seja', 'sejamos', 'sejam', 'fosse', 'fôssemos', 'fossem', 'for', 'formos', 'forem',
    'serei', 'será', 'seremos', 'serão', 'seria', 'seríamos', 'seriam', 'tenho', 'tem', 'temos', 'tém', 'tinha',
    'tínhamos', 'tinham', 'tive', 'teve', 'tivemos', 'tiveram', 'tivera', 'tivéramos', 'tenha', 'tenhamos',
    'tenham', 'tivesse', 'tivéssemos', 'tivessem', 'tiver', 'tivermos', 'tiverem', 'terei', 'terá', 'teremos',
    'terão', 'teria', 'teríamos', 'teriam', 'fazer', 'dizer', 'ir', 'dar', 'ver', 'saber', 'poder', 'querer'
  ])
};

// Detect which languages are present in a sentence based on common word frequency
// Returns array of detected language codes (e.g., ['en', 'fr'])
function detectSentenceLanguages(sentence, languagesToCheck = ['en', 'fr', 'de', 'pt']) {
  // Extract words (lowercase, handle accented characters)
  const words = sentence.toLowerCase().match(/\b[\wàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]+\b/g) || [];
  if (words.length < 3) return []; // Too short to determine

  const detectedLanguages = [];

  // Check each language
  for (const lang of languagesToCheck) {
    const wordSet = COMMON_WORDS[lang];
    if (!wordSet) continue;

    // Count how many words match this language
    const matchCount = words.filter(word => wordSet.has(word)).length;
    const matchRatio = matchCount / words.length;

    // If >40% of words are common in this language, consider it detected
    if (matchRatio > 0.4) {
      detectedLanguages.push(lang);
    }
  }

  return detectedLanguages;
}

// Pass 1: Programmatic language filtering using word frequency detection
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
        sentencesRemoved: 0,
        languageCounts: {}
      }
    };
  }

  const originalLength = text.length;

  // Split into sentences (improved regex to capture all text)
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const matchedSentences = text.match(sentenceRegex) || [];

  // If there's remaining text without ending punctuation, add it
  const lastMatchEnd = matchedSentences.join('').length;
  const remainingText = text.substring(lastMatchEnd).trim();
  const sentences = remainingText ? [...matchedSentences, remainingText] : matchedSentences;

  // Fallback if no sentences found
  if (sentences.length === 0) {
    sentences.push(text);
  }

  const originalSentenceCount = sentences.length;

  const keptSentences = [];
  const removedSentences = [];
  const languageCounts = {};

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 3) {
      // Too short - keep it
      keptSentences.push(sentence);
      continue;
    }

    // Detect which languages are in this sentence
    const detectedLanguages = detectSentenceLanguages(trimmed);

    // Track language counts
    if (detectedLanguages.length === 0) {
      languageCounts['other'] = (languageCounts['other'] || 0) + 1;
    } else {
      for (const lang of detectedLanguages) {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    }

    // Check if sentence should be removed (matches any language in removal list)
    const shouldRemove = detectedLanguages.some(lang => languagesToRemove.includes(lang));

    if (shouldRemove) {
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
      sentencesRemoved: removedSentences.length,
      languageCounts // e.g., { en: 125, fr: 23, other: 50 }
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
      console.log(`[Gemini] Model: ${modelName}, Prompt size: ${prompt.length} chars`);

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

// Dry run - process one record and show two-pass processing results
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
    const hasTag = !!match;
    if (hasTag) {
      contentToProcess = match[1];
    }

    if (contentToProcess.length > MAX_CONTENT_LENGTH) {
      contentToProcess = contentToProcess.substring(0, MAX_CONTENT_LENGTH);
    }

    // ===== PASS 1: Language Filtering =====
    const enableTwoPass = instance.enable_two_pass !== false;
    const languagesToRemove = (instance.languages_to_remove || 'en').split(',').map(l => l.trim());

    let pass1Result = null;
    let needsAI = true;
    let contentForAI = contentToProcess;

    if (enableTwoPass) {
      console.log(`Pass 1: Removing languages: ${languagesToRemove.join(', ')}`);
      pass1Result = removeLanguageSentences(contentToProcess, languagesToRemove);
      needsAI = pass1Result.stats.percentRemaining > CLEAN_THRESHOLD;
      contentForAI = pass1Result.cleanedText;

      console.log(`Pass 1 complete: ${pass1Result.stats.sentencesRemoved} sentences removed (${Math.round((1 - pass1Result.stats.percentRemaining) * 100)}%)`);
      console.log(`AI needed: ${needsAI ? 'YES' : 'NO'} (${Math.round(pass1Result.stats.percentRemaining * 100)}% content remaining)`);
    }

    // ===== PASS 2: AI Processing (if needed) =====
    let processedContent = contentForAI;
    let aiSkipped = !needsAI;

    if (needsAI) {
      const promptWithContent = instance.prompt.replace(/\{\{FIELD_VALUE\}\}/g, contentForAI);
      console.log(`Pass 2: Sending to ${instance.generative_model_name} for AI processing...`);

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

      processedContent = aiResult.choices[0].message.content.trim();
      console.log('Pass 2 complete: AI processing done');
    } else {
      console.log('Pass 2 skipped: Content sufficiently cleaned by Pass 1');
    }

    // Generate embedding for final content
    let embedding = null;
    if (instance.vector_field_name) {
      console.log('Generating embedding for final content...');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingResult = await withTimeout(
        withRetry(async () => {
          return await openai.embeddings.create({
            model: instance.embedding_model_name,
            input: processedContent
          });
        }),
        60000,
        'Embedding generation timeout - OpenAI took longer than 60 seconds'
      );
      embedding = embeddingResult.data[0].embedding;
      console.log(`Embedding generated: ${embedding.length} dimensions`);
    }

    // Return comprehensive two-pass results
    console.log('Dry run complete, sending response');
    res.json({
      success: true,
      record_id: record[instance.primary_key_field],
      two_pass_enabled: enableTwoPass,

      // Backward compatibility for existing UI
      before: {
        content: contentToProcess,
        record_id: record[instance.primary_key_field]
      },

      after: {
        content: processedContent,
        embedding_dimensions: embedding ? embedding.length : null
      },

      metadata: {
        model: needsAI ? instance.generative_model_name : 'Pass 1 only (no AI)',
        embedding_model: instance.embedding_model_name,
        prompt_used: instance.prompt
      },

      // Detailed two-pass breakdown (new fields)
      original: {
        content: contentToProcess,
        length: contentToProcess.length,
        had_tags: hasTag
      },

      pass1: enableTwoPass ? {
        enabled: true,
        languages_removed: languagesToRemove,
        stats: {
          sentences_total: pass1Result.stats.sentencesOriginal,
          language_counts: pass1Result.stats.languageCounts,
          sentences_removed: pass1Result.stats.sentencesRemoved,
          sentences_kept: pass1Result.stats.sentencesKept,
          chars_original: pass1Result.stats.original,
          chars_after_filtering: pass1Result.stats.cleaned,
          chars_removed: pass1Result.stats.removed,
          percent_remaining: Math.round(pass1Result.stats.percentRemaining * 100)
        },
        cleaned_content: pass1Result.cleanedText,
        fully_cleaned: !needsAI
      } : {
        enabled: false,
        message: 'Two-pass processing disabled for this instance'
      },

      pass2: {
        needed: needsAI,
        skipped: aiSkipped,
        model_used: needsAI ? instance.generative_model_name : null,
        content: needsAI ? processedContent : null,
        reason: aiSkipped ? `Content ${Math.round(pass1Result.stats.percentRemaining * 100)}% remaining after Pass 1 (threshold: ${CLEAN_THRESHOLD * 100}%)` : null
      },

      final: {
        content: processedContent,
        length: processedContent.length,
        embedding_dimensions: embedding ? embedding.length : null,
        processing_path: aiSkipped ? 'Pass 1 only (programmatic)' : 'Pass 1 + Pass 2 (AI)'
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
  const batchStartTime = Date.now();
  const BATCH_TIMEOUT_MS = 240000; // 4 minutes (safe margin under Railway's 5 min timeout)

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

    // Start job if pending and get total record count
    let totalRecordsToProcess = job.total_records || 0; // Use existing count if job is already running
    console.log(`[Batch] Initial totalRecordsToProcess from job.total_records: ${totalRecordsToProcess}`);

    if (job.status === 'pending') {
      // Get BOTH total record count AND filtered count
      await addLog('Counting records in collection...');

      // First, count ALL records (no filter)
      const allRecordsQuery = {
        collectionName: instance.collection_name,
        filter: '', // No filter - count everything
        offset: 0,
        limit: 16384, // Zilliz max limit
        outputFields: [instance.primary_key_field]
      };

      const allRecordsResponse = await zillizApiCall(
        instance.zilliz_endpoint,
        instance.zilliz_token,
        '/v2/vectordb/entities/query',
        allRecordsQuery
      );
      const totalAllRecords = allRecordsResponse.data?.length || 0;

      // Then count filtered records (in scope)
      const filteredQuery = {
        collectionName: instance.collection_name,
        filter: instance.query_filter || '',
        offset: 0,
        limit: 16384, // Zilliz max limit
        outputFields: [instance.primary_key_field, 'changed_flag']
      };

      try {
        const filteredResponse = await zillizApiCall(
          instance.zilliz_endpoint,
          instance.zilliz_token,
          '/v2/vectordb/entities/query',
          filteredQuery
        );
        totalRecordsToProcess = filteredResponse.data?.length || 0;

        await addLog(`📊 Collection Stats:`);
        await addLog(`  • All records in collection: ${totalAllRecords}`);
        await addLog(`  • Records matching filter: ${totalRecordsToProcess}`);
        await addLog(`  • Records to skip (already done): ${totalAllRecords - totalRecordsToProcess}`);
        await addLog(`  • Filter being used: "${instance.query_filter || 'no filter'}"`);

        // Debug: Check changed_flag distribution
        if (filteredResponse.data && filteredResponse.data.length > 0) {
          const flagStats = filteredResponse.data.reduce((acc, r) => {
            const flag = r.changed_flag || 'not_set';
            acc[flag] = (acc[flag] || 0) + 1;
            return acc;
          }, {});
          await addLog(`  • Changed_flag distribution in scope: ${JSON.stringify(flagStats)}`);
        }

        // Update job with total count
        await db.update(jobs)
          .set({
            status: 'running',
            started_at: new Date(),
            total_records: totalRecordsToProcess,
            updated_date: new Date()
          })
          .where(eq(jobs.id, jobId));
        await addLog('Job started');
      } catch (countError) {
        await addLog(`Warning: Could not get total count: ${countError.message}`, 'ERROR');
        await db.update(jobs)
          .set({ status: 'running', started_at: new Date(), updated_date: new Date() })
          .where(eq(jobs.id, jobId));
        await addLog('Job started (without total count)');
      }
    }

    // Fetch batch
    await addLog(`Fetching batch at offset ${job.current_batch_offset} (batch size: ${BATCH_SIZE})`);
    await addLog(`Using filter: "${instance.query_filter || 'no filter'}"`);

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

    // Debug: Check changed_flag values in fetched records
    if (records.length > 0) {
      const flagCounts = records.reduce((acc, r) => {
        const flag = r.changed_flag || 'null';
        acc[flag] = (acc[flag] || 0) + 1;
        return acc;
      }, {});
      await addLog(`Changed_flag values in batch: ${JSON.stringify(flagCounts)}`);
    }

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

    // ===== TWO-PASS PROCESSING =====
    // Pass 1: Programmatic language filtering (FREE, INSTANT)
    // Pass 2: AI refinement for remaining content (PAID, only if needed)

    const enableTwoPass = instance.enable_two_pass !== false; // Default to true
    const languagesToRemove = (instance.languages_to_remove || 'en').split(',').map(l => l.trim());

    await addLog(`Two-pass processing: ${enableTwoPass ? 'ENABLED' : 'DISABLED'}`);
    await addLog(`Languages to remove: ${languagesToRemove.join(', ')}`);

    // Prepare records and run Pass 1
    const recordsWithPass1 = records.map((record, idx) => {
      let content = record[instance.target_field] || '';
      const tagRegex = /\[pagecontent\](.*?)\[\/pagecontent\]/gs;
      const match = tagRegex.exec(content);
      const hasTag = !!match;
      if (hasTag) {
        content = match[1];
      }

      // Truncate if too large (safety limit)
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH);
      }

      // Run Pass 1: Remove target language sentences
      let pass1Result = null;
      let needsAI = true;

      if (enableTwoPass) {
        pass1Result = removeLanguageSentences(content, languagesToRemove);
        needsAI = pass1Result.stats.percentRemaining > CLEAN_THRESHOLD;
      }

      return {
        record,
        idx,
        originalContent: content,
        hasTag,
        pass1Result,
        needsAI: enableTwoPass ? needsAI : true,
        pass1Cleaned: enableTwoPass ? !needsAI : false
      };
    });

    // Separate into clean (Pass 1 only) and AI-needed records
    const cleanRecords = recordsWithPass1.filter(r => r.pass1Cleaned);
    const aiNeededRecords = recordsWithPass1.filter(r => r.needsAI);

    await addLog(`Pass 1 complete: ${cleanRecords.length} clean (no AI needed), ${aiNeededRecords.length} need AI refinement`);

    // Log detailed Pass 1 stats for each record
    for (const r of recordsWithPass1) {
      if (r.pass1Result) {
        const stats = r.pass1Result.stats;
        const percentRemoved = Math.round((1 - stats.percentRemaining) * 100);
        const langCounts = Object.entries(stats.languageCounts || {})
          .map(([lang, count]) => `${lang}:${count}`)
          .join(', ');
        await addLog(`R${r.idx + 1}: ${stats.sentencesOriginal} sentences (${langCounts}) | Removed ${stats.sentencesRemoved} (${percentRemoved}%), kept ${stats.percentRemaining * 100}%`);
      }
    }

    // Log detailed content info
    const contentSizes = recordsWithPass1.map(r =>
      `R${r.idx + 1}:${r.originalContent.length}ch${r.pass1Cleaned ? '✓' : '→AI'}`
    );
    await addLog(`Content sizes: [${contentSizes.join(', ')}]`);

    // ===== PASS 2: AI PROCESSING (only for records that need it) =====
    const aiResponsesByIdx = {}; // Map idx -> AI response

    if (aiNeededRecords.length > 0) {
      await addLog(`Sending ${aiNeededRecords.length} records to ${instance.generative_model_name} for Pass 2 AI refinement...`);

      // Check if batch prompt is too large for efficient processing
      const batchPrompts = aiNeededRecords.map((r, batchIdx) => {
        const contentForAI = enableTwoPass ? r.pass1Result.cleanedText : r.originalContent;
        const promptWithContent = instance.prompt.replace(/\{\{FIELD_VALUE\}\}/g, contentForAI);
        return { idx: r.idx, prompt: promptWithContent, content: contentForAI };
      });

      const combinedPromptTest = batchPrompts.map((p, i) => `[RECORD ${i + 1}]\n${p.prompt}`).join('\n\n---\n\n');
      const combinedPromptSize = combinedPromptTest.length;
      await addLog(`Pass 2 combined prompt: ${combinedPromptSize} chars`);

      // If combined prompt >50k chars, process individually to avoid timeouts
      const processIndividually = combinedPromptSize > 50000;

      if (processIndividually) {
        await addLog(`Large batch detected (${combinedPromptSize} chars) - processing records in parallel for improved speed`);

        // Adjust concurrency based on average content size
        const avgContentSize = combinedPromptSize / batchPrompts.length;
        const concurrency = avgContentSize > 30000 ? 5 : 8; // Increased - Gemini handles high concurrency well

        // Use parallel processing with concurrency limit
        const limit = pLimit(concurrency);
        await addLog(`Using concurrency limit of ${concurrency} for content avg size ${Math.round(avgContentSize)} chars`);

        const aiPromises = batchPrompts.map(({ idx, prompt, content }, arrayIdx) =>
          limit(async () => {
            const startTime = Date.now();
            try {
              // Add small delay between requests to avoid rate limits
              if (arrayIdx > 0) {
                await new Promise(resolve => setTimeout(resolve, 100 * Math.min(arrayIdx, 5)));
              }

              // Adaptive timeout based on content size
              const contentSize = prompt.length;
              const timeoutMs = Math.max(
                30000, // Minimum 30 seconds
                Math.min(
                  180000, // Maximum 180 seconds (3 minutes)
                  Math.round(contentSize * 6) // ~6ms per character (increased from 4ms)
                )
              );

              const aiResult = await withTimeout(
                withRetry(async () => {
                  return await callAIService(
                    instance.generative_model_name,
                    [{ role: 'user', content: prompt }],
                    0.3
                  );
                }, 2, 1000), // Reduced retries to 2 with 1s delay
                timeoutMs,
                `AI processing timeout for individual record (${Math.round(timeoutMs/1000)}s timeout)`
              );

              aiResponsesByIdx[idx] = aiResult.choices[0].message.content.trim();
              const duration = Math.round((Date.now() - startTime) / 1000);
              await addLog(`Record ${idx + 1}/${batchPrompts.length} processed in ${duration}s`);
              return { idx, success: true, duration };
            } catch (error) {
              const duration = Math.round((Date.now() - startTime) / 1000);
              await addLog(`Record ${idx + 1} failed after ${duration}s: ${error.message}`, 'ERROR');
              return { idx, success: false, error: error.message, duration };
            }
          })
        );

        const results = await Promise.all(aiPromises);
        const successCount = results.filter(r => r.success).length;
        const totalDuration = Math.max(...results.map(r => r.duration || 0));

        await addLog(`Pass 2 complete: AI processed ${successCount}/${batchPrompts.length} records in parallel (${totalDuration}s total)`);

      } else {
        // Process as batch (original logic)
        const combinedPrompt = batchPrompts.map((p, i) => `[RECORD ${i + 1}]\n${p.prompt}`).join('\n\n---\n\n');

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
          const aiResponses = recordResponses.slice(1).map(r => r.trim());

          if (aiResponses.length !== aiNeededRecords.length) {
            throw new Error(`AI returned ${aiResponses.length} responses but expected ${aiNeededRecords.length}`);
          }

          // Map AI responses back to original indices
          aiNeededRecords.forEach((r, batchIdx) => {
            aiResponsesByIdx[r.idx] = aiResponses[batchIdx];
          });

          await addLog(`Pass 2 complete: AI processed ${aiResponses.length} records as batch`);

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
      }
    } else {
      await addLog('No AI processing needed - all records cleaned by Pass 1');
    }

    // ===== GENERATE EMBEDDINGS =====
    // Generate embeddings for final processed content (Pass 1 or Pass 2 results)
    let embeddingsByIdx = {};
    if (instance.vector_field_name) {
      await addLog('Generating embeddings for all records with rate limiting...');

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingLimit = pLimit(5); // OpenAI can handle more concurrent requests

      const embeddingPromises = recordsWithPass1.map(async (r, idx) => {
        // Get final content: AI result if available, otherwise Pass 1 result or original
        let finalContent;
        if (aiResponsesByIdx[r.idx]) {
          finalContent = aiResponsesByIdx[r.idx];
        } else if (r.pass1Result) {
          finalContent = r.pass1Result.cleanedText;
        } else {
          finalContent = r.originalContent;
        }

        return embeddingLimit(async () => {
          try {
            // Add small delay to avoid rate limits
            if (idx > 0) {
              await new Promise(resolve => setTimeout(resolve, 50 * Math.min(idx, 10)));
            }

            const embeddingResult = await withTimeout(
              withRetry(async () => {
                return await openai.embeddings.create({
                  model: instance.embedding_model_name,
                  input: finalContent.substring(0, 8192) // Ensure content isn't too long
                });
              }, 2, 500), // 2 retries with 500ms delay
              15000, // 15 second timeout
              'Embedding generation timeout'
            );

            return { idx: r.idx, embedding: embeddingResult.data[0].embedding };
          } catch (error) {
            console.error(`Embedding failed for record ${r.idx}:`, error.message);
            // Return null embedding but don't fail the entire batch
            return { idx: r.idx, embedding: null, error: error.message };
          }
        });
      });

      const embeddingResults = await Promise.all(embeddingPromises);
      let embeddingSuccessCount = 0;

      embeddingResults.forEach(result => {
        if (result.embedding) {
          embeddingsByIdx[result.idx] = result.embedding;
          embeddingSuccessCount++;
        }
      });

      await addLog(`Generated ${embeddingSuccessCount}/${embeddingResults.length} embeddings successfully`);

      // Log any failures for debugging
      const failures = embeddingResults.filter(r => !r.embedding);
      if (failures.length > 0) {
        await addLog(`Embedding failures: ${failures.map(f => `#${f.idx}`).join(', ')}`, 'ERROR');
      }
    }

    // ===== CHECK RAILWAY TIMEOUT =====
    // Check if we're approaching Railway's timeout limit
    const elapsedTime = Date.now() - batchStartTime;
    if (elapsedTime > BATCH_TIMEOUT_MS) {
      await addLog(`Approaching Railway timeout (${Math.round(elapsedTime/1000)}s elapsed) - scheduling next batch to avoid timeout`);
      console.log(`[Batch] Job ${jobId} - Approaching Railway timeout, continuing in next batch`);

      // Update job state and schedule next batch
      await db.update(jobs)
        .set({
          is_processing_batch: false,
          last_batch_at: new Date(),
          updated_date: new Date()
        })
        .where(eq(jobs.id, jobId));

      setTimeout(() => processBatch(jobId, 0), 1000);
      return;
    }

    // ===== UPDATE RECORDS IN ZILLIZ (Batched) =====
    let successCount = 0;
    let failCount = 0;
    let pass1CleanedCount = 0;
    let pass2ProcessedCount = 0;
    let failedRecordDetails = [];

    // Prepare all updated records first
    const updatedRecords = [];
    const recordIds = [];

    for (const r of recordsWithPass1) {
      const record = r.record;
      const recordId = record[instance.primary_key_field];
      recordIds.push(recordId);

      try {
        // Determine final processed content
        let processedContent;
        if (aiResponsesByIdx[r.idx]) {
          processedContent = aiResponsesByIdx[r.idx];
          pass2ProcessedCount++;
        } else if (r.pass1Result) {
          processedContent = r.pass1Result.cleanedText;
          pass1CleanedCount++;
        } else {
          processedContent = r.originalContent;
        }

        // Reconstruct with tags if original had them
        let updatedContent = processedContent;
        const originalContent = record[instance.target_field] || '';
        const tagRegex = /\[pagecontent\](.*?)\[\/pagecontent\]/gs;

        if (tagRegex.test(originalContent)) {
          updatedContent = originalContent.replace(tagRegex, `[pagecontent]${processedContent}[/pagecontent]`);
        }

        const updatedRecord = {
          ...record,
          [instance.target_field]: updatedContent,
          changed_flag: 'done'
        };

        // Add embedding if available
        if (instance.vector_field_name && embeddingsByIdx[r.idx]) {
          updatedRecord[instance.vector_field_name] = embeddingsByIdx[r.idx];
        }

        updatedRecords.push(updatedRecord);
        successCount++;
      } catch (error) {
        failCount++;
        failedRecordDetails.push({ recordId, error: error.message });
      }
    }

    // Batch delete all old records
    if (recordIds.length > 0) {
      try {
        const filterExpr = recordIds.map(id => `${instance.primary_key_field} == "${id}"`).join(' || ');
        await zillizApiCall(
          instance.zilliz_endpoint,
          instance.zilliz_token,
          '/v2/vectordb/entities/delete',
          { collectionName: instance.collection_name, filter: filterExpr }
        );
      } catch (error) {
        await addLog(`Batch delete failed: ${error.message}`, 'ERROR');
      }
    }

    // Batch insert all updated records
    if (updatedRecords.length > 0) {
      try {
        await zillizApiCall(
          instance.zilliz_endpoint,
          instance.zilliz_token,
          '/v2/vectordb/entities/insert',
          { collectionName: instance.collection_name, data: updatedRecords }
        );
        await addLog(`✓ Batch updated ${updatedRecords.length} records in Zilliz`);
      } catch (error) {
        await addLog(`Batch insert failed: ${error.message}`, 'ERROR');
        failCount += updatedRecords.length;
        successCount = 0;
      }
    }

    // Update job progress with two-pass statistics
    const newOffset = job.current_batch_offset + records.length;
    const newProcessed = job.processed_records + successCount;
    const newFailed = job.failed_records + failCount;
    const newPass1Processed = (job.pass1_processed || 0) + records.length;
    const newPass1Cleaned = (job.pass1_cleaned || 0) + pass1CleanedCount;
    const newPass2Needed = (job.pass2_needed || 0) + pass2ProcessedCount;
    const newPass2Processed = (job.pass2_processed || 0) + pass2ProcessedCount;

    await db.update(jobs).set({
      current_batch_offset: newOffset,
      processed_records: newProcessed,
      failed_records: newFailed,
      pass1_processed: newPass1Processed,
      pass1_cleaned: newPass1Cleaned,
      pass2_needed: newPass2Needed,
      pass2_processed: newPass2Processed,
      last_batch_at: new Date(),
      is_processing_batch: false, // Clear flag so next batch can start
      updated_date: new Date()
    }).where(eq(jobs.id, jobId));

    await addLog(`Batch complete: ${successCount} succeeded, ${failCount} failed | Pass1: ${pass1CleanedCount} clean, Pass2: ${pass2ProcessedCount} AI`);

    // Log failed records summary if any
    if (failedRecordDetails.length > 0) {
      await addLog(`Failed records: ${failedRecordDetails.map(f => f.recordId).join(', ')}`);
      await addLog(`Consider retry for large content failures (${failedRecordDetails.filter(f => f.contentSize > 15000).length} records > 15k chars)`);
    }

    console.log(`[Batch] Job ${jobId} - Batch complete. New offset: ${newOffset}, Processed: ${newProcessed}/${totalRecordsToProcess}`);

    // Debug logging for batch continuation issue
    console.log(`[Batch Debug] totalRecordsToProcess=${totalRecordsToProcess}, job.total_records=${job.total_records}, newProcessed=${newProcessed}, newFailed=${newFailed}`);
    await addLog(`Debug: totalRecordsToProcess=${totalRecordsToProcess}, newProcessed+newFailed=${newProcessed + newFailed}`);

    // Check if we're done - ensure totalRecordsToProcess is valid
    if (!totalRecordsToProcess || totalRecordsToProcess === 0) {
      console.error(`[Batch Error] totalRecordsToProcess is invalid: ${totalRecordsToProcess}`);
      await addLog(`ERROR: totalRecordsToProcess is ${totalRecordsToProcess}, fetching from job record`, 'ERROR');

      // Re-fetch job to get the latest total_records
      const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      totalRecordsToProcess = currentJob?.total_records || 0;

      if (totalRecordsToProcess === 0) {
        // If still 0, assume we need to continue processing
        console.error(`[Batch Error] total_records is still 0 after re-fetch, continuing processing`);
        await addLog(`WARNING: total_records is 0, continuing to next batch`, 'ERROR');
        setTimeout(() => processBatch(jobId, 0), 1000);
        return;
      }
    }

    if (totalRecordsToProcess > 0 && newProcessed + newFailed >= totalRecordsToProcess) {
      const details = `Completed: ${newProcessed} processed, ${newFailed} failed | Pass1: ${newPass1Cleaned} clean (${Math.round((newPass1Cleaned / newProcessed) * 100)}%), Pass2: ${newPass2Processed} AI (${Math.round((newPass2Processed / newProcessed) * 100)}%)`;
      await db.update(jobs).set({
        status: 'completed',
        details,
        updated_date: new Date()
      }).where(eq(jobs.id, jobId));
      await addLog(`Job completed: ${newProcessed} records processed, ${newFailed} failed`);
      await addLog(`Two-pass summary: Pass1 cleaned ${newPass1Cleaned} (${Math.round((newPass1Cleaned / newProcessed) * 100)}%), Pass2 AI ${newPass2Processed} (${Math.round((newPass2Processed / newProcessed) * 100)}%)`);

      // Final summary with recommendations
      const successRate = Math.round((newProcessed / (newProcessed + newFailed)) * 100);
      await addLog(`Success rate: ${successRate}% (${newProcessed}/${newProcessed + newFailed})`);

      if (newFailed > 0) {
        await addLog(`💡 Recommendation: ${newFailed} records failed. Consider:`);
        await addLog(`- Running job again with changed_flag != "done" filter to retry failures`);
        await addLog(`- Check logs for timeout errors (may need longer timeouts)`);
        await addLog(`- Verify Gemini API quotas and rate limits`);
      }

      console.log(`[Batch] Job ${jobId} - COMPLETED. Total: ${newProcessed} processed, ${newFailed} failed (${successRate}% success rate)`);
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
