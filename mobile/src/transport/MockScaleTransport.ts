import { ConnectionState, type ConnectionStateValue } from '../constants/ble';
import type { ScaleTransport, ScaleTransportListener } from './ScaleTransport';

export class MockScaleTransport implements ScaleTransport {
  private listener: ScaleTransportListener | null = null;
  private currentWeight = 0;

  setListener(listener: ScaleTransportListener | null): void {
    this.listener = listener;
  }

  start(): void {
    this.dispatchConnectionState(ConnectionState.CONNECTED);
    this.dispatchWeightData(this.currentWeight);
  }

  addRandomWeight(): void {
    this.currentWeight += Math.floor(Math.random() * 251) + 50;
    this.dispatchWeightData(this.currentWeight);
  }

  sendTare(): void {
    this.currentWeight = 0;
    this.dispatchWeightData(this.currentWeight);
  }

  sendCalibrate(_refMassGrams: number): void {
    // No-op for mock.
  }

  close(): void {
    this.dispatchConnectionState(ConnectionState.DISCONNECTED);
  }

  private dispatchConnectionState(state: ConnectionStateValue): void {
    this.listener?.onConnectionStateChanged(state);
  }

  private dispatchWeightData(weight: number): void {
    this.listener?.onWeightData(weight);
  }
}
