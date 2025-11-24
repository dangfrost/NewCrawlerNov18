# Session State: Two-Pass Language Processing
**Date**: 2025-11-19 17:08
**Previous Model**: Claude Sonnet 4.5
**Switching To**: Claude Opus

---

## 🚨 CRITICAL: JOB HUNG AT OFFSET 85

**Job ID**: `47af5465-2eaf-4188-8fbc-138d10e622d2`
- **Progress**: 75 out of 2,047 records processed
- **Failed**: ~15 records (timeout failures)
- **Current State**: **HUNG at offset 85**
- **Problem**: Gemini API call hanging, not respecting 2-minute timeout in `server/routes/augmentor.js:978-988`

**Last Log**: `"Fetching batch at offset 85"` - no completion

---

## What Was Implemented Today ✅

### 1. Two-Pass Processing System
**Location**: `server/routes/augmentor.js` lines 138-225

- **Pass 1** (Programmatic): Word frequency detection removes target languages
  - English: 300 most common words, >40% match = English
  - Also supports: French, German, Portuguese
  - Threshold: If <15% remains, skip AI entirely

- **Pass 2** (AI): Only processes records with >15% content remaining
  - Uses Gemini Flash
  - Batching: <50k chars = batch, >50k = individual

**Stats Tracking**: `pass1_processed`, `pass1_cleaned`, `pass2_needed`, `pass2_processed`

### 2. Multi-Language Support
**Languages**: English (en), French (fr), German (de), Portuguese (pt)
**Config**: `languages_to_remove: 'en,fr,de'` (comma-separated in database)
**Word Sets**: 300 common words per language in `COMMON_WORDS` object

### 3. Smart Batch Processing
- Detects prompt size before processing
- Auto-switches to individual processing when >50k chars
- Prevents most timeouts (but not all)

### 4. Database Migration ✅
**Migration File**: `server/db/migrate-two-pass.js`
**Schema**: `server/db/schema.js`

**New Columns**:
```sql
-- database_instances
languages_to_remove TEXT DEFAULT 'en'
enable_two_pass BOOLEAN DEFAULT true

-- jobs
current_pass INTEGER DEFAULT 1
pass1_processed INTEGER DEFAULT 0
pass1_cleaned INTEGER DEFAULT 0
pass2_needed INTEGER DEFAULT 0
pass2_processed INTEGER DEFAULT 0
```

### 5. UI: 3-Column Dry Run
**File**: `src/components/dashboard/DryRunResultDialog.jsx`

Shows 3 stages side-by-side:
1. **Original** (gray) - raw content, char count
2. **After Pass 1** (blue) - filtered content, language stats
3. **Final** (green) - AI processed, processing path

---

## Current Issues

### 1. Gemini API Hanging (CRITICAL)
**Problem**: `withTimeout()` using `Promise.race()` doesn't cancel hung API calls
**Timeout**: 120 seconds
**Result**: Some records hang indefinitely

**Failed Batches**:
- Offset 25, 30, 40, 45, 70: 1 failure each
- Offset 80: 5 failures (entire batch skipped after 3 retries)
- Offset 85: **HUNG** (never completed)

**Needs Fix**: Use `AbortController` or circuit breaker pattern

### 2. Pass 1 Never Skips AI
**Observation**: Every batch logs `"0 clean (no AI needed)"`
**Reason**: Data genuinely mixed, 55-60% remains after English removal
**Current Threshold**: 15% (CLEAN_THRESHOLD)
**Possible Fix**: Raise to 40%?

---

## Recent Commits (Last 3 Hours)

```
b374771 - Update Dry Run UI to show 3-stage processing
28f450a - Fix Dry Run: add backward compatible response format
4ac389e - Fix Gemini timeout: process large batches individually
3ee0c86 - Add French, German, Portuguese language detection
124c740 - Fix critical bug: jobs completing early (total_records)
ebea41b - Replace franc with English word detection
b01811c - Fix job completion bug and add detailed Pass 1 logging
a20f716 - Update Dry Run to show two-pass processing results
016f9ab - Implement complete two-pass processing system
8682a13 - Increase MAX_CONTENT_LENGTH to 100k
```

---

## Configuration Constants

```javascript
// server/routes/augmentor.js
const BATCH_SIZE = 5
const MAX_CONTENT_LENGTH = 100000
const OPENAI_TIMEOUT = 120000 // 2 minutes - NOT WORKING
const MAX_RETRIES = 3
const CLEAN_THRESHOLD = 0.15 // 15%
const MAX_BATCH_RETRIES = 3
```

---

## Performance Data

**Pass 1**: <1 second per record, removes 40-46% English
**Pass 2 Batch**: ~96 seconds for 5 records (<50k chars)
**Pass 2 Individual**: ~40 seconds per record (>50k chars)
**Timeouts**: Some records >120 seconds

**Estimated Total Time**: 7-10 hours for 2,047 records

---

## Next Steps for Opus

### Immediate:
1. Cancel hung job: `POST /api/jobs/47af5465-2eaf-4188-8fbc-138d10e622d2/cancel`
2. Fix timeout with AbortController
3. Deploy fix to Railway

### Consider:
- Reduce BATCH_SIZE from 5 to 3?
- Increase timeout from 120s to 180s?
- Raise CLEAN_THRESHOLD from 15% to 40%?
- Switch from gemini-flash to faster/more reliable model?

---

## Environment

- **Platform**: Railway (disciplined-kindness/production/NewCrawlerNov18)
- **Database**: Neon PostgreSQL
- **AI**: Gemini Flash (Pass 2), OpenAI text-embedding-3-large
- **Deployment**: Auto-deploy from main branch

**Commands**:
```bash
railway logs --lines 100
railway status
git push origin main  # auto-deploys
```

---

## User Preferences
- English only for now (languages_to_remove: 'en')
- Two-pass default ON
- No stopwords (cross-language contamination)
- Process full content (no truncation)
