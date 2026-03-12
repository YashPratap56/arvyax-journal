# 🌿 ArvyaX Nature Journal

An AI-assisted journaling system for ArvyaX users to reflect on their nature immersion sessions. Features real-time emotion analysis via Claude AI, session insights, and keyword tracking.

---

## Tech Stack

| Layer     | Technology                             |
|-----------|----------------------------------------|
| Backend   | Node.js + Express                      |
| Frontend  | React 18                               |
| Database  | SQLite (via `better-sqlite3`)          |
| LLM       | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Cache     | In-process `node-cache` (1hr TTL)      |
| Docker    | Docker Compose (optional)              |

---

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

---

## Quick Start (Local)

### 1. Clone & configure

```bash
git clone <repo-url>
cd arvyax-journal
```

### 2. Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env → set ANTHROPIC_API_KEY=your_key_here
npm install
npm start
# API running at http://localhost:3001
```

### 3. Frontend setup

```bash
cd ../frontend
npm install
npm start
# App running at http://localhost:3000
```

---

## Docker (optional)

```bash
# Set your API key
export ANTHROPIC_API_KEY=your_key_here

# Build & run everything
docker-compose up --build

# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

---

## API Reference

### Create Entry
```
POST /api/journal
Body: { "userId": "123", "ambience": "forest", "text": "I felt calm..." }
Response: { id, userId, ambience, text, emotion, keywords, summary, createdAt }
```

### Get Entries
```
GET /api/journal/:userId
Query params: limit (default 50), offset (default 0), ambience (optional filter)
Response: { entries: [...], total, limit, offset }
```

### Analyze Text (Standalone)
```
POST /api/journal/analyze
Body: { "text": "I felt calm today after listening to the rain" }
Response: { emotion, keywords, summary, cached? }
```

### Analyze & Save to Entry
```
POST /api/journal/:entryId/analyze
Response: Updated entry with emotion, keywords, summary
```

### Streaming Analysis
```
POST /api/journal/analyze/stream
Body: { "text": "..." }
Response: Server-Sent Events stream → { chunk } events, final { done, result }
```

### Insights
```
GET /api/journal/insights/:userId
Response: {
  totalEntries, topEmotion, mostUsedAmbience, recentKeywords,
  emotionBreakdown, ambienceBreakdown, entriesOverTime
}
```

### Health Check
```
GET /health
Response: { status: "ok", timestamp }
```

---

## Environment Variables

| Variable          | Required | Default                    | Description              |
|-------------------|----------|----------------------------|--------------------------|
| `ANTHROPIC_API_KEY` | ✅     | —                          | Your Anthropic API key   |
| `PORT`            | No       | `3001`                     | Backend port             |
| `CORS_ORIGIN`     | No       | `http://localhost:3000`    | Allowed frontend origin  |
| `NODE_ENV`        | No       | `development`              | Environment mode         |

---

## Features

- ✅ Full journal CRUD API
- ✅ Real LLM emotion analysis (not dummy data)
- ✅ Analysis caching (same text → no repeat LLM calls)
- ✅ Streaming analysis via SSE
- ✅ Rate limiting (100 req/15min general; 10 req/min for LLM)
- ✅ Aggregated insights (emotion breakdown, ambience stats, keywords)
- ✅ Docker support
- ✅ Input validation + meaningful error messages

---

## Project Structure

```
arvyax-journal/
├── backend/
│   ├── db/
│   │   └── database.js       # SQLite setup + schema
│   ├── models/
│   │   └── llmService.js     # Anthropic API + caching
│   ├── routes/
│   │   └── journal.js        # All API endpoints
│   ├── server.js             # Express app + middleware
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.js            # Main UI component
│   │   ├── App.css           # Styles
│   │   ├── index.js
│   │   └── utils/
│   │       └── api.js        # API client
│   └── package.json
├── docker-compose.yml
├── README.md
└── ARCHITECTURE.md
```
