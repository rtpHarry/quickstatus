import Tagify from '@yaireo/tagify';
import { SettingsComponent } from './settings.component';

describe('Autocomplete tag settings', () => {
  let component: SettingsComponent;
  let tagify: Tagify;
  let input: HTMLInputElement;
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
    dismiss = jasmine.createSpy('dismiss').and.resolveTo(true);
    component = new SettingsComponent(
      {
        get autocompleteTags() {
          return [...saved];
        },
        saveAutocompleteTags: save,
      } as never,
      { get: () => tagify } as never,
      { markForCheck: () => undefined } as never
    );
    component.modal = { dismiss } as never;
    component.open();
    input = document.createElement('input');
    document.body.appendChild(input);
    tagify = new Tagify(input, component.tagSettings);
    tagify.addTags(component.tags);
  });

  afterEach(() => {
    tagify.destroy();
    input.remove();
    document.body.style.display = originalDisplay;
  });

  it('uses a tag-only cloud, accepts new tags and saves removals', async () => {
    expect(tagify.settings.mode).not.toBe('mix');
    tagify.addTags('@follow-up');
    await tagify.removeTags('Client', false, 0);
    await component.save();
    expect(saved).toEqual(['personal', 'follow-up']);
    expect(dismiss).toHaveBeenCalled();
  });

  it('reloads the saved values when opened without saving a draft', () => {
    component.tags.push({ value: 'Temporary' });
    component.open();
    expect(component.tags.map((tag) => tag.value)).toEqual(['Client', 'personal']);
    expect(save).not.toHaveBeenCalled();
  });

  it('sorts added tags alphabetically in the cloud and saved values without moving focus', async () => {
    tagify.DOM.input.focus();
    tagify.addTags(['Zulu', 'alpha', 'Bravo']);
    component.sortTags();
    const expected = ['alpha', 'Bravo', 'Client', 'personal', 'Zulu'];
    expect(tagify.getTagElms().map((tag) => tag.getAttribute('value'))).toEqual(expected);
    expect(tagify.value.map((tag) => tag.value)).toEqual(expected);
    expect(document.activeElement).toBe(tagify.DOM.input);
    await component.save();
    expect(saved).toEqual(expected);
  });

  it('rejects prose and invalid tag characters', () => {
    tagify.addTags(['two words', 'bad!', 'équipe']);
    expect(tagify.value.map((tag) => tag.value)).toEqual(['Client', 'personal', 'équipe']);
  });

  it('keeps the modal open with an error if saving fails', async () => {
    save.and.rejectWith(new Error('Storage unavailable'));
    await component.save();
    expect(component.error).toContain('Could not save');
    expect(component.saving).toBeFalse();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
