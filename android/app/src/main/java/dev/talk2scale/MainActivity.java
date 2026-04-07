package dev.talk2scale;

import android.os.Bundle;
import android.view.View;

import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.lifecycle.ViewModelProvider;

public class MainActivity extends AppCompatActivity {

    private ScaleViewModel viewModel;

    private View homeScreen;
    private View scaleScreen;

    private HomeScreenController homeController;
    private ScaleScreenController scaleController;
    private ConnectionOverlayController connectionOverlay;

    private ActivityResultLauncher<String> permissionLauncher;
    private ActivityResultLauncher<String> micPermissionLauncher;
    private ActivityResultLauncher<IntentSenderRequest> cdmLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        viewModel = new ViewModelProvider(this).get(ScaleViewModel.class);
        registerLaunchers();
        bindViews();
        observeViewModel();
        registerBackPressHandler();
    }

    private void registerLaunchers() {
        permissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> connectionOverlay.onBluetoothPermissionResult(granted));

        micPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> scaleController.onMicPermissionResult(granted));

        cdmLauncher = registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                result -> connectionOverlay.onCdmResult(result.getResultCode(), result.getData()));
    }

    private void bindViews() {
        View root = findViewById(R.id.main);
        homeScreen = findViewById(R.id.homeScreen);
        scaleScreen = findViewById(R.id.scaleScreen);

        homeController = new HomeScreenController(this);
        homeController.bind(homeScreen, this::showScaleScreen);

        connectionOverlay = new ConnectionOverlayController(this, viewModel, permissionLauncher, cdmLauncher);
        connectionOverlay.bind(root);

        scaleController = new ScaleScreenController(this, viewModel, micPermissionLauncher);
        scaleController.bind(scaleScreen, connectionOverlay::show);
    }

    private void observeViewModel() {
        connectionOverlay.observeViewModel(this);
        scaleController.observeViewModel(this);
    }

    private void registerBackPressHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (scaleScreen.getVisibility() == View.VISIBLE) {
                    showHomeScreen();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    private void showScaleScreen() {
        homeScreen.setVisibility(View.GONE);
        scaleScreen.setVisibility(View.VISIBLE);
    }

    private void showHomeScreen() {
        scaleScreen.setVisibility(View.GONE);
        homeScreen.setVisibility(View.VISIBLE);
    }

    @Override
    protected void onDestroy() {
        if (scaleController != null) scaleController.release();
        super.onDestroy();
    }
}
