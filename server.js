const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Clean and fix common JSON issues from AI responses ──────────────────────
function cleanAndParseJSON(raw) {
  let text = raw.trim();

  // Remove markdown code blocks if present
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e1) {
    // Extract JSON object from surrounding text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        // Fix common issues: unescaped apostrophes inside strings, trailing commas
        let fixed = match[0];

        // Remove trailing commas before } or ]
        fixed = fixed.replace(/,\s*([}\]])/g, '$1');

        // Fix unescaped single quotes inside JSON strings (replace ' with \u0027 safely)
        // We replace smart/curly quotes with standard ones
        fixed = fixed.replace(/[\u2018\u2019]/g, "'");
        fixed = fixed.replace(/[\u201C\u201D]/g, '"');

        try {
          return JSON.parse(fixed);
        } catch (e3) {
          throw new Error(`JSON parse failed: ${e3.message}. Raw: ${text.substring(0, 200)}`);
        }
      }
    }
    throw new Error(`No JSON object found in response. Raw: ${text.substring(0, 200)}`);
  }
}

// ── Build prompt ─────────────────────────────────────────────────────────────
function buildPrompt(topic, difficulty) {
  return `You are an expert quiz creator. Generate a quiz on the topic: "${topic}" at difficulty level: "${difficulty}".

Create exactly 10 multiple choice questions. Return ONLY a valid JSON object. No extra text, no markdown, no code blocks.

Use this exact structure:
{"topic":"${topic}","difficulty":"${difficulty}","questions":[{"question":"Question text here?","options":["Option A text","Option B text","Option C text","Option D text"],"answer":"A","explanation":"Explanation here."},{"question":"Question 2?","options":["Option A","Option B","Option C","Option D"],"answer":"B","explanation":"Explanation here."}]}

STRICT RULES:
- Return ONLY raw JSON, nothing else before or after
- Each question has exactly 4 options as plain strings (no A. B. C. D. prefixes)
- "answer" must be exactly one of: "A", "B", "C", or "D"
- Do NOT use apostrophes (') in any text - use (it is) instead of (it's), (does not) instead of (don't) etc.
- Do NOT use double quotes inside string values
- Explanations must be 1-2 sentences only
- All 10 questions must be about: ${topic}
- Difficulty: ${difficulty}`;
}

// ── Generate quiz endpoint ────────────────────────────────────────────────────
app.post('/api/generate-quiz', async (req, res) => {
  const { topic, difficulty } = req.body;

  if (!topic || !difficulty) {
    return res.status(400).json({ error: 'Topic and difficulty are required.' });
  }

  let lastError = '';

  // Retry up to 3 times if parsing fails
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Generating quiz for "${topic}" | ${difficulty}`);

      const message = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: buildPrompt(topic, difficulty) },
        ],
      });

      const rawText = message.content[0].text;
      console.log(`Raw response (first 300 chars): ${rawText.substring(0, 300)}`);

      const quizData = cleanAndParseJSON(rawText);

      // Validate structure
      if (!quizData.questions || !Array.isArray(quizData.questions)) {
        throw new Error('Response missing "questions" array.');
      }
      if (quizData.questions.length === 0) {
        throw new Error('No questions returned.');
      }

      // Validate each question
      quizData.questions = quizData.questions.slice(0, 10).map((q, i) => {
        if (!q.question) throw new Error(`Question ${i + 1} missing "question" field.`);
        if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`Question ${i + 1} must have exactly 4 options.`);
        if (!['A', 'B', 'C', 'D'].includes(q.answer)) throw new Error(`Question ${i + 1} has invalid answer: ${q.answer}`);
        if (!q.explanation) q.explanation = 'No explanation provided.';
        return q;
      });

      // Ensure topic/difficulty fields
      quizData.topic = quizData.topic || topic;
      quizData.difficulty = quizData.difficulty || difficulty;

      console.log(`Success! Questions: ${quizData.questions.length} | Tokens: in=${message.usage.input_tokens} out=${message.usage.output_tokens}`);
      return res.json(quizData);

    } catch (err) {
      lastError = err.message;
      console.error(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
      }
    }
  }

  return res.status(500).json({
    error: `Failed to generate quiz after 3 attempts. Please try again. (${lastError})`
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'AI Quiz Generator server is running.' });
});

app.listen(PORT, () => {
  console.log(`AI Quiz Generator server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
