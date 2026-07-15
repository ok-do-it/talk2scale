import {
	AudioModule,
	type AudioRecorder,
	AudioQuality,
	IOSOutputFormat,
	requestRecordingPermissionsAsync,
	setAudioModeAsync,
	type RecordingOptions,
} from 'expo-audio';

export const MAX_RECORDING_MS = 10000;

const RECORDING_OPTIONS: RecordingOptions = {
	extension: '.m4a',
	sampleRate: 44100,
	numberOfChannels: 1,
	bitRate: 128000,
	isMeteringEnabled: false,
	android: {
		extension: '.m4a',
		outputFormat: 'mpeg4',
		audioEncoder: 'aac',
		sampleRate: 44100,
		// expo-av hardcodes DEFAULT; voice_recognition is more reliable for speech
		// and avoids the emulator's broken DEFAULT path after the first take.
		audioSource: 'voice_recognition',
	},
	ios: {
		extension: '.m4a',
		outputFormat: IOSOutputFormat.MPEG4AAC,
		audioQuality: AudioQuality.HIGH,
		linearPCMBitDepth: 16,
		linearPCMIsBigEndian: false,
		linearPCMIsFloat: false,
	},
	web: {
		mimeType: 'audio/webm',
		bitsPerSecond: 128000,
	},
};

async function setRecordingMode(enabled: boolean): Promise<void> {
	await setAudioModeAsync({
		allowsRecording: enabled,
		playsInSilentMode: true,
		interruptionMode: 'doNotMix',
		shouldPlayInBackground: false,
	});
}

function releaseRecorder(recorder: AudioRecorder | null): void {
	if (!recorder) return;
	try {
		recorder.release();
	} catch {
		// ignore
	}
}

export async function ensureAudioRecordingReady(): Promise<boolean> {
	const permission = await requestRecordingPermissionsAsync();
	if (!permission.granted) return false;
	await setRecordingMode(true);
	return true;
}

export class AudioClipRecorder {
	private recorder: AudioRecorder | null = null;
	private autoStopTimer: ReturnType<typeof setTimeout> | null = null;

	scheduleAutoStop(delayMs: number, onStop: () => void): void {
		this.clearAutoStop();
		this.autoStopTimer = setTimeout(onStop, delayMs);
	}

	clearAutoStop(): void {
		if (this.autoStopTimer) {
			clearTimeout(this.autoStopTimer);
			this.autoStopTimer = null;
		}
	}

	async start(): Promise<void> {
		if (this.recorder) {
			try {
				await this.recorder.stop();
			} catch {
				// ignore leftover recorder errors
			}
			releaseRecorder(this.recorder);
			this.recorder = null;
		}

		await setRecordingMode(true);

		const recorder = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
		await recorder.prepareToRecordAsync();

		try {
			const inputs = recorder.getAvailableInputs();
			const preferred =
				inputs.find((input) => input.type === 'MicrophoneBuiltIn') ??
				inputs[0];
			if (preferred) {
				recorder.setInput(preferred.uid);
			}
		} catch {
			// Input selection is best-effort on emulator.
		}

		recorder.record();
		this.recorder = recorder;
	}

	async stop(): Promise<string | null> {
		this.clearAutoStop();
		const active = this.recorder;
		if (!active) return null;
		this.recorder = null;
		await active.stop();
		const uri = active.uri;
		releaseRecorder(active);
		await setRecordingMode(false);
		return uri;
	}

	async cancel(): Promise<void> {
		this.clearAutoStop();
		const active = this.recorder;
		if (!active) return;
		this.recorder = null;
		try {
			await active.stop();
		} catch {
			// ignore
		}
		releaseRecorder(active);
		try {
			await setRecordingMode(false);
		} catch {
			// ignore
		}
	}
}
