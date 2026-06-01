import { Audio } from 'expo-av';

export const MAX_RECORDING_MS = 10000;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
	isMeteringEnabled: false,
	android: {
		extension: '.m4a',
		outputFormat: Audio.AndroidOutputFormat.MPEG_4,
		audioEncoder: Audio.AndroidAudioEncoder.AAC,
		sampleRate: 16000,
		numberOfChannels: 1,
		bitRate: 64000,
	},
	ios: {
		extension: '.m4a',
		outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
		audioQuality: Audio.IOSAudioQuality.MEDIUM,
		sampleRate: 16000,
		numberOfChannels: 1,
		bitRate: 64000,
		linearPCMBitDepth: 16,
		linearPCMIsBigEndian: false,
		linearPCMIsFloat: false,
	},
	web: {
		mimeType: 'audio/webm',
		bitsPerSecond: 64000,
	},
};

export async function ensureAudioRecordingReady(): Promise<boolean> {
	const permission = await Audio.requestPermissionsAsync();
	if (!permission.granted) return false;
	await Audio.setAudioModeAsync({
		allowsRecordingIOS: true,
		playsInSilentModeIOS: true,
	});
	return true;
}

export class AudioClipRecorder {
	private recording: Audio.Recording | null = null;
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
		const recording = new Audio.Recording();
		await recording.prepareToRecordAsync(RECORDING_OPTIONS);
		await recording.startAsync();
		this.recording = recording;
	}

	async stop(): Promise<string | null> {
		this.clearAutoStop();
		const active = this.recording;
		if (!active) return null;
		this.recording = null;
		await active.stopAndUnloadAsync();
		return active.getURI();
	}

	async cancel(): Promise<void> {
		this.clearAutoStop();
		const active = this.recording;
		if (!active) return;
		this.recording = null;
		try {
			await active.stopAndUnloadAsync();
		} catch {
			// ignore
		}
	}
}
