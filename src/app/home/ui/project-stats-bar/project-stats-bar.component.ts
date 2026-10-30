import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonToolbar } from '@ionic/angular/standalone';
import { ProjectDailySummary } from '../../analytics/task-activity.types';

@Component({
  selector: 'app-project-stats-bar',
  templateUrl: './project-stats-bar.component.html',
  styleUrls: ['./project-stats-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonToolbar],
})
export class ProjectStatsBarComponent {
  @Input() summary: ProjectDailySummary | null | undefined;
  @Input() loading = false;
  @Input() error: unknown;
  @Input() hasProject = false;
}
