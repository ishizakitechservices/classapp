/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_NAME = 'ClassAppDB';
const DB_VERSION = 2;

export const STORES = {
  SUBJECTS: 'subjects',
  VAULT_FILES: 'vault_files',
  NOTICES: 'notices',
  CHAT_MESSAGES: 'chat_messages',
  QUIZ_ATTEMPTS: 'quiz_attempts',
  FLASHCARD_PROGRESS: 'flashcard_progress',
  CONNECTED_SERVICES: 'connected_services',
  APP_METADATA: 'app_metadata',
  /** Generated quizzes and decks, kept so a set reopens offline without a round trip. */
  STUDY_SETS: 'study_sets',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openClassAppDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Subjects store
      if (!db.objectStoreNames.contains(STORES.SUBJECTS)) {
        db.createObjectStore(STORES.SUBJECTS, { keyPath: 'id' });
      }

      // Vault files store (stores metadata + real document text/slides for offline study)
      if (!db.objectStoreNames.contains(STORES.VAULT_FILES)) {
        const fileStore = db.createObjectStore(STORES.VAULT_FILES, { keyPath: 'id' });
        fileStore.createIndex('subjectId', 'subjectId', { unique: false });
        fileStore.createIndex('folder', 'folder', { unique: false });
        fileStore.createIndex('isOffline', 'isOffline', { unique: false });
      }

      // Notices store
      if (!db.objectStoreNames.contains(STORES.NOTICES)) {
        const noticeStore = db.createObjectStore(STORES.NOTICES, { keyPath: 'id' });
        noticeStore.createIndex('isUnread', 'isUnread', { unique: false });
        noticeStore.createIndex('isPinned', 'isPinned', { unique: false });
      }

      // Chat messages store
      if (!db.objectStoreNames.contains(STORES.CHAT_MESSAGES)) {
        db.createObjectStore(STORES.CHAT_MESSAGES, { keyPath: 'id' });
      }

      // Quiz attempts store
      if (!db.objectStoreNames.contains(STORES.QUIZ_ATTEMPTS)) {
        const quizStore = db.createObjectStore(STORES.QUIZ_ATTEMPTS, { keyPath: 'id' });
        quizStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Flashcards progress store
      if (!db.objectStoreNames.contains(STORES.FLASHCARD_PROGRESS)) {
        db.createObjectStore(STORES.FLASHCARD_PROGRESS, { keyPath: 'cardId' });
      }

      // Connected services store
      if (!db.objectStoreNames.contains(STORES.CONNECTED_SERVICES)) {
        db.createObjectStore(STORES.CONNECTED_SERVICES, { keyPath: 'id' });
      }

      // App metadata
      if (!db.objectStoreNames.contains(STORES.APP_METADATA)) {
        db.createObjectStore(STORES.APP_METADATA, { keyPath: 'key' });
      }

      // Generated study sets (v2). Keyed by the same signature the server caches on, so
      // a set opened twice is read from the device, and works offline afterwards.
      if (!db.objectStoreNames.contains(STORES.STUDY_SETS)) {
        const studyStore = db.createObjectStore(STORES.STUDY_SETS, { keyPath: 'key' });
        studyStore.createIndex('kind', 'kind', { unique: false });
        studyStore.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };

    request.onblocked = () => {
      console.warn('ClassApp IndexedDB blocked by another active connection');
    };
  });

  return dbPromise;
}

export async function dbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openClassAppDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error || new Error(`Error reading from ${storeName}`));
    });
  } catch (err) {
    console.warn(`IndexedDB dbGetAll failed for ${storeName}:`, err);
    return [];
  }
}

export async function dbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  try {
    const db = await openClassAppDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error || new Error(`Error getting key ${key} from ${storeName}`));
    });
  } catch (err) {
    console.warn(`IndexedDB dbGet failed for ${storeName}/${key}:`, err);
    return undefined;
  }
}

export async function dbPut<T>(storeName: string, value: T): Promise<void> {
  try {
    const db = await openClassAppDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Error putting into ${storeName}`));
    });
  } catch (err) {
    console.warn(`IndexedDB dbPut failed for ${storeName}:`, err);
  }
}

export async function dbPutMany<T>(storeName: string, values: T[]): Promise<void> {
  if (!values.length) return;
  try {
    const db = await openClassAppDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on ${storeName}`));
      tx.onabort = () => reject(new Error(`Transaction aborted on ${storeName}`));

      for (const val of values) {
        store.put(val);
      }
    });
  } catch (err) {
    console.warn(`IndexedDB dbPutMany failed for ${storeName}:`, err);
  }
}

export async function dbDelete(storeName: string, key: string): Promise<void> {
  try {
    const db = await openClassAppDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Error deleting key from ${storeName}`));
    });
  } catch (err) {
    console.warn(`IndexedDB dbDelete failed for ${storeName}/${key}:`, err);
  }
}

export async function dbClear(storeName: string): Promise<void> {
  try {
    const db = await openClassAppDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Error clearing ${storeName}`));
    });
  } catch (err) {
    console.warn(`IndexedDB dbClear failed for ${storeName}:`, err);
  }
}

export async function getStorageQuotaEstimate(): Promise<{
  usageMB: number;
  quotaMB: number;
  percentageUsed: number;
  isAvailable: boolean;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const usage = est.usage || 0;
      const quota = est.quota || 1;
      const usageMB = usage / (1024 * 1024);
      const quotaMB = quota / (1024 * 1024);
      const percentageUsed = Math.min(100, Math.round((usage / quota) * 100));

      return {
        usageMB: Math.round(usageMB * 10) / 10,
        quotaMB: Math.round(quotaMB),
        percentageUsed,
        isAvailable: true,
      };
    } catch (e) {
      console.warn('Storage estimate error:', e);
    }
  }

  return {
    usageMB: 0,
    quotaMB: 0,
    percentageUsed: 0,
    isAvailable: false,
  };
}
