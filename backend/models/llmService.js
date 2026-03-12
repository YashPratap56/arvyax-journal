const NodeCache = require("node-cache");

// Cache analysis results for 1 hour
const analysisCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

/**
 * Analyze emotion from journal text using OpenRouter LLM.
 * Returns { emotion, keywords, summary }
 */
async function analyzeEmotion(text) {
  const cacheKey = text.toLowerCase().replace(/\s+/g, " ").trim();

  const cached = analysisCache.get(cacheKey);
  if (cached) {
    console.log("[LLM] Cache HIT for analysis");
    return { ...cached, cached: true };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set in environment");
  }

  const prompt = `You are a mental wellness assistant analyzing journal entries from a nature therapy app.

Analyze the following journal entry and respond ONLY with valid JSON (no markdown, no explanation):

{
  "emotion": "<single dominant emotion word e.g. calm, anxious, joyful, melancholic, energized, peaceful>",
  "keywords": ["<3-5 meaningful keywords from the text>"],
  "summary": "<one sentence summarizing the user's emotional state during the session>"
}

Journal entry:
"${text.replace(/"/g, "'")}"
`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  const raw = data.choices?.[0]?.message?.content || "";

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Extract JSON block if model added text
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM returned non-JSON: " + raw);
    parsed = JSON.parse(match[0]);
  }

  const result = {
    emotion: String(parsed.emotion || "neutral").toLowerCase(),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
    summary: String(parsed.summary || ""),
  };

  analysisCache.set(cacheKey, result);

  return result;
}

/**
 * Streaming version (simple fallback)
 * Calls callback(chunk) and returns final result
 */
async function analyzeEmotionStream(text, onChunk) {
  const result = await analyzeEmotion(text);

  const chunk = JSON.stringify(result);

  if (onChunk) {
    onChunk(chunk);
  }

  return result;
}

module.exports = {
  analyzeEmotion,
  analyzeEmotionStream,
};
