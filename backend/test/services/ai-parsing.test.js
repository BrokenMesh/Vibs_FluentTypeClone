import { describe, it, expect } from 'vitest';
import { stripMarkdown, extractJson, cefrLevel } from '../../src/services/ai.js';

describe('stripMarkdown', () => {
  it('leaves plain text untouched', () => {
    expect(stripMarkdown('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(stripMarkdown('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    expect(stripMarkdown('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe('extractJson', () => {
  it('parses direct valid JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a fenced code block', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON preceded and followed by prose', () => {
    const text = 'Sure, here you go:\n{"a":1}\nHope that helps!';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('parses a JSON array', () => {
    expect(extractJson('here is the array: [{"a":1},{"a":2}] enjoy')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles nested braces inside string values without miscounting depth', () => {
    const text = '{"target_text": "she said {hello} to me", "words": ["a"]}';
    expect(extractJson(text)).toEqual({ target_text: 'she said {hello} to me', words: ['a'] });
  });

  it('throws a descriptive error when no JSON is found', () => {
    expect(() => extractJson('no json here at all')).toThrow(/No JSON found/);
  });

  it('throws a descriptive error on unbalanced JSON', () => {
    expect(() => extractJson('{"a": 1')).toThrow(/Unbalanced/);
  });
});

describe('cefrLevel', () => {
  it.each([
    [0, 'A1'],
    [1666, 'A1'],
    [1667, 'A2'],
    [3333, 'A2'],
    [3334, 'B1'],
    [4999, 'B1'],
    [5000, 'B2'],
    [6665, 'B2'],
    [6666, 'C1'],
    [8332, 'C1'],
    [8333, 'C2'],
    [10000, 'C2'],
  ])('maps skill score %i to %s', (score, expected) => {
    expect(cefrLevel(score)).toBe(expected);
  });
});
