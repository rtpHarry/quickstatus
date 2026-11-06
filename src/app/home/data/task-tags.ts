/** Tags use a single word, with optional underscores and hyphens. */
export const taskTagPattern = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u;

export function normalizeTaskTag(value: string): string {
  return value.trim().replace(/^@/, '').toUpperCase();
}

export function normalizeTaskTags(values: string[]): string[] {
  return [...new Set(values.map(normalizeTaskTag).filter((value) => taskTagPattern.test(value)))];
}

/** A whitespace boundary excludes email addresses; punctuation can follow a tag. */
export function replaceTaskTags(text: string, replace: (value: string) => string): string {
  return text.replace(/(^|\s)@([\p{L}\p{N}_][\p{L}\p{N}_-]*)(?=$|\s|[.,!?;:)])/gu,
    (_match, before: string, value: string) => before + replace(value));
}

export function findTaskTags(text: string): string[] {
  const tags: string[] = [];
  replaceTaskTags(text, (value) => {
    tags.push(value);
    return '@' + value;
  });
  return normalizeTaskTags(tags);
}
