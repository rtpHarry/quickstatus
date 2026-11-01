import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ProjectAnalyticsService } from '../../analytics/project-analytics.service';
import { ProjectStorageService } from '../../data/project-storage.service';
import { baselineProjection, closingSummary } from '../../analytics/project-metrics';
import { formatHistoryDate, historyRows, shiftDate, signedChange, HistoryRow } from './stats-history';
import { localActivityDate } from '../../analytics/task-activity.types';
import { sampleStatsHistory } from './sample-stats-history';

@Component({
  selector: 'app-project-stats-history',
  templateUrl: './project-stats-history.component.html',
  styleUrls: ['./project-stats-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar],
})
export class ProjectStatsHistoryComponent {
  @ViewChild(IonModal) modal?: IonModal;

  rows: HistoryRow[] = [];
  historyLoading = false;
  historyError = false;
  canLoadOlder = false;
  showingSample = false;
  private historyProjectId = '';
  private days = 30;
  readonly formatDate = formatHistoryDate;
  readonly signedChange = signedChange;

  constructor(private analytics: ProjectAnalyticsService, private storage: ProjectStorageService,
    private changeDetector: ChangeDetectorRef) {}

  get totals() {
    return this.rows.reduce((total, row) => ({
      added: total.added + row.created, done: total.done + row.completed,
      existing: total.existing + row.completedExisting,
    }), { added: 0, done: 0, existing: 0 });
  }

  get backlogSummary(): string {
    if (!this.rows.length) {
      return '';
    }
    const change = this.rows.reduce((total, row) => total + row.change, 0);
    return change === 0 ? 'Backlog unchanged' : `Backlog ${change < 0 ? 'reduced' : 'increased'} by ${Math.abs(change)}`;
  }

  async open(projectId: string) {
    if (!projectId || this.historyLoading) {
      return;
    }
    this.historyProjectId = projectId;
    this.days = 30;
    this.rows = [];
    this.canLoadOlder = false;
    void this.modal?.present();
    await this.loadHistory();
  }

  showSampleWeek() {
    if (this.historyLoading) {
      return;
    }
    this.rows = sampleStatsHistory(this.historyProjectId);
    this.showingSample = true;
    this.historyError = false;
    this.canLoadOlder = false;
    this.changeDetector.markForCheck();
  }

  async loadHistory(older = false) {
    if (this.historyLoading) {
      return;
    }
    if (this.showingSample) {
      this.rows = [];
      this.days = 30;
      this.showingSample = false;
    }
    this.historyLoading = true;
    this.historyError = false;
    this.changeDetector.markForCheck();
    const days = this.days + (older ? 30 : 0);
    try {
      const today = localActivityDate();
      const from = shiftDate(today, 1 - days);
      const baseline = await this.storage.getTrackingBaseline(this.historyProjectId);
      const summaries = await this.analytics.history(this.historyProjectId, shiftDate(from, -1), today);
      const opening = baseline ? closingSummary(baselineProjection(baseline), baseline.localDate).remaining : 0;
      this.rows = historyRows(summaries, from, opening, baseline?.localDate);
      this.canLoadOlder = !!baseline && baseline.localDate < from;
      this.days = days;
    } catch {
      this.historyError = true;
    } finally {
      this.historyLoading = false;
      this.changeDetector.markForCheck();
    }
  }
}
