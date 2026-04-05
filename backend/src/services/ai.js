import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Strip markdown code fences the model sometimes adds despite instructions
function stripMarkdown(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// CEFR levels mapped to skill score 0–1000
const CEFR_LEVELS = [
  { label: 'A1', min: 0,   max: 166  },
  { label: 'A2', min: 167, max: 333  },
  { label: 'B1', min: 334, max: 499  },
  { label: 'B2', min: 500, max: 665  },
  { label: 'C1', min: 666, max: 832  },
  { label: 'C2', min: 833, max: 1000 },
];

export function cefrLevel(skillScore) {
  for (let i = CEFR_LEVELS.length - 1; i >= 0; i--) {
    if (skillScore >= CEFR_LEVELS[i].min) return CEFR_LEVELS[i].label;
  }
  return 'A1';
}

function targetWordCount(skillScore) {
  // 4 words at A1, up to 14 at C2 (scales with 0–1000)
  return 4 + Math.floor(skillScore / 100);
}

/**
 * Generate one sentence, avoiding the provided existing sentences.
 * Throws if the AI produces a duplicate.
 */
export async function generateSentence({
  targetLanguage,
  nativeLanguage,
  skillScore,
  knownWords = [],
  anchorWord = null,
  existingSentences = [],
}) {
  const cefr = cefrLevel(skillScore);
  const wordCount = targetWordCount(skillScore);
  const knownList = knownWords.slice(0, 40).join(', ') || 'none yet';
  const avoidList = existingSentences.slice(0, 20).map(s => `- ${s}`).join('\n') || 'none';

  const anchorInstruction = anchorWord
    ? `- MUST naturally include the word: "${anchorWord}"`
    : '';

  const prompt = `You are a language learning assistant helping a user learn ${targetLanguage}.
Native language: ${nativeLanguage}. Skill level: ${cefr} (${skillScore}/1000).

Generate ONE creative, natural sentence in ${targetLanguage} that:
- Has approximately ${wordCount} words
- Matches ${cefr}-level vocabulary and grammar complexity
- Is creative and varied — use interesting real-world scenarios, not generic phrases
- MAY occasionally use one of these known words if it fits naturally: ${knownList}
  (do NOT force them in or repeat the same ones every time — most sentences should feel fresh)
${anchorInstruction}
- Is DIFFERENT from all of these already-used sentences:
${avoidList}

Respond ONLY with valid JSON (no markdown):
{"target_text": "...", "source_text": "...", "words": ["word1", "word2", ...]}

Where source_text is a natural ${nativeLanguage} translation the user will read, and words is a lowercased array of the key ${targetLanguage} vocabulary words (no punctuation).`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = stripMarkdown(message.content[0].text.trim());
  const parsed = JSON.parse(raw);

  if (!parsed.target_text || !parsed.source_text || !Array.isArray(parsed.words)) {
    throw new Error('AI returned unexpected format');
  }

  const normalised = parsed.target_text.trim().toLowerCase();
  if (existingSentences.some(s => s.trim().toLowerCase() === normalised)) {
    throw new Error('DUPLICATE');
  }

  return {
    sourceText: parsed.source_text,
    targetText: parsed.target_text,
    words: parsed.words,
  };
}

/**
 * Generate the word of the day for a profile.
 * Returns { word, translation }.
 */
export async function generateWordOfDay({ targetLanguage, nativeLanguage, skillScore, existingWords = [] }) {
  const existing = existingWords.slice(0, 80).join(', ') || 'none';
  const cefr = cefrLevel(skillScore);

  const prompt = `You are a language learning assistant.
The user is learning ${targetLanguage} (native: ${nativeLanguage}). Level: ${cefr} (${skillScore}/1000).
Words they already know: ${existing}

Pick ONE new ${targetLanguage} word that:
- They don't already know
- Is common and useful for ${cefr}-level learners
- Would work well as the focus of several practice sentences

Respond ONLY with valid JSON (no markdown): {"word": "...", "translation": "..."}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = stripMarkdown(message.content[0].text.trim());
  return JSON.parse(raw);
}