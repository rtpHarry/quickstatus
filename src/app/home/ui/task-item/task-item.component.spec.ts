import { TaskItemComponent } from './task-item.component';

describe('Task item input focus', () => {
  it('[focus] waits for Ionic to render the native input before focusing', async () => {
    const component = new TaskItemComponent({} as never);
    let finishRendering!: () => void;
    const rendered = new Promise<void>((resolve) => {
      finishRendering = resolve;
    });
    const nativeInput = {
      focus: jasmine.createSpy('native input focus'),
    };
    let inputReady = false;

    component.input = {
      getInputElement: async () => {
        await rendered;
        inputReady = true;
        return nativeInput;
      },
      setFocus: async () => {
        // Match Ionic's behavior: focus is a no-op before the native input exists.
        if (inputReady) {
          nativeInput.focus();
        }
      },
    } as never;

    const focusing = component.focusInput();
    await Promise.resolve();
    expect(nativeInput.focus).not.toHaveBeenCalled();

    finishRendering();
    await focusing;

    expect(nativeInput.focus).toHaveBeenCalledTimes(1);
  });
});
