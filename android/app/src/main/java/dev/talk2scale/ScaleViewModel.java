package dev.talk2scale;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothProfile;
import android.content.Context;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

public class ScaleViewModel extends ViewModel {
    static final UUID SERVICE_UUID =
            UUID.fromString("4c78c001-8118-4aea-8f72-70ddbda3c9b9");
    private static final int STABLE_WINDOW = 3;


    private final MutableLiveData<WeightReading> weightData = new MutableLiveData<>();
    private final MutableLiveData<Integer> connectionState =
            new MutableLiveData<>(BluetoothProfile.STATE_DISCONNECTED);
    private final MutableLiveData<List<LogEntry>> logEntries = new MutableLiveData<>(new ArrayList<>());
    private final MutableLiveData<Boolean> showConnectionOverlay = new MutableLiveData<>(false);
    private final MutableLiveData<Boolean> mockControlsEnabled = new MutableLiveData<>(true);
    private final MutableLiveData<Boolean> mockEnabled = new MutableLiveData<>(true);

    private int lastStableWeight = 0;
    private final int[] recentWeights = new int[STABLE_WINDOW];
    private int recentWeightCount = 0;
    private final Random random = new Random();
    private boolean realConnectionRequested = false;

    private final BleScaleTransport bleTransport = new BleScaleTransport();
    private final MockScaleTransport mockTransport = new MockScaleTransport();

    public ScaleViewModel() {
        bleTransport.setListener(new ScaleTransport.Listener() {
            @Override
            public void onConnectionStateChanged(int state) {
                connectionState.postValue(state);
                updateConnectionUiState(state);
            }

            @Override
            public void onWeightData(int weight) {
                publishWeight(weight, false);
            }
        });
        mockTransport.setListener(new ScaleTransport.Listener() {
            @Override
            public void onConnectionStateChanged(int state) {
                // The app's connection state tracks only real BLE device state.
            }

            @Override
            public void onWeightData(int weight) {
                if (!isConnected()) {
                    publishWeight(weight, true);
                }
            }
        });
        mockTransport.start();
    }

    public LiveData<WeightReading> getWeightData() {
        return weightData;
    }

    public LiveData<Integer> getConnectionState() {
        return connectionState;
    }

    public LiveData<List<LogEntry>> getLogEntries() {
        return logEntries;
    }

    public LiveData<Boolean> getShowConnectionOverlay() {
        return showConnectionOverlay;
    }

    public LiveData<Boolean> getMockControlsEnabled() {
        return mockControlsEnabled;
    }

    public LiveData<Boolean> getMockEnabled() {
        return mockEnabled;
    }

    public int getLastStableWeight() {
        return lastStableWeight;
    }

    public boolean isRealConnectionRequested() {
        return realConnectionRequested;
    }

    public boolean isConnectionInProgress() {
        return realConnectionRequested && !isConnected();
    }

    public void showOverlay() {
        showConnectionOverlay.setValue(true);
    }

    public void hideOverlay() {
        showConnectionOverlay.setValue(false);
    }

    public void disconnect() {
        bleTransport.close();
        realConnectionRequested = false;
    }

    public void cancelConnection() {
        bleTransport.close();
        realConnectionRequested = false;
    }

    public void addLogEntry(String foodName, int weightGrams) {
        int calories = random.nextInt(300) + 50;
        List<LogEntry> current = logEntries.getValue();
        if (current == null) current = new ArrayList<>();
        List<LogEntry> updated = new ArrayList<>();
        updated.add(new LogEntry(foodName, weightGrams, calories));
        updated.addAll(current);
        logEntries.setValue(updated);
    }

    public boolean isConnected() {
        Integer state = connectionState.getValue();
        return state != null && state == BluetoothProfile.STATE_CONNECTED;
    }

    public void prepareForRealConnection() {
        realConnectionRequested = true;
        mockEnabled.setValue(false);
        Integer state = connectionState.getValue();
        updateConnectionUiState(state == null ? BluetoothProfile.STATE_DISCONNECTED : state);
    }

    public void connectToRealDevice(Context context, BluetoothDevice device, boolean autoConnect) {
        prepareForRealConnection();
        bleTransport.connectToDevice(context, device, autoConnect);
    }

    public void sendTare() {
        if (isConnected()) {
            bleTransport.sendTare();
        } else {
            mockTransport.sendTare();
        }
    }

    public void sendCalibrate(int refMassGrams) {
        if (isConnected()) {
            bleTransport.sendCalibrate(refMassGrams);
        }
    }

    public void addMockWeight() {
        if (!isConnected()) {
            mockTransport.addRandomWeight();
        }
    }

    public void setMockEnabled(boolean enabled) {
        Boolean current = mockEnabled.getValue();
        if (current != null && current == enabled) return;
        mockEnabled.setValue(enabled);
        if (enabled) {
            realConnectionRequested = false;
            if (isConnected()) {
                bleTransport.close();
            } else {
                Integer state = connectionState.getValue();
                updateConnectionUiState(state == null
                        ? BluetoothProfile.STATE_DISCONNECTED : state);
            }
        } else {
            Integer state = connectionState.getValue();
            updateConnectionUiState(state == null
                    ? BluetoothProfile.STATE_DISCONNECTED : state);
        }
    }

    @Override
    protected void onCleared() {
        super.onCleared();
        bleTransport.close();
        mockTransport.close();
    }

    private void publishWeight(int weight, boolean forceStable) {
        boolean stable = forceStable || isStable(weight);
        if (stable) {
            lastStableWeight = weight;
        }
        weightData.postValue(new WeightReading(weight, stable));
    }

    private boolean isStable(int weight) {
        recentWeights[recentWeightCount % STABLE_WINDOW] = weight;
        recentWeightCount++;
        if (recentWeightCount < STABLE_WINDOW) {
            return false;
        }

        int baseline = recentWeights[0];
        for (int i = 1; i < STABLE_WINDOW; i++) {
            if (recentWeights[i] != baseline) {
                return false;
            }
        }
        return true;
    }

    private void updateConnectionUiState(int state) {
        boolean connected = state == BluetoothProfile.STATE_CONNECTED;
        boolean mockIsEnabled;
        if (connected) {
            mockEnabled.postValue(false);
            mockIsEnabled = false;
        } else {
            Boolean mock = mockEnabled.getValue();
            mockIsEnabled = Boolean.TRUE.equals(mock);
        }
        mockControlsEnabled.postValue(mockIsEnabled && !connected);
    }

    public static final class WeightReading {
        public final int weight;
        public final boolean stable;

        public WeightReading(int weight, boolean stable) {
            this.weight = weight;
            this.stable = stable;
        }
    }
}
