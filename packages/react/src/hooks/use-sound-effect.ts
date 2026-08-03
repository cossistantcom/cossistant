import { useCallback, useEffect, useRef, useState } from "react";

export type SoundLoader = () => Promise<string>;
export type SoundSource = SoundLoader | string;

export type UseSoundEffectOptions = {
	loop?: boolean;
	volume?: number;
	playbackRate?: number;
};

export type UseSoundEffectReturn = {
	play: () => void;
	stop: () => void;
	isPlaying: boolean;
	isLoading: boolean;
	error: Error | null;
};

type AudioContextWindow = typeof window & {
	webkitAudioContext?: new () => AudioContext;
};

let sharedAudioContext: AudioContext | null = null;
const audioBufferPromises = new Map<SoundSource, Promise<AudioBuffer>>();

function getSharedAudioContext(): AudioContext {
	if (sharedAudioContext) {
		return sharedAudioContext;
	}

	if (typeof window === "undefined") {
		throw new Error("Sound effects are only available in the browser");
	}

	const AudioContextConstructor =
		window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;

	if (!AudioContextConstructor) {
		throw new Error("Web Audio API is not supported in this browser");
	}

	sharedAudioContext = new AudioContextConstructor();
	return sharedAudioContext;
}

async function getSharedAudioBuffer(
	audioContext: AudioContext,
	source: SoundSource
): Promise<AudioBuffer> {
	const cached = audioBufferPromises.get(source);

	if (cached) {
		return cached;
	}

	let promise: Promise<AudioBuffer>;
	promise = (async () => {
		const soundPath = typeof source === "string" ? source : await source();
		const response = await fetch(soundPath);
		if (!response.ok) {
			throw new Error(`Failed to load sound: ${response.statusText}`);
		}

		return audioContext.decodeAudioData(await response.arrayBuffer());
	})().catch((error: unknown) => {
		if (audioBufferPromises.get(source) === promise) {
			audioBufferPromises.delete(source);
		}
		throw error;
	});

	audioBufferPromises.set(source, promise);
	return promise;
}

/**
 * Hook to play sound effects using the Web Audio API.
 *
 * @param soundSource - Sound path or lazy loader that resolves a sound path
 * @param options - Configuration options for the sound
 * @returns Object with play, stop functions and state
 *
 * @example
 * const { play, stop, isPlaying } = useSoundEffect('/sounds/notification.wav', {
 *   loop: false,
 *   volume: 0.5
 * });
 */
export function useSoundEffect(
	soundSource: SoundSource,
	options: UseSoundEffectOptions = {}
): UseSoundEffectReturn {
	const { loop = false, volume = 1.0, playbackRate = 1.0 } = options;

	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const mountedRef = useRef(true);
	const playRequestIdRef = useRef(0);

	// Play sound
	const play = useCallback(() => {
		const requestId = ++playRequestIdRef.current;
		setIsLoading(true);
		setError(null);

		void (async () => {
			try {
				const audioContext = getSharedAudioContext();
				const [, audioBuffer] = await Promise.all([
					audioContext.state === "suspended"
						? audioContext.resume()
						: undefined,
					getSharedAudioBuffer(audioContext, soundSource),
				]);

				if (!mountedRef.current || requestId !== playRequestIdRef.current) {
					return;
				}

				if (sourceNodeRef.current) {
					try {
						sourceNodeRef.current.onended = null;
						sourceNodeRef.current.stop();
						sourceNodeRef.current.disconnect();
					} catch {
						// Ignore errors from an already-stopped node.
					}
					gainNodeRef.current?.disconnect();
				}

				const source = audioContext.createBufferSource();
				source.buffer = audioBuffer;
				source.loop = loop;
				source.playbackRate.value = playbackRate;

				const gainNode = audioContext.createGain();
				gainNode.gain.value = volume;
				source.connect(gainNode);
				gainNode.connect(audioContext.destination);

				sourceNodeRef.current = source;
				gainNodeRef.current = gainNode;
				source.onended = () => {
					source.disconnect();
					gainNode.disconnect();
					if (sourceNodeRef.current === source) {
						sourceNodeRef.current = null;
						gainNodeRef.current = null;
					}
					if (mountedRef.current) {
						setIsPlaying(false);
					}
				};

				source.start(0);
				setIsLoading(false);
				setIsPlaying(true);
			} catch (caughtError) {
				if (!mountedRef.current || requestId !== playRequestIdRef.current) {
					return;
				}

				setError(
					caughtError instanceof Error
						? caughtError
						: new Error("Failed to load sound")
				);
				setIsLoading(false);
				setIsPlaying(false);
			}
		})();
	}, [loop, playbackRate, soundSource, volume]);

	// Stop sound
	const stop = useCallback(() => {
		playRequestIdRef.current += 1;
		if (sourceNodeRef.current) {
			try {
				sourceNodeRef.current.onended = null;
				sourceNodeRef.current.stop();
				sourceNodeRef.current.disconnect();
			} catch {
				// Ignore errors if already stopped
			}
			sourceNodeRef.current = null;
		}
		gainNodeRef.current?.disconnect();
		gainNodeRef.current = null;
		if (mountedRef.current) {
			setIsLoading(false);
			setIsPlaying(false);
		}
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
			playRequestIdRef.current += 1;
			if (sourceNodeRef.current) {
				try {
					sourceNodeRef.current.onended = null;
					sourceNodeRef.current.stop();
					sourceNodeRef.current.disconnect();
				} catch {
					// Ignore errors from an already-stopped node.
				}
				sourceNodeRef.current = null;
			}
			gainNodeRef.current?.disconnect();
			gainNodeRef.current = null;
		};
	}, []);

	return {
		play,
		stop,
		isPlaying,
		isLoading,
		error,
	};
}
