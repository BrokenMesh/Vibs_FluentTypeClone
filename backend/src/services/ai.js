import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Strip markdown code fences the model sometimes adds despite instructions
function stripMarkdown(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// Extract the first JSON object or array from a string even if there is prose around it
function extractJson(text) {
  const clean = stripMarkdown(text);
  // Try direct parse first (fastest path)
  try { return JSON.parse(clean); } catch (_) { /* fall through */ }
  // Find the first { or [ and extract to matching close
  const start = clean.search(/[{[]/);
  if (start === -1) throw new Error('No JSON found in AI response');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return JSON.parse(clean.slice(start, i + 1)); }
  }
  throw new Error('Unbalanced JSON in AI response');
}

// CEFR levels mapped to skill score 0–10,000
const CEFR_LEVELS = [
  { label: 'A1', min: 0,    max: 1666  },
  { label: 'A2', min: 1667, max: 3333  },
  { label: 'B1', min: 3334, max: 4999  },
  { label: 'B2', min: 5000, max: 6665  },
  { label: 'C1', min: 6666, max: 8332  },
  { label: 'C2', min: 8333, max: 10000 },
];

export function cefrLevel(skillScore) {
  for (let i = CEFR_LEVELS.length - 1; i >= 0; i--) {
    if (skillScore >= CEFR_LEVELS[i].min) return CEFR_LEVELS[i].label;
  }
  return 'A1';
}

function targetWordCount(skillScore) {
  // 4 words at A1, up to 14 at C2 (scales with 0–10,000)
  return 4 + Math.floor(skillScore / 1000);
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
Native language: ${nativeLanguage}. Skill level: ${cefr} (${skillScore}/10000).

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

// Topic pool for batch generation — shuffled per call to ensure variety
const TOPIC_POOL = [
  'a missed train or bus', 'cooking a new recipe', 'a job interview', 'visiting a museum',
  'a broken appliance at home', 'morning routine', 'a sports match', 'gardening',
  'a doctor appointment', 'online shopping gone wrong', 'a neighborhood argument',
  'studying for an exam', 'a surprise birthday party', 'a power outage', 'making new friends',
  'a rainy afternoon indoors', 'a road trip', 'a loud concert', 'a flight delay',
  'childhood memory', 'a busy street market', 'a phone call with bad news',
  'ordering food at a café', 'a noisy neighbor', 'a holiday family dinner',
  'moving to a new apartment', 'a strange dream', 'losing a wallet', 'a job promotion',
  'a long queue at a shop', 'an unexpected guest', 'fixing something broken',
  'a walk in the park', 'a heated debate', 'reading a disappointing book',
  'a school reunion', 'a wedding ceremony', 'a job resignation', 'a pet doing something funny',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Analyse a learner's actual performance data and produce a concise pedagogical
 * brief that the sentence generator will use to calibrate difficulty and structure.
 *
 * Language-agnostic: the AI reasons about real demonstrated patterns, not
 * hardcoded grammar labels. Works for any target language.
 *
 * Returns a plain-text brief (3-5 sentences).
 */
export async function generateLearnerProfile({
  targetLanguage,
  nativeLanguage,
  skillScore,
  goodSentences = [],  // [{ target_text, score }]  high accuracy
  badSentences  = [],  // [{ target_text, score }]  low accuracy
  knownWords    = [],
}) {
  const cefr = cefrLevel(skillScore);
  const wordCount = targetWordCount(skillScore);

  const goodList = goodSentences.length
    ? goodSentences.map(s => `  • "${s.target_text}" (${Math.round(s.score * 100)}%)`).join('\n')
    : '  (none yet — learner is just starting out)';
  const badList = badSentences.length
    ? badSentences.map(s => `  • "${s.target_text}" (${Math.round(s.score * 100)}%)`).join('\n')
    : '  (none yet)';
  const vocabSample = knownWords.slice(0, 40).join(', ') || 'none yet';

  const prompt = `You are an expert language pedagogy analyst.

A learner is studying ${targetLanguage} (native language: ${nativeLanguage}).
CEFR level: ${cefr} (skill score ${skillScore}/10000).
Target sentence length at this level: ~${wordCount} words.

PERFORMANCE DATA
Sentences they handle well (≥ 80% accuracy):
${goodList}

Sentences they struggle with (< 60% accuracy):
${badList}

Known vocabulary (most frequently seen): ${vocabSample}

TASK
Write a concise instructional brief (3-5 sentences) for an AI that will generate ${targetLanguage} practice sentences for this learner today. The brief must:
1. Identify what grammatical patterns and vocabulary this learner has demonstrably mastered — be specific and language-aware (name actual tenses, structures, word classes as they exist in ${targetLanguage}).
2. Identify specific gaps or patterns that are tripping them up.
3. Specify the ideal balance for today's batch: what proportion should consolidate the comfort zone vs. gently stretch into the next difficulty tier, and what that stretch should concretely look like.

Crucially: base your analysis on the evidence above, not on assumptions about CEFR labels. Do NOT mention CEFR level names in your output. Output only the brief, no preamble or headings.`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

/**
 * Generate a batch of diverse sentences in one AI call.
 *
 * Takes a learnerProfile string (from generateLearnerProfile) which describes
 * the user's actual demonstrated abilities — no hardcoded grammar pools.
 * This makes generation language-agnostic and adaptive.
 *
 * Returns an array of { sourceText, targetText, words }, deduplicated.
 */
export async function generateSentenceBatch({
  targetLanguage,
  nativeLanguage,
  skillScore,
  learnerProfile = '',
  knownWords = [],
  anchorWord = null,
  count = 10,
  existingSentences = [],
}) {
  const cefr = cefrLevel(skillScore);
  const wordCount = targetWordCount(skillScore);
  const avoidList = existingSentences.slice(0, 40).map(s => `"${s}"`).join('\n') || 'none';

  // Pre-assign a unique topic to each slot; vocab mode split 30% reinforce / 70% challenge
  const topics = shuffle(TOPIC_POOL).slice(0, count);
  const slots = Array.from({ length: count }, (_, i) => {
    const vocab = i < Math.ceil(count * 0.3)
      ? `REINFORCE: use vocabulary the learner already knows naturally`
      : `CHALLENGE: introduce vocabulary the learner hasn't encountered yet`;
    const anchor = anchorWord
      ? ` | MANDATORY: the word "${anchorWord}" must appear in target_text verbatim`
      : '';
    return `${i + 1}. Topic: "${topics[i]}" | Vocab: ${vocab}${anchor}`;
  }).join('\n');

  const anchorInstruction = anchorWord
    ? `\nCRITICAL RULE: every single sentence MUST contain the exact ${targetLanguage} word "${anchorWord}". Restructure the topic if needed — never omit the word.\n`
    : '';

  const profileSection = learnerProfile
    ? `LEARNER PROFILE (derived from their actual performance — use this to calibrate difficulty, vocabulary, and grammar structures):\n${learnerProfile}`
    : `LEARNER PROFILE: ${cefr}-level learner of ${targetLanguage} with no performance history yet. Use appropriate ${cefr} patterns and common vocabulary.`;

  const prompt = `You are an expert ${targetLanguage} language teacher creating adaptive practice sentences.

${profileSection}
${anchorInstruction}
TASK
Generate exactly ${count} ${targetLanguage} sentences — one per numbered slot. Each slot specifies the real-world topic and vocabulary mode.

Target sentence length: ~${wordCount} words.
Translations into: ${nativeLanguage}.

SLOTS
${slots}

GLOBAL RULES
- Choose grammar structures based on the learner profile above — stay close to their demonstrated level with only gentle stretches
- Make each topic vivid and specific; avoid textbook-bland phrasing
- No two sentences may share the same subject, opening word, or sentence structure
- Vary the sentence types across the batch: statements, questions, negations, commands — mix them
- Do NOT reproduce any of these already-used sentences:
${avoidList}

OUTPUT FORMAT
Respond ONLY with a valid JSON array — no markdown, no explanation.
Each element: {"target_text": "...", "source_text": "...", "words": ["word1", ...]}
- target_text: the ${targetLanguage} sentence
- source_text: a fluent, natural ${nativeLanguage} translation
- words: lowercase array of key ${targetLanguage} vocabulary from that sentence (no punctuation)
Return exactly ${count} objects in slot order.`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3072,
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = extractJson(message.content[0].text.trim());
  if (!Array.isArray(parsed)) throw new Error('AI returned non-array for batch');

  // Deduplicate against existing sentences and within the batch itself
  const seen = new Set(existingSentences.map(s => s.trim().toLowerCase()));
  const anchorLower = anchorWord ? anchorWord.toLowerCase() : null;
  const results = [];
  for (const item of parsed) {
    if (!item.target_text || !item.source_text || !Array.isArray(item.words)) continue;
    const norm = item.target_text.trim().toLowerCase();
    if (seen.has(norm)) continue;
    // Drop sentences that don't contain the anchor word (model non-compliance)
    if (anchorLower && !norm.includes(anchorLower)) {
      console.warn(`Dropped sentence missing anchor "${anchorWord}": ${item.target_text}`);
      continue;
    }
    seen.add(norm);
    results.push({ sourceText: item.source_text, targetText: item.target_text, words: item.words });
  }
  return results;
}

/**
 * Generate the word of the day for a profile.
 * Returns { word, translation }.
 */
export async function generateWordOfDay({ targetLanguage, nativeLanguage, skillScore, existingWords = [] }) {
  const existing = existingWords.slice(0, 80).join(', ') || 'none';
  const cefr = cefrLevel(skillScore);

  const prompt = `You are a language learning assistant.
The user is learning ${targetLanguage} (native: ${nativeLanguage}). Level: ${cefr} (${skillScore}/10000).
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

  const parsed = extractJson(message.content[0].text.trim());
  if (!parsed.word || !parsed.translation) throw new Error('generateWordOfDay: missing word or translation in response');
  console.log(`Word of the day: "${parsed.word}" (${parsed.translation})`);
  return parsed;
}
