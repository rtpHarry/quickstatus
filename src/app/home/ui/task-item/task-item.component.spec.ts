import { TaskItemComponent } from './task-item.component';

describe('Task item editor shortcuts', () => {
  it('delegates row focus to the editor', async () => {
    const component = new TaskItemComponent({} as never);
    const focus = jasmine.createSpy('focus').and.resolveTo();
    component.input = { focus } as never;
    await component.focusInput();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('prevents a newline when Enter creates a task', () => {
    const component = new TaskItemComponent({} as never);
    component.task = { text: 'Work', status: '❌' };
    const enter = spyOn(component.enterKey, 'emit');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component.handleKeydown(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(enter).toHaveBeenCalledTimes(1);
  });
});
