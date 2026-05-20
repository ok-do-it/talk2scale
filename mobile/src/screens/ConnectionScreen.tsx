import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { ConnectionState } from '../constants/ble';
import type { RootStackParamList } from '../navigation/types';
import { requestBluetoothPermissions } from '../services/permissions';
import { getStoredMac } from '../services/storage';
import { useScaleStore } from '../state/scaleStore';
import {
  bleScaleTransport,
  type ScannedDevice,
} from '../transport/BleScaleTransport';

type Props = NativeStackScreenProps<RootStackParamList, 'Connection'>;

export function ConnectionScreen({ navigation, route }: Props) {
  const autoStartConnect = route.params?.autoStartConnect ?? false;
  const connectionState = useScaleStore((s) => s.connectionState);
  const isConnectionInProgress = useScaleStore((s) => s.isConnectionInProgress);
  const isConnected = useScaleStore((s) => s.isConnected);
  const prepareForRealConnection = useScaleStore((s) => s.prepareForRealConnection);
  const connectToRealDevice = useScaleStore((s) => s.connectToRealDevice);
  const disconnect = useScaleStore((s) => s.disconnect);
  const cancelConnection = useScaleStore((s) => s.cancelConnection);
  const forgetStoredDevice = useScaleStore((s) => s.forgetStoredDevice);

  const [statusText, setStatusText] = useState('Disconnected');
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const wasConnectedOnEntry = useRef(false);
  const attemptedConnect = useRef(false);
  const didAutoReturn = useRef(false);

  const refreshDevices = useCallback(() => {
    setDevices(bleScaleTransport.getDiscoveredDevices());
  }, []);

  const setStatus = (text: string, showSpinner: boolean) => {
    setStatusText(text);
    setConnecting(showSpinner);
  };

  const beginConnection = useCallback(async () => {
    const granted = await requestBluetoothPermissions();
    if (!granted) {
      setStatus('Bluetooth permission denied', false);
      return;
    }

    const mac = await getStoredMac();
    if (mac) {
      setStatus('Reconnecting…', true);
      try {
        await connectToRealDevice(mac, true);
      } catch {
        setStatus('Connection failed', false);
      }
      return;
    }

    setStatus('Searching for scale…', true);
    bleScaleTransport.clearDiscovered();
    bleScaleTransport.startScan(refreshDevices);
  }, [connectToRealDevice, refreshDevices]);

  const startConnectionFlow = useCallback(() => {
    attemptedConnect.current = true;
    prepareForRealConnection();
    void beginConnection();
  }, [beginConnection, prepareForRealConnection]);

  useEffect(() => {
    const connectedOnEntry = isConnected();
    wasConnectedOnEntry.current = connectedOnEntry;
    if (autoStartConnect && !connectedOnEntry) {
      startConnectionFlow();
    } else if (connectedOnEntry) {
      setStatus('Connected', false);
    } else {
      void getStoredMac().then((mac) =>
        setStatus(mac ? 'Reconnecting…' : 'Searching for scale…', false),
      );
    }

    return () => {
      bleScaleTransport.stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartConnect]);

  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      bleScaleTransport.stopScan();
      setStatus('Connected', false);
      if (
        !didAutoReturn.current &&
        !wasConnectedOnEntry.current &&
        attemptedConnect.current
      ) {
        didAutoReturn.current = true;
        navigation.goBack();
      }
    } else if (isConnectionInProgress()) {
      void getStoredMac().then((mac) =>
        setStatus(mac ? 'Reconnecting…' : 'Searching for scale…', true),
      );
    }
  }, [connectionState, isConnectionInProgress, navigation]);

  const handleConnect = () => startConnectionFlow();

  const handleDisconnect = () => {
    disconnect();
    setStatus('Disconnected', false);
  };

  const handleForget = async () => {
    await forgetStoredDevice();
    Alert.alert('Stored device forgotten');
  };

  const handleClose = () => {
    if (isConnectionInProgress()) {
      cancelConnection();
      bleScaleTransport.stopScan();
    }
    navigation.goBack();
  };

  const handleSelectDevice = async (device: ScannedDevice) => {
    bleScaleTransport.stopScan();
    setStatus('Connecting…', true);
    try {
      await connectToRealDevice(device.id, false);
    } catch {
      setStatus('Connection failed', false);
    }
  };

  const connected = connectionState === ConnectionState.CONNECTED;
  const inProgress = isConnectionInProgress();

  return (
    <View style={styles.container}>
      <Ionicons name="bluetooth" size={64} color="#1976D2" style={styles.icon} />
      <Text style={styles.status}>{statusText}</Text>
      {connecting && <ActivityIndicator size="large" style={styles.spinner} />}

      {!connected && !inProgress && devices.length > 0 && (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.id}
          style={styles.deviceList}
          renderItem={({ item }) => (
            <Pressable
              style={styles.deviceRow}
              onPress={() => void handleSelectDevice(item)}
            >
              <Text style={styles.deviceName}>
                {item.name ?? 'Unknown device'}
              </Text>
              <Text style={styles.deviceId}>{item.id}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, (!connected && !inProgress) ? styles.btnEnabled : styles.btnDisabled]}
          disabled={connected || inProgress}
          onPress={handleConnect}
        >
          <Text>CONNECT</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, connected ? styles.btnEnabled : styles.btnDisabled]}
          disabled={!connected}
          onPress={handleDisconnect}
        >
          <Text>DISCONNECT</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, !inProgress ? styles.btnEnabled : styles.btnDisabled]}
          disabled={inProgress}
          onPress={() => void handleForget()}
        >
          <Text>FORGET ALL DEVICES</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={handleClose}>
          <Text>{inProgress ? 'Cancel' : 'Back'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  icon: { marginBottom: 24 },
  status: { fontSize: 18, marginBottom: 12 },
  spinner: { marginBottom: 16 },
  deviceList: { alignSelf: 'stretch', maxHeight: 200, marginBottom: 16 },
  deviceRow: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  deviceName: { fontSize: 16, fontWeight: '600' },
  deviceId: { fontSize: 12, color: '#666' },
  buttons: { alignSelf: 'stretch', gap: 12, marginTop: 'auto', paddingBottom: 32 },
  btn: {
    padding: 14,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  btnEnabled: { backgroundColor: '#e3f2fd' },
  btnDisabled: { opacity: 0.5 },
});
