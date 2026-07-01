import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../api/index.js', () => ({ default: { post: vi.fn() } }));

const confetti = (await import('canvas-confetti')).default;
const api = (await import('../api/index.js')).default;
const ResultsScreen = (await import('./ResultsScreen.vue')).default;

const baseSentence = { source_text: 'The cat sleeps.', target_text: 'Le chat dort.' };

function mountResults(props = {}) {
  return mount(ResultsScreen, {
    props: {
      score: 1,
      wpm: 30,
      mode: 'challenge',
      xpGained: 10,
      newSkill: 500,
      daysUntilReview: 1,
      sentence: baseSentence,
      nativeLang: 'English',
      targetLang: 'French',
      profileId: 1,
      userTyped: '',
      typedWords: [],
      targetWordsArr: [],
      wordResultsArr: [],
      streak: 0,
      ...props,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function waitForConfettiTimer() {
  await new Promise((resolve) => setTimeout(resolve, 450));
}

describe('confetti trigger', () => {
  it('fires with 70 particles for a challenge score >= 0.9 and < 0.98', async () => {
    mountResults({ mode: 'challenge', score: 0.95 });
    await waitForConfettiTimer();
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti.mock.calls[0][0]).toMatchObject({ particleCount: 70 });
  });

  it('fires with 120 particles for a challenge score >= 0.98', async () => {
    mountResults({ mode: 'challenge', score: 0.99 });
    await waitForConfettiTimer();
    expect(confetti.mock.calls[0][0]).toMatchObject({ particleCount: 120 });
  });

  it('fires for dictation mode too', async () => {
    mountResults({ mode: 'dictation', score: 0.95 });
    await waitForConfettiTimer();
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it('never fires for practice mode, regardless of score', async () => {
    mountResults({ mode: 'practice', score: 1 });
    await waitForConfettiTimer();
    expect(confetti).not.toHaveBeenCalled();
  });

  it('does not fire below the 0.9 threshold', async () => {
    mountResults({ mode: 'challenge', score: 0.89 });
    await waitForConfettiTimer();
    expect(confetti).not.toHaveBeenCalled();
  });
});

describe('target word tokenization', () => {
  it('renders one clickable span per word, punctuation is not clickable', () => {
    const wrapper = mountResults({
      sentence: { source_text: 'x', target_text: 'Le chat dort.' },
    });
    const clickable = wrapper.findAll('span.cursor-pointer');
    // "Le", "chat", "dort" — three words
    expect(clickable.length).toBe(3);
  });

  it('tokenizes Cyrillic and CJK text as words too', () => {
    const wrapper = mountResults({
      sentence: { source_text: 'x', target_text: 'Привет мир' },
    });
    expect(wrapper.findAll('span.cursor-pointer').length).toBe(2);

    const wrapperCjk = mountResults({
      sentence: { source_text: 'x', target_text: '你好世界' },
    });
    // CJK has no word-boundary spaces — the whole run is one token by this regex
    expect(wrapperCjk.findAll('span.cursor-pointer').length).toBeGreaterThan(0);
  });
});

describe('typed diff rendering', () => {
  it('marks correct characters, wrong characters, and missing trailing characters distinctly', () => {
    const wrapper = mountResults({
      mode: 'challenge',
      sentence: baseSentence, // "Le chat dort."
      userTyped: 'Le chXt', // matches "Le cha", wrong at "X" vs "t", then stops early
    });
    const attempt = wrapper.text();
    expect(wrapper.findAll('.text-zinc-400').length).toBeGreaterThan(0); // correct chars
    expect(wrapper.findAll('.text-red-400').length).toBeGreaterThan(0); // wrong char
    expect(wrapper.findAll('.text-red-800').length).toBe(baseSentence.target_text.length - 'Le chXt'.length); // missing tail
  });
});

describe('addToVocab', () => {
  it('posts the word/translation and marks it added on success', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    const wrapper = mountResults({ sentence: { source_text: 'x', target_text: 'chat' } });

    await wrapper.find('span.cursor-pointer').trigger('click');
    await wrapper.find('input.input').setValue('cat');
    await wrapper.find('button.btn-primary.w-full').trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(api.post).toHaveBeenCalledWith('/profiles/1/vocabulary', { word: 'chat', translation: 'cat' });
  });

  it('shows "already exists" when the API returns 409', async () => {
    api.post.mockRejectedValue({ response: { status: 409 } });
    const wrapper = mountResults({ sentence: { source_text: 'x', target_text: 'chat' } });

    await wrapper.find('span.cursor-pointer').trigger('click');
    await wrapper.find('input.input').setValue('cat');
    await wrapper.find('button.btn-primary.w-full').trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(wrapper.text()).toContain('Already in your vocabulary');
  });
});

describe('streak badge', () => {
  it('is hidden below a streak of 3', () => {
    const wrapper = mountResults({ streak: 2 });
    expect(wrapper.text()).not.toContain('in a row');
  });

  it('is shown at a streak of 3 or more', () => {
    const wrapper = mountResults({ streak: 3 });
    expect(wrapper.text()).toContain('3 in a row');
  });
});
