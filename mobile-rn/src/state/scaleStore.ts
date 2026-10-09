import { create } from 'zustand';

import { ConnectionState } from '../constants/ble';
import { bleScaleTransport } from '../transport/BleScaleTransport';
import { MockScaleTransport } from '../transport/MockScaleTransport';
import type { ScaleTransportListener } from '../transport/ScaleTransport';
import { clearStoredMac, getStoredMac, storeMac } from '../services/storage';
import type { WeightReading } from './types';

const STABLE_WINDOW = 3;

const mockTransport = new MockScaleTransport();

type ScaleState = {
  weightReading: WeightReading | null;
  lastWeight: number;
  connectionState: number;
  mockEnabled: boolean;
  realConnectionRequested: boolean;
  initialized: boolean;
};

type ScaleActions = {
  initialize: () => Promise<void>;
  teardown: () => void;
  isConnected: () => boolean;
  isConnectionInProgress: () => boolean;
  prepareForRealConnection: () => void;
  connectToRealDevice: (deviceId: string, autoConnect: boolean) => Promise<void>;
  disconnect: () => void;
  cancelConnection: () => void;
  forgetStoredDevice: () => Promise<void>;
  sendTare: () => void;
  sendCalibrate: (refMassGrams: number) => void;
  setMockEnabled: (enabled: boolean) => void;
  addMockWeight: () => void;
  publishWeight: (weight: number, forceStable: boolean) => void;
};

let recentWeights: number[] = [];
let recentWeightCount = 0;
let transportsWired = false;

function isStable(weight: number): boolean {
  recentWeights[recentWeightCount % STABLE_WINDOW] = weight;
  recentWeightCount++;
  if (recentWeightCount < STABLE_WINDOW) return false;
  const baseline = recentWeights[0];
  for (let i = 1; i < STABLE_WINDOW; i++) {
    if (recentWeights[i] !== baseline) return false;
  }
  return true;
}

const bleTransportListener: ScaleTransportListener = {
  onConnectionStateChanged: (state) => {
    const connected = state === ConnectionState.CONNECTED;
    useScaleStore.setState({
      connectionState: state,
      ...(connected ? { mockEnabled: false } : {}),
    });
  },
  onWeightData: (weight) => {
    const connected =
      useScaleStore.getState().connectionState === ConnectionState.CONNECTED;
    if (connected) {
      useScaleStore.getState().publishWeight(weight, false);
    }
  },
};

const mockTransportListener: ScaleTransportListener = {
  onConnectionStateChanged: () => {
    // Connection state tracks real BLE only.
  },
  onWeightData: (weight) => {
    const { connectionState, mockEnabled } = useScaleStore.getState();
    const connected = connectionState === ConnectionState.CONNECTED;
    if (!connected && mockEnabled) {
      useScaleStore.getState().publishWeight(weight, true);
    }
  },
};

function wireTransports(): void {
  if (transportsWired) return;
  transportsWired = true;
  bleScaleTransport.setListener(bleTransportListener);
  mockTransport.setListener(mockTransportListener);
  mockTransport.start();
}

export const useScaleStore = create<ScaleState & ScaleActions>((set, get) => ({
  weightReading: null,
  lastWeight: 0,
  connectionState: ConnectionState.DISCONNECTED,
  mockEnabled: true,
  realConnectionRequested: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    wireTransports();
    const mac = await getStoredMac();
    if (mac) {
      try {
        get().prepareForRealConnection();
        await get().connectToRealDevice(mac, true);
      } catch {
        set({ mockEnabled: true, realConnectionRequested: false });
        mockTransport.start();
      }
    }
    set({ initialized: true });
  },

  teardown: () => {
    bleScaleTransport.destroy();
    mockTransport.close();
    transportsWired = false;
    set({ initialized: false });
  },

  isConnected: () => get().connectionState === ConnectionState.CONNECTED,

  isConnectionInProgress: () =>
    get().realConnectionRequested && !get().isConnected(),

  prepareForRealConnection: () => {
    set({ realConnectionRequested: true, mockEnabled: false });
  },

  connectToRealDevice: async (deviceId, autoConnect) => {
    get().prepareForRealConnection();
    await bleScaleTransport.connectToDevice(deviceId, autoConnect);
    await storeMac(deviceId);
  },

  disconnect: () => {
    bleScaleTransport.close();
    set({ realConnectionRequested: false, mockEnabled: true });
    if (!get().isConnected()) {
      mockTransport.start();
    }
  },

  cancelConnection: () => {
    bleScaleTransport.close();
    set({ realConnectionRequested: false });
  },

  forgetStoredDevice: async () => {
    await clearStoredMac();
  },

  sendTare: () => {
    if (get().isConnected()) {
      bleScaleTransport.sendTare();
    } else {
      mockTransport.sendTare();
    }
  },

  sendCalibrate: (refMassGrams) => {
    if (get().isConnected()) {
      bleScaleTransport.sendCalibrate(refMassGrams);
    }
  },

  setMockEnabled: (enabled) => {
    const current = get().mockEnabled;
    if (current === enabled) return;
    if (enabled) {
      set({ mockEnabled: true, realConnectionRequested: false });
      if (get().isConnected()) {
        bleScaleTransport.close();
      } else {
        mockTransport.start();
      }
    } else {
      set({ mockEnabled: false });
    }
  },

  addMockWeight: () => {
    if (!get().isConnected() && get().mockEnabled) {
      mockTransport.addRandomWeight();
    }
  },

  publishWeight: (weight, forceStable) => {
    const stable = forceStable || isStable(weight);
    set({
      lastWeight: weight,
      weightReading: { weight, stable },
    });
  },
}));
