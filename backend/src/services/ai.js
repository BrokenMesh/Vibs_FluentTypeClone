import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Strip markdown code fences the model sometimes adds despite instructions
function stripMarkdown(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

const DIFFICULTY_LABELS = [
  'absolute beginner',  // 0–20
  'beginner',           // 20–40
  'elementary',         // 40–60
  'intermediate',       // 60–80
  'upper-intermediate', // 80–100
];

function difficultyLabel(skillScore) {
  const idx = Math.min(4, Math.floor(skillScore / 20));
  return DIFFICULTY_LABELS[idx];
}

function targetWordCount(skillScore) {
  return 4 + Math.floor(skillScore / 10); // 4–14 words
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
  anchorWord = null,         // word of the day — must appear in the sentence
  existingSentences = [],    // target_text strings to avoid repeating
}) {
  const difficulty = difficultyLabel(skillScore);
  const wordCount = targetWordCount(skillScore);
  const knownList = knownWords.slice(0, 40).join(', ') || 'none yet';
  const avoidList = existingSentences.slice(0, 20).map(s => `- ${s}`).join('\n') || 'none';

  const anchorInstruction = anchorWord
    ? `- MUST naturally include the word: "${anchorWord}"`
    : '';

  const prompt = `You are a language learning assistant helping a user learn ${targetLanguage}.
Native language: ${nativeLanguage}. Skill level: ${difficulty} (${skillScore}/100).

Generate ONE natural, meaningful sentence in ${targetLanguage} that:
- Has approximately ${wordCount} words
- Uses ${difficulty}-level vocabulary and grammar
- Primarily uses these known words: ${knownList}
${anchorInstruction}
- Sounds like natural, everyday speech
- Is DIFFERENT from all of these already-used sentences:
${avoidList}

Respond ONLY with valid JSON (no markdown):
{"target_text": "...", "source_text": "...", "words": ["word1", "word2", ...]}

Where source_text is a natural ${nativeLanguage} translation the user will read, and words is a lowercased array of ${targetLanguage} words without punctuation.`;

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

  // Reject if it's a duplicate (case-insensitive exact match)
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
  const difficulty = difficultyLabel(skillScore);

  const prompt = `You are a language learning assistant.
The user is learning ${targetLanguage} (native: ${nativeLanguage}). Skill: ${difficulty}.
Words they already know: ${existing}

Pick ONE new ${targetLanguage} word that:
- They don't already know
- Is common and useful for ${difficulty} learners
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
