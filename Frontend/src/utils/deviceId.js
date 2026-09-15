import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'anonixx_device_id'

// Not cryptographically secure — doesn't need to be. This only fingerprints
// the install for the signup welcome-bonus abuse check (see auth.py's
// _welcome_bonus_for_signup), it's never used for anything security-sensitive.
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

let cachedId = null

export async function getDeviceId() {
  if (cachedId) return cachedId
  try {
    let id = await AsyncStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = generateId()
      await AsyncStorage.setItem(STORAGE_KEY, id)
    }
    cachedId = id
    return id
  } catch {
    return null
  }
}
