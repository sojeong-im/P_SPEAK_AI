// Multi-slot audio store with IndexedDB persistence.
//
// In-memory ObjectURLs are SPA-session scoped (live as long as the document
// stays open). They die on full reload. Earlier the result page only showed
// free-speech audio if the user reached it without any reload AND had hit
// Stop on the recording. To make audio playback reliable, we mirror each
// slot's Blob into IndexedDB and re-create ObjectURLs on demand.
//
// Slots: 'passage1' | 'passage2' | 'freeSpeech'

export type AudioSlot = 'passage1' | 'passage2' | 'freeSpeech'

const DB_NAME = 'voiceprint_audio'
const STORE = 'blobs'
const VERSION = 1

const memUrls = new Map<AudioSlot, string>()
const memBlobs = new Map<AudioSlot, Blob>()

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error('idb_unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb_open_failed'))
  })
}

async function idbPut(slot: AudioSlot, blob: Blob): Promise<void> {
  if (!isBrowser()) return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, slot)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb_put_failed'))
    })
    db.close()
  } catch (e) {
    console.warn(`[audio-store] idb put failed for ${slot}:`, e)
  }
}

async function idbGet(slot: AudioSlot): Promise<Blob | null> {
  if (!isBrowser()) return null
  try {
    const db = await openDb()
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(slot)
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => reject(req.error ?? new Error('idb_get_failed'))
    })
    db.close()
    return blob
  } catch (e) {
    console.warn(`[audio-store] idb get failed for ${slot}:`, e)
    return null
  }
}

async function idbDelete(slot: AudioSlot): Promise<void> {
  if (!isBrowser()) return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(slot)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb_delete_failed'))
    })
    db.close()
  } catch {
    /* ignore */
  }
}

async function idbClearAll(): Promise<void> {
  if (!isBrowser()) return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb_clear_failed'))
    })
    db.close()
  } catch {
    /* ignore */
  }
}

function revokeMemUrl(slot: AudioSlot): void {
  const u = memUrls.get(slot)
  if (u) {
    try { URL.revokeObjectURL(u) } catch { /* ignore */ }
    memUrls.delete(slot)
  }
  memBlobs.delete(slot)
}

export const audioStore = {
  /** Save Blob for a slot. Returns immediately with an ObjectURL; IDB write is async. */
  set(slot: AudioSlot, blob: Blob): string {
    revokeMemUrl(slot)
    const url = URL.createObjectURL(blob)
    memUrls.set(slot, url)
    memBlobs.set(slot, blob)
    void idbPut(slot, blob)
    return url
  },

  /** Get current in-memory ObjectURL (sync). Null if not loaded yet. */
  getUrl(slot: AudioSlot): string | null {
    return memUrls.get(slot) ?? null
  },

  /** Get the underlying Blob if currently in memory. */
  getBlob(slot: AudioSlot): Blob | null {
    return memBlobs.get(slot) ?? null
  },

  /**
   * Hydrate a slot from IndexedDB if not already in memory.
   * Returns a usable ObjectURL or null.
   */
  async restore(slot: AudioSlot): Promise<string | null> {
    const cached = memUrls.get(slot)
    if (cached) return cached
    const blob = await idbGet(slot)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    memUrls.set(slot, url)
    memBlobs.set(slot, blob)
    return url
  },

  /** Clear a single slot (memory + IDB). */
  async clear(slot: AudioSlot): Promise<void> {
    revokeMemUrl(slot)
    await idbDelete(slot)
  },

  /** Clear every slot. Safe to call from result.handleRestart. */
  async clearAll(): Promise<void> {
    for (const slot of ['passage1', 'passage2', 'freeSpeech'] as AudioSlot[]) {
      revokeMemUrl(slot)
    }
    await idbClearAll()
  },
}
