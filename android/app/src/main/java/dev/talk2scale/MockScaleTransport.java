package dev.talk2scale;

import android.bluetooth.BluetoothProfile;

import java.util.Random;

public class MockScaleTransport implements ScaleTransport {

    private final Random random = new Random();
    private Listener listener;
    private int currentWeight;

    public void start() {
        dispatchConnectionState(BluetoothProfile.STATE_CONNECTED);
        dispatchWeightData(currentWeight, 0x01);
    }

    public void addRandomWeight() {
        currentWeight += random.nextInt(251) + 50;
        dispatchWeightData(currentWeight, 0x01);
    }

    @Override
    public void setListener(Listener listener) {
        this.listener = listener;
    }

    @Override
    public void sendTare() {
        currentWeight = 0;
        dispatchWeightData(currentWeight, 0x01);
    }

    @Override
    public void sendCalibrate(int refMassGrams) {
        // No-op for mock implementation.
    }

    @Override
    public void close() {
        dispatchConnectionState(BluetoothProfile.STATE_DISCONNECTED);
    }

    private void dispatchConnectionState(int state) {
        if (listener != null) {
            listener.onConnectionStateChanged(state);
        }
    }

    private void dispatchWeightData(int weight, int flags) {
        if (listener != null) {
            listener.onWeightData(weight, flags);
        }
    }
}
