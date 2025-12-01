const SESSION_STORAGE_KEY = 'aisyncso:chat:session_id'

export function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function readSessionIdFromStorage() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY)
  } catch (err) {
    console.warn('Unable to read chat session from localStorage:', err)
    return null
  }
}

export function persistSessionId(id: string) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, id)
  } catch (err) {
    console.warn('Unable to store chat session in localStorage:', err)
  }
}

export function clearSessionId() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (err) {
    console.warn('Unable to clear chat session from localStorage:', err)
  }
}


