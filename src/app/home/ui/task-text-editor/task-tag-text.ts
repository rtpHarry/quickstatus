import { normalizeTaskTag, normalizeTaskTags } from '../../data/task-tags';

// Private-use delimiters keep ordinary bracket notation out of Tagify's parser.
export const tagDelimiters: [string, string] = ['\uE000', '\uE001'];

export function sortTaskTagsToStart(mixedText: string, tagValues: string[]): string {
  const description = fromTagifyText(mixedText.replace(/\uE000[^\uE001]*\uE001[ \u00A0]*/g, '')).trim();
  const prefix = [...tagValues].sort((a, b) => a.localeCompare(b)).map((value) => '@' + value).join(' ');
  // Leave exactly one separator at the caret for continued typing.
  return description ? `${prefix} ${description} ` : `${prefix} `;
}

/** Only known tags in the uninterrupted prefix are restored as accepted tags. */
export function leadingTaskTags(text: string, suggestions: string[]): { value: string; start: number; end: number }[] {
  const known = new Set(normalizeTaskTags(suggestions));
  const pattern = /[ \t\u00A0]*@([\p{L}\p{N}_][\p{L}\p{N}_-]*)(?=$|\s|[.,!?;:)])/uy;
  const tags: { value: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = normalizeTaskTag(match[1]);
    if (!known.has(value)) {
      break;
    }
    tags.push({ value, start: pattern.lastIndex - match[1].length - 1, end: pattern.lastIndex });
  }
  return tags;
}

export function toTagifyText(text: string, suggestions: string[]): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let mixed = '';
  let end = 0;
  for (const tag of leadingTaskTags(escaped, suggestions)) {
    mixed += escaped.slice(end, tag.start) + tagDelimiters[0] + JSON.stringify({ value: tag.value, prefix: '@' }) + tagDelimiters[1];
    end = tag.end;
  }
  return mixed + escaped.slice(end);
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
