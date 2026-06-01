import { Audio } from 'expo-av';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version;
  const permissions: Permission[] = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ];

  if (typeof apiLevel === 'number' && apiLevel <= 30) {
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (p) => results[p] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export async function requestRecordAudioPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}
