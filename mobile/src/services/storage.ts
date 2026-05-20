import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_NAME = 'talk2scale_prefs';
const KEY_MAC = 'scale_mac';
const KEY_USER_ID = 'user_id';

export async function getStoredMac(): Promise<string | null> {
  return AsyncStorage.getItem(`${PREFS_NAME}:${KEY_MAC}`);
}

export async function storeMac(mac: string): Promise<void> {
  await AsyncStorage.setItem(`${PREFS_NAME}:${KEY_MAC}`, mac);
}

export async function clearStoredMac(): Promise<void> {
  await AsyncStorage.removeItem(`${PREFS_NAME}:${KEY_MAC}`);
}

export async function getUserId(): Promise<number> {
  const raw = await AsyncStorage.getItem(`${PREFS_NAME}:${KEY_USER_ID}`);
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function setUserId(userId: number): Promise<void> {
  await AsyncStorage.setItem(`${PREFS_NAME}:${KEY_USER_ID}`, String(userId));
}
