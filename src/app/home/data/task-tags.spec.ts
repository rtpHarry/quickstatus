import { findTaskTags, normalizeTaskTags } from './task-tags';
import { fromTagifyText, toTagifyText } from '../ui/task-text-editor/task-tag-text';

describe('Dynamic task tags', () => {
  it('discovers distinct tags with punctuation and unicode, excluding emails and bracket metadata', () => {
    expect(findTaskTags('❌ @Client @follow-up, @équipe @Client a@host.com [id:2] @personal.'))
      .toEqual(['Client', 'follow-up', 'équipe', 'personal']);
  });

  it('normalizes optional prefixes and rejects multiword values', () => {
    expect(normalizeTaskTags([' @Client ', 'Client', 'two words', '', '@follow-up']))
      .toEqual(['Client', 'follow-up']);
  });

  it('recognizes only configured tags while preserving all readable text', () => {
    const text = '@Client Work @other <b> & a@Client.com';
    const mixed = toTagifyText(text, ['Client']);
    expect(mixed).toContain('"value":"Client"');
    expect(mixed).toContain('@other');
    expect(mixed).toContain('&lt;b&gt;');
    expect(fromTagifyText(toTagifyText('@Client Work @other', []))).toBe('@Client Work @other');
  });
});
