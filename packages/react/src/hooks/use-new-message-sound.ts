import { useCallback } from "react";
import { useSoundEffect } from "./use-sound-effect";

const loadNewMessageSound = () =>
	import("../sounds/sound-data").then(
		({ NEW_MESSAGE_SOUND_DATA_URL }) => NEW_MESSAGE_SOUND_DATA_URL
	);

/**
 * Hook to play a sound when a new message arrives.
 *
 * @param options - Optional configuration for volume and playback speed
 * @returns Function to play the new message sound
 *
 * @example
 * const playNewMessageSound = useNewMessageSound({ volume: 0.8, playbackRate: 1.1 });
 *
 * useEffect(() => {
 *   if (hasNewMessage) {
 *     playNewMessageSound();
 *   }
 * }, [hasNewMessage]);
 */
export function useNewMessageSound(options?: {
	volume?: number;
	playbackRate?: number;
}): () => void {
	const { play } = useSoundEffect(loadNewMessageSound, {
		loop: false,
		volume: options?.volume ?? 0.7,
		playbackRate: options?.playbackRate ?? 1.0,
	});

	return useCallback(() => {
		play();
	}, [play]);
}
