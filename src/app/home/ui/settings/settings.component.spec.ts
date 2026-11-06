import Tagify from '@yaireo/tagify';
import { SettingsComponent } from './settings.component';

describe('Autocomplete tag settings', () => {
  let component: SettingsComponent;
  let tagify: Tagify;
  let input: HTMLInputElement;
  let excludedInput: HTMLInputElement;
  let excludedTagify: Tagify;
  let saveExcluded: jasmine.Spy;
  let saved: string[];
  let save: jasmine.Spy;
  let dismiss: jasmine.Spy;
  let originalDisplay: string;

  beforeEach(() => {
    originalDisplay = document.body.style.display;
    document.body.style.display = 'block';
    saved = ['Client', 'personal'];
    save = jasmine.createSpy('saveAutocompleteTags').and.callFake(async (tags: string[]) => {
      saved = [...tags];
    });
    saveExcluded = jasmine.createSpy('saveExcludedHistoryTags').and.resolveTo();
    dismiss = jasmine.createSpy('dismiss').and.resolveTo(true);
    component = new SettingsComponent(
      {
        get autocompleteTags() {
          return [...saved];
        },
        excludedHistoryTags: [],
        saveExcludedHistoryTags: saveExcluded,
        saveAutocompleteTags: save,
      } as never,
      { get: (name: string) => name === 'autocomplete-tags' ? tagify : excludedTagify } as never,
      { markForCheck: () => undefined } as never
    );
    component.modal = { dismiss } as never;
    component.open();
    input = document.createElement('input');
    document.body.appendChild(input);
    tagify = new Tagify(input, component.tagSettings);
    tagify.addTags(component.tags);
    excludedInput = document.createElement('input');
    document.body.appendChild(excludedInput);
    excludedTagify = new Tagify(excludedInput, component.tagSettings);
  });

  afterEach(() => {
    excludedTagify.destroy();
    excludedInput.remove();
    tagify.destroy();
    input.remove();
    document.body.style.display = originalDisplay;
  });

  it('uses a tag-only cloud, accepts new tags and saves removals', async () => {
    expect(tagify.settings.mode).not.toBe('mix');
    tagify.addTags('@follow-up');
    await tagify.removeTags('CLIENT', false, 0);
    await component.save();
    expect(saved).toEqual(['PERSONAL', 'FOLLOW-UP']);
    expect(dismiss).toHaveBeenCalled();
  });

  it('reloads the saved values when opened without saving a draft', () => {
    component.tags.push({ value: 'Temporary' });
    component.open();
    expect(component.tags.map((tag) => tag.value)).toEqual(['CLIENT', 'PERSONAL']);
    expect(save).not.toHaveBeenCalled();
  });

  it('uppercases new tags and silently dismisses casing variants of existing tags', async () => {
    tagify.addTags(['client', 'cLiEnT', '@Personal', 'newTag', 'NEWTAG']);
    expect(tagify.value.map((tag) => tag.value)).toEqual(['CLIENT', 'PERSONAL', 'NEWTAG']);
    expect(tagify.getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(['CLIENT', 'PERSONAL', 'NEWTAG']);
    await component.save();
    expect(saved).toEqual(['CLIENT', 'PERSONAL', 'NEWTAG']);
  });

  it('sorts added tags alphabetically in the cloud and saved values without moving focus', async () => {
    tagify.DOM.input.focus();
    tagify.addTags(['Zulu', 'alpha', 'Bravo']);
    component.sortTags();
    const expected = ['ALPHA', 'BRAVO', 'CLIENT', 'PERSONAL', 'ZULU'];
    expect(tagify.getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(expected);
    expect(tagify.value.map((tag) => tag.value)).toEqual(expected);
    expect(document.activeElement).toBe(tagify.DOM.input);
    await component.save();
    expect(saved).toEqual(expected);
  });

  it('rejects prose and invalid tag characters', () => {
    tagify.addTags(['two words', 'bad!', 'équipe']);
    expect(tagify.value.map((tag) => tag.value)).toEqual(['CLIENT', 'PERSONAL', 'ÉQUIPE']);
  });

  it('saves pending exclusion tags independently of autocomplete suggestions', async () => {
    excludedTagify.addTags('@personal');
    excludedTagify.DOM.input.textContent = 'internal';
    await component.save();
    expect(saveExcluded).toHaveBeenCalledWith(['PERSONAL', 'INTERNAL']);
    expect(saved).toEqual(['CLIENT', 'PERSONAL']);
    expect(dismiss).toHaveBeenCalled();
  });

  it('keeps the settings open if exclusion saving fails', async () => {
    saveExcluded.and.rejectWith(new Error('Storage unavailable'));
    await component.save();
    expect(component.error).toContain('Could not save');
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('keeps the modal open with an error if saving fails', async () => {
    save.and.rejectWith(new Error('Storage unavailable'));
    await component.save();
    expect(component.error).toContain('Could not save');
    expect(component.saving).toBeFalse();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
