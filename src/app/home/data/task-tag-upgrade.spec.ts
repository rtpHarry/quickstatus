import { upgradeTaskTagPrefixes } from './task-tag-upgrade';

describe('Task tag prefix upgrade', () => {
  it('converts only consecutive known leading tags and preserves row metadata', () => {
    expect(upgradeTaskTagPrefixes('❌ [RTP] [M] Work [M] [id:12]\n✅ [M]Other [created:2026/11/05]'))
      .toBe('❌ @RTP @M Work [M] [id:12]\n✅ @M Other [created:2026/11/05]');
  });

  it('preserves unknown prefixes, ordinary brackets, emails and existing @ text', () => {
    const rows = '❌ [BLOCKED] [M] Work\n❌ Work [RTP]\n❌ [m] Work\n❌ @M Email m@example.com';
    expect(upgradeTaskTagPrefixes(rows)).toBe(rows);
  });

  it('is idempotent', () => {
    const upgraded = upgradeTaskTagPrefixes('☑️ [M][RTP] Work');
    expect(upgradeTaskTagPrefixes(upgraded)).toBe(upgraded);
  });
});
