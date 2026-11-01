import { ChangeDetectionStrategy, Component, Input, ViewChild } from '@angular/core';
import { ProjectDailySummary } from '../../analytics/task-activity.types';
import { ProjectStatsHistoryComponent } from '../project-stats-history/project-stats-history.component';

@Component({
  selector: 'app-project-stats-bar',
  templateUrl: './project-stats-bar.component.html',
  styleUrls: ['./project-stats-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ProjectStatsHistoryComponent],
})
export class ProjectStatsBarComponent {
  @Input() summary: ProjectDailySummary | null | undefined;
  @Input() loading = false;
  @Input() error: unknown;
  @Input() hasProject = false;
  @Input() projectId = '';
  @ViewChild(ProjectStatsHistoryComponent) history?: ProjectStatsHistoryComponent;

  async openHistory() {
    if (!this.projectId || this.loading) {
      return;
    }
    await this.history?.open(this.projectId);
  }
}
