import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Strip markdown code fences the model sometimes adds despite instructions
function stripMarkdown(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// CEFR levels mapped to skill score 0–1000
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

// Pre-assigned topic pool for batch generation — shuffled per call to ensure variety
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

// Grammar structure pool to enforce sentence type variety
const STRUCTURE_POOL = [
  'affirmative statement in present tense with a frequency adverb (toujours, souvent, jamais…)',
  'yes/no question using inversion or est-ce que',
  'past narrative using passé composé (avoir/être + past participle)',
  'imperative / direct command or advice',
  'sentence using a modal verb: devoir, pouvoir, or vouloir',
  'near-future sentence using "aller + infinitive"',
  'conditional hypothesis: "Si... [imparfait], ... [conditionnel]"',
  'exclamation or strong emotional reaction',
  'sentence with a pronominal/reflexive verb (se lever, se souvenir…)',
  'negative sentence using ne… pas, ne… jamais, or ne… rien',
  'comparison sentence using plus… que, moins… que, or aussi… que',
  'relative clause using qui, que, or dont',
  'open question using où, quand, pourquoi, comment, or combien',
  'imperfect tense describing a past habit or ongoing state',
  'sentence using an indirect object pronoun (lui, leur, y, en)',
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
 * Generate a batch of diverse sentences in one AI call.
 * Returns an array of { sourceText, targetText, words }, deduplicated against existingSentences.
 */
export async function generateSentenceBatch({
  targetLanguage,
  nativeLanguage,
  skillScore,
  knownWords = [],
  anchorWord = null,
  count = 10,
  existingSentences = [],
}) {
  const cefr = cefrLevel(skillScore);
  const wordCount = targetWordCount(skillScore);
  const knownList = knownWords.slice(0, 60).join(', ') || 'none yet';
  const avoidList = existingSentences.slice(0, 40).map(s => `"${s}"`).join('\n') || 'none';

  // Pre-assign a unique topic + grammar structure to each slot
  const topics = shuffle(TOPIC_POOL).slice(0, count);
  const structures = shuffle(STRUCTURE_POOL).slice(0, count);

  // ~30% of slots reinforce known vocab, ~70% introduce new words
  const slots = Array.from({ length: count }, (_, i) => {
    const vocab = i < Math.ceil(count * 0.3)
      ? `REINFORCE: use at least one word from the known list naturally`
      : `CHALLENGE: introduce vocabulary NOT in the known list — teach the user something new`;
    const anchor = anchorWord
      ? ` | MANDATORY: the word "${anchorWord}" must appear in target_text verbatim`
      : '';
    return `${i + 1}. Topic: "${topics[i]}" | Grammar: ${structures[i]} | Vocab: ${vocab}${anchor}`;
  }).join('\n');

  const anchorInstruction = anchorWord
    ? `\nCRITICAL RULE: every single sentence MUST contain the exact ${targetLanguage} word "${anchorWord}". If a sentence cannot use it naturally given its topic, restructure the topic — do NOT omit the word under any circumstances.\n`
    : '';

  const prompt = `You are an expert ${targetLanguage} language teacher creating practice sentences for a learner.

LEARNER PROFILE
- Native language: ${nativeLanguage}
- Target language: ${targetLanguage}
- CEFR level: ${cefr} (${skillScore}/10000)
- Target sentence length: ~${wordCount} words
- Known vocabulary: ${knownList}
${anchorInstruction}
TASK
Generate exactly ${count} ${targetLanguage} sentences, one per numbered slot below. Each slot specifies the topic, grammar structure, and vocabulary mode — follow them strictly.

SLOTS
${slots}

GLOBAL RULES (apply to every sentence)
- Match ${cefr} grammar complexity — no simpler, no harder
- Be vivid and specific; avoid generic or textbook-bland phrasing
- No two sentences may share the same subject, verb, or opening pattern
- Do NOT reproduce any of these existing sentences:
${avoidList}

OUTPUT FORMAT
Respond ONLY with a valid JSON array — no markdown, no explanation, no extra keys.
Each element: {"target_text": "...", "source_text": "...", "words": ["word1", ...]}
- target_text: the ${targetLanguage} sentence
- source_text: a fluent, natural ${nativeLanguage} translation
- words: lowercase array of key ${targetLanguage} vocabulary from that sentence (no punctuation)
Return exactly ${count} objects in the same order as the slots.`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3072,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = stripMarkdown(message.content[0].text.trim());
  const parsed = JSON.parse(raw);
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

  const raw = stripMarkdown(message.content[0].text.trim());
  return JSON.parse(raw);
}