import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject, catchError, defer, distinctUntilChanged, EMPTY, filter, finalize,
  fromEvent, interval, map, merge, of, skip, startWith, Subject, switchMap, tap,
} from 'rxjs';
import { ProjectStorageService } from '../data/project-storage.service';
import { localActivityDate, ProjectDailySummary } from './task-activity.types';

/** Step 8 selects a project and consumes today$; this service owns no UI. */
@Injectable({ providedIn: 'root' })
export class ProjectAnalyticsService {
  private readonly todaySubject = new BehaviorSubject<ProjectDailySummary | undefined>(undefined);
  readonly today$ = this.todaySubject.asObservable();
  private readonly errorSubject = new BehaviorSubject<unknown>(null);
  readonly error$ = this.errorSubject.asObservable();
  private readonly refreshRequests = new Subject<() => void>();
  private projectId = '';

  constructor(private storage: ProjectStorageService) {
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    const dayChanged$ = interval(60000).pipe(
      map(() => localActivityDate()),
      startWith(localActivityDate()),
      distinctUntilChanged(),
      skip(1),
    );
    const visible$ = fromEvent(document, 'visibilitychange').pipe(
      filter(() => document.visibilityState === 'visible'),
    );
    const automaticRefresh$ = merge(
      storage.committedActivity$.pipe(filter(({ projectId }) => projectId === this.projectId)),
      storage.restored$,
      dayChanged$,
      visible$,
      window ? fromEvent(window, 'focus') : EMPTY,
    ).pipe(map(() => undefined));

    merge(this.refreshRequests, automaticRefresh$).pipe(
      switchMap(done => defer(() => this.projectId
        ? this.storage.getDailySummary(this.projectId, localActivityDate())
        : of(undefined)
      ).pipe(
        tap(summary => {
          this.errorSubject.next(null);
          this.todaySubject.next(summary);
        }),
        // A failed read must not terminate future refreshes.
        catchError(error => {
          this.errorSubject.next(error);
          return EMPTY;
        }),
        // Superseded reads also settle callers awaiting refresh/navigation.
        finalize(() => done?.()),
      )),
      takeUntilDestroyed(),
    ).subscribe();
  }

  selectProject(projectId: string): Promise<void> {
    this.projectId = projectId;
    this.todaySubject.next(undefined);
    this.errorSubject.next(null);
    return this.refresh();
  }

  refresh(): Promise<void> {
    return new Promise(resolve => this.refreshRequests.next(resolve));
  }

  history(projectId: string, fromDate: string, toDate: string): Promise<ProjectDailySummary[]> {
    return this.storage.getDailyHistory(projectId, fromDate, toDate);
  }
}
