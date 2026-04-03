import { useCallback, useEffect, useRef, useState } from "react";

export function useAudioAnalyser(stream: MediaStream | null) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const [levels, setLevels] = useState<number[]>(new Array(8).fill(0));

  const start = useCallback(() => {
    if (!stream) return;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      const normalized = Array.from(dataArray.slice(0, 8)).map((v) => v / 255);
      setLevels(normalized);
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [stream]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevels(new Array(8).fill(0));
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  return { levels, start, stop };
}
