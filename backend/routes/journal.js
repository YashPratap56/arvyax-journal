const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { analyzeEmotion, analyzeEmotionStream } = require('../models/llmService');

// ─── POST /api/journal ──────────────────────────────────────────────────────
// Create a new journal entry
router.post('/', (req, res) => {
  const { userId, ambience, text } = req.body;

  if (!userId || !ambience || !text) {
    return res.status(400).json({
      error: 'Missing required fields: userId, ambience, text',
    });
  }

  const VALID_AMBIENCES = ['forest', 'ocean', 'mountain', 'desert', 'meadow', 'rain', 'cave'];
  if (!VALID_AMBIENCES.includes(ambience.toLowerCase())) {
    return res.status(400).json({
      error: `Invalid ambience. Must be one of: ${VALID_AMBIENCES.join(', ')}`,
    });
  }

  if (text.trim().length < 5) {
    return res.status(400).json({ error: 'Journal text too short (min 5 characters)' });
  }

  const db = getDb();
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO journal_entries (id, user_id, ambience, text, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(id, String(userId), ambience.toLowerCase(), text.trim());

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);

  res.status(201).json(formatEntry(entry));
});

// ─── GET /api/journal/:userId ──────────────────────────────────────────────
// Get all entries for a user
router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  const { limit = 50, offset = 0, ambience } = req.query;

  const db = getDb();
  let query = 'SELECT * FROM journal_entries WHERE user_id = ?';
  const params = [userId];

  if (ambience) {
    query += ' AND ambience = ?';
    params.push(ambience.toLowerCase());
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const entries = db.prepare(query).all(...params);
  const total = db.prepare(
    'SELECT COUNT(*) as count FROM journal_entries WHERE user_id = ?'
  ).get(userId).count;

  res.json({
    entries: entries.map(formatEntry),
    total,
    limit: Number(limit),
    offset: Number(offset),
  });
});

// ─── POST /api/journal/analyze ────────────────────────────────────────────
// Analyze emotion from text (standalone, no DB write)
router.post('/analyze', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length < 5) {
    return res.status(400).json({ error: 'Text is required (min 5 characters)' });
  }

  try {
    const result = await analyzeEmotion(text.trim());
    res.json(result);
  } catch (err) {
    console.error('[analyze]', err.message);
    res.status(502).json({ error: 'LLM analysis failed: ' + err.message });
  }
});

// ─── POST /api/journal/analyze/stream ────────────────────────────────────
// Streaming LLM analysis via Server-Sent Events
router.post('/analyze/stream', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length < 5) {
    return res.status(400).json({ error: 'Text is required (min 5 characters)' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const result = await analyzeEmotionStream(text.trim(), (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[analyze/stream]', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ─── POST /api/journal/:entryId/analyze ──────────────────────────────────
// Analyze and save analysis back to an entry
router.post('/:entryId/analyze', async (req, res) => {
  const { entryId } = req.params;
  const db = getDb();

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(entryId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  try {
    const analysis = await analyzeEmotion(entry.text);

    db.prepare(`
      UPDATE journal_entries
      SET emotion = ?, keywords = ?, summary = ?
      WHERE id = ?
    `).run(
      analysis.emotion,
      JSON.stringify(analysis.keywords),
      analysis.summary,
      entryId
    );

    const updated = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(entryId);
    res.json(formatEntry(updated));
  } catch (err) {
    console.error('[entry analyze]', err.message);
    res.status(502).json({ error: 'LLM analysis failed: ' + err.message });
  }
});

// ─── GET /api/journal/insights/:userId ───────────────────────────────────
// Aggregate insights for a user
router.get('/insights/:userId', (req, res) => {
  const { userId } = req.params;
  const db = getDb();

  const totalEntries = db.prepare(
    'SELECT COUNT(*) as count FROM journal_entries WHERE user_id = ?'
  ).get(userId).count;

  if (totalEntries === 0) {
    return res.json({
      totalEntries: 0,
      topEmotion: null,
      mostUsedAmbience: null,
      recentKeywords: [],
      emotionBreakdown: {},
      ambienceBreakdown: {},
      entriesOverTime: [],
    });
  }

  // Top emotion
  const topEmotionRow = db.prepare(`
    SELECT emotion, COUNT(*) as cnt
    FROM journal_entries
    WHERE user_id = ? AND emotion IS NOT NULL
    GROUP BY emotion ORDER BY cnt DESC LIMIT 1
  `).get(userId);

  // Most used ambience
  const topAmbienceRow = db.prepare(`
    SELECT ambience, COUNT(*) as cnt
    FROM journal_entries
    WHERE user_id = ?
    GROUP BY ambience ORDER BY cnt DESC LIMIT 1
  `).get(userId);

  // All keywords from recent 20 entries
  const recentWithKeywords = db.prepare(`
    SELECT keywords FROM journal_entries
    WHERE user_id = ? AND keywords IS NOT NULL
    ORDER BY created_at DESC LIMIT 20
  `).all(userId);

  const keywordFreq = {};
  for (const row of recentWithKeywords) {
    try {
      const kws = JSON.parse(row.keywords);
      for (const kw of kws) {
        const k = kw.toLowerCase();
        keywordFreq[k] = (keywordFreq[k] || 0) + 1;
      }
    } catch { /* ignore bad JSON */ }
  }

  const recentKeywords = Object.entries(keywordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);

  // Emotion breakdown
  const emotionRows = db.prepare(`
    SELECT emotion, COUNT(*) as cnt
    FROM journal_entries
    WHERE user_id = ? AND emotion IS NOT NULL
    GROUP BY emotion ORDER BY cnt DESC
  `).all(userId);

  const emotionBreakdown = {};
  for (const r of emotionRows) emotionBreakdown[r.emotion] = r.cnt;

  // Ambience breakdown
  const ambienceRows = db.prepare(`
    SELECT ambience, COUNT(*) as cnt
    FROM journal_entries WHERE user_id = ?
    GROUP BY ambience ORDER BY cnt DESC
  `).all(userId);

  const ambienceBreakdown = {};
  for (const r of ambienceRows) ambienceBreakdown[r.ambience] = r.cnt;

  // Entries over last 7 days
  const entriesOverTime = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM journal_entries
    WHERE user_id = ? AND created_at >= date('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY date
  `).all(userId);

  res.json({
    totalEntries,
    topEmotion: topEmotionRow?.emotion || null,
    mostUsedAmbience: topAmbienceRow?.ambience || null,
    recentKeywords,
    emotionBreakdown,
    ambienceBreakdown,
    entriesOverTime,
  });
});

// Helper: parse stored JSON fields and return clean object
function formatEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    userId: entry.user_id,
    ambience: entry.ambience,
    text: entry.text,
    emotion: entry.emotion || null,
    keywords: entry.keywords ? JSON.parse(entry.keywords) : null,
    summary: entry.summary || null,
    createdAt: entry.created_at,
  };
}

module.exports = router;
