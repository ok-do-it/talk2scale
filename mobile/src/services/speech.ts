import {
	AudioClipRecorder,
	MAX_RECORDING_MS,
	ensureAudioRecordingReady,
} from './voiceRecording';
import { transcribeFoodAudio } from './voiceApi';

export type SpeechCallbacks = {
	onListeningStateChanged: (listening: boolean) => void;
	onPartialText: (text: string) => void;
	onFinalText: (text: string, elementId?: number) => void;
	onNoMatchOrTimeout: () => void;
	onUnavailable: () => void;
};

export class SpeechRecognition {
	private callbacks: SpeechCallbacks | null = null;
	private listening = false;
	private recorder = new AudioClipRecorder();
	private finishing = false;
	private starting = false;
	private stopRequested = false;

	setCallbacks(callbacks: SpeechCallbacks | null): void {
		this.callbacks = callbacks;
	}

	isListening(): boolean {
		return this.listening;
	}

	async startListening(): Promise<void> {
		if (this.listening || this.finishing || this.starting) return;
		this.starting = true;
		this.stopRequested = false;
		try {
			const granted = await ensureAudioRecordingReady();
			if (!granted) {
				this.callbacks?.onUnavailable();
				return;
			}
			await this.recorder.start();
			this.setListening(true);
			this.recorder.scheduleAutoStop(MAX_RECORDING_MS, () => {
				void this.finishListening();
			});
			if (this.stopRequested) {
				void this.finishListening();
			}
		} catch {
			this.callbacks?.onUnavailable();
		} finally {
			this.starting = false;
		}
	}

	async stopListening(): Promise<void> {
		if (this.finishing) return;
		if (this.starting && !this.listening) {
			this.stopRequested = true;
			return;
		}
		await this.finishListening();
	}

	async cancelListening(): Promise<void> {
		if (this.finishing) return;
		await this.recorder.cancel();
		this.setListening(false);
		this.stopRequested = false;
	}

	async release(): Promise<void> {
		await this.recorder.cancel();
		this.listening = false;
		this.finishing = false;
		this.starting = false;
		this.stopRequested = false;
	}

	private async finishListening(): Promise<void> {
		if (!this.listening || this.finishing) return;
		this.finishing = true;
		try {
			const uri = await this.recorder.stop();
			if (!uri) {
				this.callbacks?.onNoMatchOrTimeout();
				return;
			}
			this.setListening(false);
			const food = await transcribeFoodAudio(uri);
			if (food.elementName) {
				this.callbacks?.onFinalText(food.elementName, food.elementId);
			} else {
				this.callbacks?.onNoMatchOrTimeout();
			}
		} catch {
			this.callbacks?.onNoMatchOrTimeout();
		} finally {
			this.finishing = false;
			this.stopRequested = false;
			this.setListening(false);
		}
	}

	private setListening(isListening: boolean): void {
		if (this.listening === isListening) return;
		this.listening = isListening;
		this.callbacks?.onListeningStateChanged(isListening);
	}
}

export const speechRecognition = new SpeechRecognition();
