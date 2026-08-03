import { useEffect } from "react";
import { useSoundEffect } from "./use-sound-effect";

const loadTypingSound = () =>
	import("../sounds/sound-data").then(
		({ TYPING_LOOP_SOUND_DATA_URL }) => TYPING_LOOP_SOUND_DATA_URL
	);

/**
 * Hook to play a looping typing sound while someone is typing.
 *
 * @param isTyping - Whether someone is currently typing
 * @param options - Optional configuration for volume and playback speed
 *
 * @example
 * const { isTyping } = useTypingIndicator();
 * useTypingSound(isTyping, { volume: 1.0, playbackRate: 1.2 });
 */
export function useTypingSound(
	isTyping: boolean,
	options?: { volume?: number; playbackRate?: number }
): void {
	const { play, stop, isPlaying } = useSoundEffect(loadTypingSound, {
		loop: true,
		volume: options?.volume ?? 1.2,
		playbackRate: options?.playbackRate ?? 1.0,
	});

	useEffect(() => {
		if (isTyping && !isPlaying) {
			play();
		} else if (!isTyping && isPlaying) {
			stop();
		}
	}, [isTyping, isPlaying, play, stop]);

	// Cleanup on unmount
	useEffect(
		() => () => {
			stop();
		},
		[stop]
	);
}
