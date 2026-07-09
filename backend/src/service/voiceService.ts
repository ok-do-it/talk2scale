import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
	type AutomaticSpeechRecognitionOutput,
	type AutomaticSpeechRecognitionPipeline,
	type PretrainedModelOptions,
	pipeline,
} from '@huggingface/transformers';
import { logger } from '../config/logger.js';

const require = createRequire(import.meta.url);
const ffmpegStaticPath = require('ffmpeg-static') as string | null;
const { WaveFile } = require('wavefile') as typeof import('wavefile');

const MODEL_ID = 'onnx-community/whisper-large-v3-turbo';
const WHISPER_SAMPLE_RATE = 16_000;

export type AudioFormat = 'wav' | 'aac' | 'm4a';

type WaveFileWithSamples = InstanceType<typeof WaveFile> & {
	getSamples(
		interleaved?: boolean,
		outputObject?: typeof Float32Array,
	): Float32Array | Float32Array[];
};

function pickBackend(): Pick<PretrainedModelOptions, 'device'> {
	if (
		process.env.CUDA_VISIBLE_DEVICES !== undefined &&
		process.env.CUDA_VISIBLE_DEVICES !== ''
	) {
		return { device: 'cuda' };
	}
	return { device: 'cpu' };
}

export function detectAudioFormat(audio: Buffer): AudioFormat {
	if (audio.length < 12) {
		throw new Error('Audio buffer too short');
	}
	if (
		audio.toString('ascii', 0, 4) === 'RIFF' &&
		audio.toString('ascii', 8, 12) === 'WAVE'
	) {
		return 'wav';
	}
	// ADTS AAC (raw AAC frames)
	if (audio[0] === 0xff && (audio[1] & 0xf0) === 0xf0) {
		return 'aac';
	}
	// MP4/M4A container (typical mobile AAC recording)
	if (audio.length >= 8 && audio.toString('ascii', 4, 8) === 'ftyp') {
		return 'm4a';
	}
	throw new Error(
		'Unsupported audio format: expected WAV (RIFF/WAVE) or AAC (.m4a / ADTS)',
	);
}

function toFloat32Array(samples: ArrayLike<number>): Float32Array {
	return samples instanceof Float32Array ? samples : Float32Array.from(samples);
}

function wavBufferToMonoFloat32(audio: Buffer): Float32Array {
	const wav = new WaveFile(audio) as WaveFileWithSamples;
	wav.toBitDepth('32f');
	wav.toSampleRate(WHISPER_SAMPLE_RATE);

	const samples = wav.getSamples(false, Float32Array);
	if (Array.isArray(samples)) {
		const channel = samples[0];
		return channel ? toFloat32Array(channel) : new Float32Array(0);
	}
	return toFloat32Array(samples);
}

function pcmBufferToFloat32Array(pcm: Buffer): Float32Array {
	if (pcm.byteLength % 4 !== 0) {
		throw new Error('Invalid PCM output from ffmpeg');
	}
	return new Float32Array(
		pcm.buffer,
		pcm.byteOffset,
		pcm.byteLength / Float32Array.BYTES_PER_ELEMENT,
	);
}

function resolveFfmpegPath(): string {
	const path = process.env.FFMPEG_BIN ?? ffmpegStaticPath;
	if (!path) {
		throw new Error(
			'ffmpeg binary not found (install ffmpeg-static or set FFMPEG_BIN)',
		);
	}
	return path;
}

async function aacBufferToMonoFloat32(audio: Buffer): Promise<Float32Array> {
	const ffmpeg = resolveFfmpegPath();

	const args = [
		'-hide_banner',
		'-loglevel',
		'error',
		'-i',
		'pipe:0',
		'-f',
		'f32le',
		'-acodec',
		'pcm_f32le',
		'-ac',
		'1',
		'-ar',
		String(WHISPER_SAMPLE_RATE),
		'pipe:1',
	];

	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpeg, args);
		const chunks: Buffer[] = [];
		let stderr = '';

		proc.stdout.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});
		proc.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		proc.on('error', reject);
		proc.on('close', (code: number | null) => {
			if (code !== 0) {
				reject(
					new Error(
						`ffmpeg failed (code ${code})${stderr ? `: ${stderr.trim()}` : ''}`,
					),
				);
				return;
			}
			resolve(pcmBufferToFloat32Array(Buffer.concat(chunks)));
		});

		proc.stdin.end(audio);
	});
}

async function audioBufferToMonoFloat32(audio: Buffer): Promise<Float32Array> {
	switch (detectAudioFormat(audio)) {
		case 'wav':
			return wavBufferToMonoFloat32(audio);
		case 'aac':
		case 'm4a':
			return aacBufferToMonoFloat32(audio);
	}
}

function normalizeTranscript(
	result: AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[],
): string {
	const item = Array.isArray(result) ? result[0] : result;
	return item?.text.trim() ?? '';
}

export type VoiceService = {
	foodNameToText: (audio: Buffer) => Promise<string>;
};

export async function createVoiceService(): Promise<VoiceService> {
	const backend = pickBackend();
	logger.info({ model: MODEL_ID, backend }, 'Loading voice model');

	const transcriber = (await pipeline(
		'automatic-speech-recognition',
		MODEL_ID,
		{
			dtype: 'q8',
			...backend,
		} satisfies PretrainedModelOptions,
	)) as unknown as AutomaticSpeechRecognitionPipeline;

	logger.info({ backend }, 'Voice model ready');

	const foodNameToText = async (audio: Buffer): Promise<string> => {
		const waveform = await audioBufferToMonoFloat32(audio);
		const result = await transcriber(waveform, {
			language: 'english',
			task: 'transcribe',
		});
		return normalizeTranscript(result);
	};

	return { foodNameToText };
}
