import { replaceTaskTags } from '../../data/task-tags';

// Private-use delimiters keep ordinary bracket notation out of Tagify's parser.
export const tagDelimiters: [string, string] = ['\uE000', '\uE001'];

export function sortTaskTagsToStart(mixedText: string, tagValues: string[]): string {
  const description = fromTagifyText(mixedText.replace(/\uE000[^\uE001]*\uE001[ \u00A0]*/g, '')).trim();
  const prefix = [...tagValues].sort((a, b) => a.localeCompare(b)).map((value) => '@' + value).join(' ');
  // Leave exactly one separator at the caret for continued typing.
  return description ? `${prefix} ${description} ` : `${prefix} `;
}

export function toTagifyText(text: string, suggestions: string[]): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const known = new Set(suggestions);
  return replaceTaskTags(escaped, (value) => {
    return known.has(value) ? tagDelimiters[0] + JSON.stringify({ value, prefix: '@' }) + tagDelimiters[1] : '@' + value;
  });
}

export function fromTagifyText(text: string): string {
  return text.replace(/\uE000([^\uE001]*)\uE001/g, (match, json: string) => {
    try {
      const tag: unknown = JSON.parse(json);
      if (typeof tag === 'object' && tag !== null && 'value' in tag && typeof tag.value === 'string') {
        return '@' + tag.value;
      }
    } catch {
      // Preserve literal text that happens to contain the editor delimiters.
    }
    return match;
  }).replace(/\u200B/g, '').replace(/\u00A0/g, ' ').replace(/\r?\n$/, '').replace(/[\r\n]+/g, ' ');
}
