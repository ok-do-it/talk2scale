import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';

import {
  ConnectionState,
  type ConnectionStateValue,
  NOTIFY_CHAR_UUID,
  SERVICE_UUID,
  WRITE_CHAR_UUID,
} from '../constants/ble';
import type { ScaleTransport, ScaleTransportListener } from './ScaleTransport';
import {
  decodeWeightFromBase64,
  encodeCalibratePayload,
  encodeTarePayload,
} from './bleCodec';

export type ScannedDevice = {
  id: string;
  name: string | null;
};

const SCALE_DEVICE_NAME = 'TalkToScale';

export class BleScaleTransport implements ScaleTransport {
  private readonly manager = new BleManager();
  private listener: ScaleTransportListener | null = null;
  private device: Device | null = null;
  private monitorSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private scanning = false;
  private readonly discovered = new Map<string, ScannedDevice>();

  getManager(): BleManager {
    return this.manager;
  }

  setListener(listener: ScaleTransportListener | null): void {
    this.listener = listener;
  }

  getDiscoveredDevices(): ScannedDevice[] {
    return Array.from(this.discovered.values());
  }

  clearDiscovered(): void {
    this.discovered.clear();
  }

  isScanning(): boolean {
    return this.scanning;
  }

  startScan(onDeviceFound?: () => void, onScanError?: (message: string) => void): void {
    if (this.scanning) return;
    this.scanning = true;
    this.discovered.clear();
    this.manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.warn('BLE scan failed', error);
          onScanError?.(error.message || 'Bluetooth scan failed');
          this.stopScan();
          return;
        }
        if (!device) return;

        console.log('BLE scan result', {
          id: device.id,
          name: device.name,
          localName: device.localName,
          serviceUUIDs: device.serviceUUIDs,
        });

        const serviceUUIDs = device.serviceUUIDs ?? [];
        const isScale =
          serviceUUIDs.some((uuid) => uuid.toLowerCase() === SERVICE_UUID) ||
          device.name === SCALE_DEVICE_NAME ||
          device.localName === SCALE_DEVICE_NAME;
        if (!isScale) return;

        if (!this.discovered.has(device.id)) {
          this.discovered.set(device.id, {
            id: device.id,
            name: device.name ?? device.localName ?? null,
          });
          onDeviceFound?.();
        }
      },
    );
  }

  stopScan(): void {
    if (!this.scanning) return;
    this.scanning = false;
    this.manager.stopDeviceScan().catch(() => undefined);
  }

  async connectToDevice(deviceId: string, autoConnect: boolean): Promise<void> {
    this.stopScan();
    this.dispatchConnectionState(ConnectionState.CONNECTING);
    try {
      await this.disconnectInternal(false);
      const connected = await this.manager.connectToDevice(deviceId, {
        autoConnect,
      });
      this.device = connected;
      this.setupDisconnectListener(connected);
      await connected.discoverAllServicesAndCharacteristics();
      this.monitorSubscription = connected.monitorCharacteristicForService(
        SERVICE_UUID,
        NOTIFY_CHAR_UUID,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          const weight = decodeWeightFromBase64(characteristic.value);
          if (weight !== null) {
            this.dispatchWeightData(weight);
          }
        },
      );
      this.dispatchConnectionState(ConnectionState.CONNECTED);
    } catch {
      this.device = null;
      this.dispatchConnectionState(ConnectionState.DISCONNECTED);
      throw new Error('Connection failed');
    }
  }

  sendTare(): void {
    const device = this.device;
    if (!device) return;
    device
      .writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        WRITE_CHAR_UUID,
        encodeTarePayload(),
      )
      .catch(() => undefined);
  }

  sendCalibrate(refMassGrams: number): void {
    const device = this.device;
    if (!device) return;
    device
      .writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        WRITE_CHAR_UUID,
        encodeCalibratePayload(refMassGrams),
      )
      .catch(() => undefined);
  }

  close(): void {
    this.stopScan();
    void this.disconnectInternal(true);
  }

  destroy(): void {
    this.close();
    this.manager.destroy();
  }

  private setupDisconnectListener(device: Device): void {
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = device.onDisconnected(() => {
      this.monitorSubscription?.remove();
      this.monitorSubscription = null;
      this.device = null;
      this.dispatchConnectionState(ConnectionState.DISCONNECTED);
    });
  }

  private async disconnectInternal(dispatchDisconnected: boolean): Promise<void> {
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    const device = this.device;
    this.device = null;
    if (device) {
      try {
        await device.cancelConnection();
      } catch {
        // ignore
      }
    }
    if (dispatchDisconnected) {
      this.dispatchConnectionState(ConnectionState.DISCONNECTED);
    }
  }

  private dispatchConnectionState(state: ConnectionStateValue): void {
    this.listener?.onConnectionStateChanged(state);
  }

  private dispatchWeightData(weight: number): void {
    this.listener?.onWeightData(weight);
  }
}

export const bleScaleTransport = new BleScaleTransport();
