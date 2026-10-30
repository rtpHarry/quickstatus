export interface Project {
  id: string;
  name: string;
}

export interface ProjectStorageSnapshot {
  projects: Project[];
  tasks: Record<string, string>;
}

export type LegacyStorageBackup = Record<string, string>;

/** Deleted projects remain in full backups so later history can name them. */
export interface StoredProject extends Project {
  position: number;
  archived?: boolean;
}

/** Step 5 will define the versioned activity payload. */
export interface StoredActivity {
  id: number;
  projectId: string;
  localDate: string;
  [field: string]: unknown;
}

export interface ProjectStorageBackup {
  format: 'quickstatus-backup';
  version: 1;
  projects: StoredProject[];
  tasks: Record<string, string>;
  metadata: Record<string, unknown>;
  events: StoredActivity[];
  analytics: Record<string, unknown>;
}
