import type { ConnectionStateValue } from '../constants/ble';

export type ScaleTransportListener = {
  onConnectionStateChanged: (state: ConnectionStateValue) => void;
  onWeightData: (weight: number) => void;
};

export interface ScaleTransport {
  setListener(listener: ScaleTransportListener | null): void;
  sendTare(): void;
  sendCalibrate(refMassGrams: number): void;
  close(): void;
}
