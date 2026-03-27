package dev.talk2scale;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.util.Log;

import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

public class ScaleViewModel extends ViewModel {

    private static final String TAG = "ScaleViewModel";

    static final UUID SERVICE_UUID     = UUID.fromString("4c78c001-8118-4aea-8f72-70ddbda3c9b9");
    static final UUID NOTIFY_CHAR_UUID = UUID.fromString("4c78c002-8118-4aea-8f72-70ddbda3c9b9");
    static final UUID WRITE_CHAR_UUID  = UUID.fromString("4c78c003-8118-4aea-8f72-70ddbda3c9b9");
    static final UUID CCCD_UUID        = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final MutableLiveData<int[]> weightData = new MutableLiveData<>();
    private final MutableLiveData<Integer> connectionState = new MutableLiveData<>(BluetoothProfile.STATE_DISCONNECTED);
    private final MutableLiveData<List<LogEntry>> logEntries = new MutableLiveData<>(new ArrayList<>());

    private BluetoothGatt gatt;
    private int lastStableWeight = 0;
    private final Random random = new Random();

    public MutableLiveData<int[]> getWeightData() { return weightData; }
    public MutableLiveData<Integer> getConnectionState() { return connectionState; }
    public MutableLiveData<List<LogEntry>> getLogEntries() { return logEntries; }

    public int getLastStableWeight() { return lastStableWeight; }

    public BluetoothGatt getGatt() { return gatt; }

    public void setGatt(BluetoothGatt gatt) { this.gatt = gatt; }

    public void addLogEntry(String foodName, int weightGrams) {
        int calories = random.nextInt(300) + 50;
        List<LogEntry> current = logEntries.getValue();
        if (current == null) current = new ArrayList<>();
        List<LogEntry> updated = new ArrayList<>();
        updated.add(new LogEntry(foodName, weightGrams, calories));
        updated.addAll(current);
        logEntries.setValue(updated);
    }

    @SuppressWarnings("MissingPermission")
    public void sendTare() {
        if (gatt == null) return;
        BluetoothGattService service = gatt.getService(SERVICE_UUID);
        if (service == null) return;
        BluetoothGattCharacteristic writeChar = service.getCharacteristic(WRITE_CHAR_UUID);
        if (writeChar == null) return;
        gatt.writeCharacteristic(writeChar, new byte[]{0x01},
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
    }

    @SuppressWarnings("MissingPermission")
    public void closeGatt() {
        if (gatt != null) {
            gatt.close();
            gatt = null;
        }
    }

    @Override
    protected void onCleared() {
        super.onCleared();
        closeGatt();
    }

    @SuppressWarnings("MissingPermission")
    final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {

        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            Log.d(TAG, "onConnectionStateChange: status=" + status + " newState=" + newState);
            connectionState.postValue(newState);
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gatt = g;
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                // autoConnect=true handles reconnection; keep the gatt reference alive
                // unless the ViewModel is being cleared (handled in onCleared)
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.w(TAG, "onServicesDiscovered failed: " + status);
                return;
            }
            BluetoothGattService service = g.getService(SERVICE_UUID);
            if (service == null) {
                Log.w(TAG, "Scale service not found");
                return;
            }
            BluetoothGattCharacteristic notifyChar = service.getCharacteristic(NOTIFY_CHAR_UUID);
            if (notifyChar == null) {
                Log.w(TAG, "Notify characteristic not found");
                return;
            }
            g.setCharacteristicNotification(notifyChar, true);
            BluetoothGattDescriptor cccd = notifyChar.getDescriptor(CCCD_UUID);
            if (cccd != null) {
                g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g,
                BluetoothGattCharacteristic characteristic, byte[] value) {
            if (!NOTIFY_CHAR_UUID.equals(characteristic.getUuid())) return;
            if (value.length < 3) return;
            short weight = ByteBuffer.wrap(value, 0, 2)
                    .order(ByteOrder.LITTLE_ENDIAN).getShort();
            int flags = value[2] & 0xFF;
            boolean stable = (flags & 0x01) != 0;
            if (stable) {
                lastStableWeight = weight;
            }
            weightData.postValue(new int[]{weight, flags});
        }
    };
}
