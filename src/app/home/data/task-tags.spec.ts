import { findTaskTags, normalizeTaskTags } from './task-tags';
import { fromTagifyText, tagDelimiters, toTagifyText } from '../ui/task-text-editor/task-tag-text';

describe('Dynamic task tags', () => {
  it('discovers distinct tags with punctuation and unicode, excluding emails and bracket metadata', () => {
    expect(findTaskTags('❌ @Client @follow-up, @équipe @Client a@host.com [id:2] @personal.'))
      .toEqual(['CLIENT', 'FOLLOW-UP', 'ÉQUIPE', 'PERSONAL']);
  });

  it('normalizes optional prefixes and rejects multiword values', () => {
    expect(normalizeTaskTags([' @Client ', 'Client', 'cLiEnT', 'two words', '', '@follow-up']))
      .toEqual(['CLIENT', 'FOLLOW-UP']);
  });

  it('recognizes only configured tags while preserving all readable text', () => {
    const text = '@Client Work @other <b> & a@Client.com';
    const mixed = toTagifyText(text, ['Client']);
    expect(mixed).toContain('"value":"CLIENT"');
    expect(mixed).toContain('@other');
    expect(mixed).toContain('&lt;b&gt;');
    expect(fromTagifyText(toTagifyText('@Client Work @other', []))).toBe('@Client Work @other');
  });

  for (const text of [
    'lets check out @matthew and things',
    '@M Work @matthew',
    '@M, @matthew',
    '@unknown @matthew',
    '<b> @matthew',
  ]) {
    it(`restores only leading known tags in ${text}`, () => {
      const mixed = toTagifyText(text, ['M', 'MATTHEW']);
      expect(mixed).toContain('@matthew');
      expect(mixed).not.toContain('"value":"MATTHEW"');
      if (text.startsWith('@M')) {
        expect(mixed).toContain(tagDelimiters[0]);
      } else {
        expect(mixed).not.toContain(tagDelimiters[0]);
      }
    });
  }

  it('matches configured tags regardless of casing and serializes accepted tags in uppercase', () => {
    const mixed = toTagifyText('@client @ClIeNt @Other a@client.com', ['Client']);
    expect(fromTagifyText(mixed)).toBe('@CLIENT @CLIENT @Other a@client.com');
    expect(findTaskTags('@client @CLIENT @ClIeNt')).toEqual(['CLIENT']);
  });
});
