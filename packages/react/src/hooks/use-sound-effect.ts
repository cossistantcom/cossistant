import { useCallback, useEffect, useRef, useState } from "react";

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

/**
 * Hook to play sound effects using the Web Audio API.
 *
 * @param soundPath - Path to the sound file (relative to public directory or absolute URL)
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
	soundPath: string,
	options: UseSoundEffectOptions = {}
): UseSoundEffectReturn {
	const { loop = false, volume = 1.0, playbackRate = 1.0 } = options;

	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const audioContextRef = useRef<AudioContext | null>(null);
	const audioBufferRef = useRef<AudioBuffer | null>(null);
	const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);

	// Initialize audio context and load sound
	useEffect(() => {
		let mounted = true;

		const initAudio = async () => {
			try {
				// Create audio context if it doesn't exist
				if (!audioContextRef.current) {
					audioContextRef.current = new (
						window.AudioContext ||
						(
							window as typeof window & {
								webkitAudioContext?: typeof AudioContext;
							}
						).webkitAudioContext
					)();
				}

				// Load the audio file
				const response = await fetch(soundPath);
				if (!response.ok) {
					throw new Error(`Failed to load sound: ${response.statusText}`);
				}

				const arrayBuffer = await response.arrayBuffer();
				const audioBuffer =
					await audioContextRef.current.decodeAudioData(arrayBuffer);

				if (mounted) {
					audioBufferRef.current = audioBuffer;
					setIsLoading(false);
				}
			} catch (err) {
				if (mounted) {
					setError(
						err instanceof Error ? err : new Error("Failed to load sound")
					);
					setIsLoading(false);
				}
			}
		};

		initAudio();

		return () => {
			mounted = false;
		};
	}, [soundPath]);

	// Play sound
	const play = useCallback(() => {
		const audioContext = audioContextRef.current;
		const audioBuffer = audioBufferRef.current;

		const canPlay = audioContext && audioBuffer && !isLoading && !error;

		if (!canPlay) {
			return;
		}

		// Autoplay policy: contexts created before a user gesture start
		// suspended and stay silent until resume() is called.
		if (audioContext.state === "suspended") {
			void audioContext.resume().catch(() => {
				// Resume is rejected until the user interacts with the page
			});
		}

		// Stop any currently playing sound
		if (sourceNodeRef.current) {
			try {
				sourceNodeRef.current.stop();
			} catch {
				// Ignore errors if already stopped
			}
		}

		// Create new source node
		const source = audioContext.createBufferSource();
		source.buffer = audioBuffer;
		source.loop = loop;
		source.playbackRate.value = playbackRate;

		// Create gain node for volume control
		const gainNode = audioContext.createGain();
		gainNode.gain.value = volume;

		// Connect nodes: source -> gain -> destination
		source.connect(gainNode);
		gainNode.connect(audioContext.destination);

		// Store references
		sourceNodeRef.current = source;
		gainNodeRef.current = gainNode;

		// Handle end event
		source.onended = () => {
			if (!loop) {
				setIsPlaying(false);
			}
		};

		// Start playback
		source.start(0);
		setIsPlaying(true);
	}, [loop, volume, playbackRate, isLoading, error]);

	// Stop sound
	const stop = useCallback(() => {
		if (sourceNodeRef.current) {
			try {
				sourceNodeRef.current.stop();
				sourceNodeRef.current.disconnect();
			} catch {
				// Ignore errors if already stopped
			}
			sourceNodeRef.current = null;
		}
		setIsPlaying(false);
	}, []);

	// Cleanup on unmount
	useEffect(
		() => () => {
			stop();
			const audioContext = audioContextRef.current;
			audioContextRef.current = null;
			audioBufferRef.current = null;
			// Browsers cap concurrent AudioContexts, so release the hardware
			// handle instead of leaking one per remount
			if (audioContext && audioContext.state !== "closed") {
				void audioContext.close().catch(() => {
					// Ignore errors from contexts already being closed
				});
			}
		},
		[stop]
	);

	return {
		play,
		stop,
		isPlaying,
		isLoading,
		error,
	};
}
