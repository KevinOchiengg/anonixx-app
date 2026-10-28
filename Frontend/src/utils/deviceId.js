import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'anonixx_device_id'

// Not secure, and doesn't need to be: only used to limit signup bonuses per install.
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
