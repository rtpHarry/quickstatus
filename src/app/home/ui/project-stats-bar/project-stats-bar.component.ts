import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ProjectDailySummary } from '../../analytics/task-activity.types';

@Component({
  selector: 'app-project-stats-bar',
  templateUrl: './project-stats-bar.component.html',
  styleUrls: ['./project-stats-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class ProjectStatsBarComponent {
  @Input() summary: ProjectDailySummary | null | undefined;
  @Input() loading = false;
  @Input() error: unknown;
  @Input() hasProject = false;
}
