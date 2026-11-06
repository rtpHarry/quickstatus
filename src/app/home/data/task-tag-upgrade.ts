/** Upgrade only the recognised, contiguous bracket prefixes after a row's status. */
export function upgradeTaskTagPrefixes(tasks: string): string {
  return tasks.replace(/^(\S+[ \t]+)((?:\[(?:M|RTP)\][ \t]*)+)/gm, (_match, status: string, prefixes: string) => {
    const tags = prefixes.replace(/\[(M|RTP)\][ \t]*/g, '@$1 ');
    return status + tags;
  });
}
