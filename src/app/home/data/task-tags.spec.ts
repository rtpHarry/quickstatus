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
    expect(fromTagifyText(mixed)).toBe('@CLIENT @Other a@client.com');
    expect(findTaskTags('@client @CLIENT @ClIeNt')).toEqual(['CLIENT']);
  });

  for (const text of [
    '@m @M @rtp @RTP @m Work @M @M',
    '@m\t@M\u00A0@rtp @RTP @m Work @M @M',
  ]) {
    it(`removes repeated leading tags before parsing ${text}`, () => {
      const mixed = toTagifyText(text, ['M', 'RTP']);
      expect(fromTagifyText(mixed)).toBe('@M @RTP Work @M @M');
      expect(mixed.split(tagDelimiters[0]).length - 1).toBe(2);
      expect(fromTagifyText(toTagifyText(fromTagifyText(mixed), ['M', 'RTP'])))
        .toBe('@M @RTP Work @M @M');
    });
  }

  it('removes duplicates from a tag-only prefix and leaves unknown prefixes untouched', () => {
    expect(fromTagifyText(toTagifyText('@M @m', ['M']))).toBe('@M');
    expect(fromTagifyText(toTagifyText('@unknown @M @M Work', ['M'])))
      .toBe('@unknown @M @M Work');
  });
});
