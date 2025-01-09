import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { AlertController, IonicModule } from '@ionic/angular';

import { TaskListComponent } from './task-list.component';

describe('TaskListComponent', () => {
  let component: TaskListComponent;
  let fixture: ComponentFixture<TaskListComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [TaskListComponent],
      imports: [IonicModule.forRoot()],
      providers: [AlertController],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should reset tasks', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.tasks = [{ status: '☑️', text: 'Task 1' }];
    await component.resetTasks();
    expect(component.tasks.length).toBe(0);
  });
});
