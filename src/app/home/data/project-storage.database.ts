/** All related writes can share one transaction, including future activity. */
export const projectStoreNames = ['projects', 'lists', 'metadata', 'events', 'analytics'] as const;
export const projectDatabaseName = 'quickstatus';

export function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(projectDatabaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('lists', { keyPath: 'projectId' });
      db.createObjectStore('metadata');
      const events = db.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('projectDate', ['projectId', 'localDate']);
      db.createObjectStore('analytics');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other Quick Status tabs and try again.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction aborted'));
    // Request errors abort the transaction unless explicitly handled.
    transaction.onerror = () => undefined;
  });
}
