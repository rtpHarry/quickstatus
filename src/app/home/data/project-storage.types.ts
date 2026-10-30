export interface Project {
  id: string;
  name: string;
}

export interface ProjectStorageSnapshot {
  projects: Project[];
  tasks: Record<string, string>;
}

/** Existing console-restorable backup format, retained until the IndexedDB move. */
export type LegacyStorageBackup = Record<string, string>;
