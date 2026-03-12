# Architecture Document — ArvyaX Journal System

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│   Write Entry │ View Entries │ Analyze │ Insights Dashboard  │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP / SSE
┌─────────────────────────▼───────────────────────────────────┐
│                   Backend (Express + Node.js)                │
│                                                              │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Rate Limiter│  │  Journal Router  │  │  LLM Service  │  │
│  │ (2 tiers)   │  │  POST/GET/PATCH  │  │  + In-Mem     │  │
│  └─────────────┘  └────────┬─────────┘  │  Cache        │  │
│                             │            └───────┬───────┘  │
│  ┌──────────────────────────▼────────────────────▼────────┐ │
│  │                    SQLite (WAL mode)                    │ │
│  │    journal_entries: id, user_id, ambience, text,       │ │
│  │                     emotion, keywords, summary,         │ │
│  │                     created_at                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                          │ HTTPS
              ┌───────────▼──────────┐
              │  Anthropic Claude API │
              │  (claude-sonnet-4)    │
              └───────────────────────┘
```

---

## Data Model

### `journal_entries` Table

| Column     | Type | Notes                                    |
|------------|------|------------------------------------------|
| `id`       | TEXT | UUID v4 primary key                      |
| `user_id`  | TEXT | Indexed — supports multi-user queries    |
| `ambience` | TEXT | Constrained to known values at app layer |
| `text`     | TEXT | Raw journal entry                        |
| `emotion`  | TEXT | Nullable — populated after LLM analysis |
| `keywords` | TEXT | JSON array stored as string              |
| `summary`  | TEXT | Nullable — one-sentence LLM summary     |
| `created_at` | TEXT | SQLite datetime string                 |

Indexes: `user_id`, `ambience`, `emotion`, `created_at` for efficient filtering and aggregation.

---

## Caching Strategy

Analysis results are cached using `node-cache` with a 1-hour TTL:

```
Request text → normalize (lowercase + collapse whitespace) → MD5-like string key
    │
    ▼
Cache hit? → return immediately (0 LLM cost, ~1ms)
    │
Cache miss? → call Anthropic API → store result → return
```

**Why in-process cache here?** For the scope of this project, a single-process in-memory cache is sufficient and has zero infrastructure overhead. See scaling section below for Redis upgrade path.

---

## Q1: How would you scale this to 100,000 users?

### Horizontal Scaling

1. **Replace SQLite with PostgreSQL** — SQLite is file-based and doesn't support concurrent writes from multiple processes. PostgreSQL handles concurrent connections, has a connection pooler (PgBouncer), and supports read replicas.

2. **Stateless backends behind a load balancer** — The Express app holds no session state. Spin up multiple instances behind nginx or an AWS ALB. The in-process cache would be replaced by Redis (see Q3).

3. **Database indexing at scale** — The current schema already indexes `user_id`, `emotion`, and `ambience`. At 100k users, add a composite index on `(user_id, created_at)` for paginated timeline queries.

4. **CDN for the frontend** — Serve the React build from S3 + CloudFront. No backend involvement for static assets.

5. **Async LLM analysis** — Move LLM calls to a job queue (BullMQ + Redis). When a user saves an entry, push a job. A worker process polls the queue and calls Anthropic. The entry is created immediately; analysis arrives asynchronously. Frontend polls or uses WebSockets for the result. This prevents API timeout errors under load.

6. **Read replicas for insights** — The `/insights/:userId` query runs several aggregations. With heavy read load, route these to a read replica or pre-compute with a nightly cron.

### Estimated capacity (single node, current stack):
- SQLite handles ~10k reads/sec for simple queries
- Express handles ~5-10k req/sec on modern hardware
- Bottleneck is Anthropic API rate limits (~60 RPM on standard tier)

At 100k users: horizontal scaling + async queue + PostgreSQL is the clear path.

---

## Q2: How would you reduce LLM cost?

**Current spend per analysis call**: ~300 input tokens + ~100 output tokens ≈ $0.002 per call (Claude Sonnet pricing).

### Cost reduction strategies:

1. **Caching (already implemented)** — Identical or near-identical texts return cached results at zero cost. This catches users who re-analyze without changing their text.

2. **Use a smaller model for short texts** — For journal entries under 100 words, route to `claude-haiku-4-5` (~5x cheaper than Sonnet). Only use Sonnet for longer, more nuanced entries. Implement a simple character-count router.

3. **Batch analysis** — Instead of analyzing each entry on demand, batch-process multiple entries in a single API call using a structured prompt: `Analyze each of the following entries and return a JSON array.` Reduces per-entry overhead by ~60%.

4. **Prompt optimization** — The current prompt is ~120 tokens. Trimming it to ~60 tokens by removing explanatory language reduces cost ~50% per call with minimal quality loss.

5. **User-initiated only** — Don't auto-analyze on every save. Require users to click "Analyze" (already the design). This ensures only entries users care about are analyzed.

6. **Semantic similarity cache** — Beyond exact-match caching, compute a sentence embedding (e.g. `text-embedding-3-small` at $0.02/1M tokens) and cache results for texts with cosine similarity > 0.95. Near-duplicate entries (common in daily journaling) would hit this cache.

---

## Q3: How would you cache repeated analysis?

### Current implementation
`node-cache` in-process, keyed by normalized text string, TTL = 1 hour.

### Production upgrade path

```
                ┌──────────────────────┐
Request text ──►│  Redis Cache (TTL 1h) │──► Cache HIT → return immediately
                │  Key: SHA256(text)    │
                └──────────┬───────────┘
                           │ Cache MISS
                           ▼
                    Anthropic API call
                           │
                           ▼
                   Store in Redis + return
```

**Redis implementation** (when multi-instance deployment is needed):

```js
const redis = require('redis');
const crypto = require('crypto');

const client = redis.createClient({ url: process.env.REDIS_URL });
const CACHE_TTL = 3600; // 1 hour

async function analyzeWithCache(text) {
  const key = 'llm:' + crypto.createHash('sha256').update(text).digest('hex');
  const cached = await client.get(key);
  if (cached) return { ...JSON.parse(cached), cached: true };

  const result = await callAnthropicAPI(text);
  await client.setEx(key, CACHE_TTL, JSON.stringify(result));
  return result;
}
```

**Cache invalidation**: TTL-based only — journal emotions don't change over time, so there's no need for manual invalidation. If the LLM model is upgraded and results improve, bump the key prefix (e.g. `llm_v2:...`) to bypass stale cache.

**Cache key strategy**: `SHA256(normalized_text)` — deterministic, collision-resistant, fixed length (64 chars), works as a Redis key without length issues.

---

## Q4: How would you protect sensitive journal data?

Journal entries are highly personal (mental health, emotions). Security must be layered.

### Authentication & Authorization

1. **JWT-based auth** — Every request must include a valid JWT. The backend verifies the token and extracts `userId`. Users can only access their own entries — the `userId` from the JWT overrides any userId in the request body. No user can read another user's journal.

2. **OAuth 2.0 / social login** — Integrate with Google or Apple Sign-In to avoid managing passwords. Fewer credentials = smaller attack surface.

### Data Encryption

3. **Encryption at rest** — Enable full-disk encryption on the database volume (standard in AWS RDS, GCP Cloud SQL). For SQLite: use SQLCipher (encrypted SQLite) with a key stored in a secrets manager (AWS Secrets Manager / HashiCorp Vault).

4. **Field-level encryption for `text` column** — Encrypt the raw journal text at the application layer before writing to DB, using AES-256-GCM. The encryption key is stored separately (not in the DB). Even if the DB is compromised, journal text is unreadable.

5. **TLS in transit** — HTTPS-only (TLS 1.2+). Enforce HSTS. No plaintext traffic.

### API Security

6. **Rate limiting** (already implemented) — Prevents brute-force, credential stuffing, and excessive LLM costs.

7. **Input sanitization** — Validate and sanitize all inputs. The journal text sent to the LLM should be escaped to prevent prompt injection (already done: `text.replace(/"/g, "'")` in LLM prompt).

8. **Sensitive data in logs** — Never log journal entry text. Log only entry IDs, timestamps, and operation types.

9. **CORS restrictions** — API only accepts requests from the known frontend origin (already configured via `CORS_ORIGIN` env var).

### Compliance Considerations

- Store data in user's region (GDPR Article 5 — data minimization & storage limitation)
- Implement a data deletion endpoint: `DELETE /api/journal/:userId` — purge all entries
- Privacy policy must disclose that journal text is sent to Anthropic's API for processing

---

## Sequence Diagram: Journal Entry + Analysis

```
User      Frontend      Backend         SQLite       Anthropic
 │           │             │               │              │
 │──Write───►│             │               │              │
 │           │──POST /journal──────────────►              │
 │           │             │──INSERT────────►             │
 │           │◄────201 entry│               │             │
 │           │             │               │              │
 │──Analyze─►│             │               │              │
 │           │──POST /analyze─────────────────────────────►
 │           │             │               │   LLM prompt │
 │           │             │               │◄────result───│
 │           │             │──UPDATE─────── ►             │
 │           │◄──emotion+keywords+summary──│              │
```
