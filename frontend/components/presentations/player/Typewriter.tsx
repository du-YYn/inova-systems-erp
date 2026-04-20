'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  durationMs: number;
  startDelay?: number;
  enabled: boolean;
  className?: string;
}

export function Typewriter({ text, durationMs, startDelay = 0, enabled, className }: Props) {
  const [visible, setVisible] = useState(enabled ? 0 : text.length);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { setVisible(text.length); return; }
    setVisible(0);
    const start = performance.now() + startDelay;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - start);
      const ratio = Math.min(1, elapsed / Math.max(durationMs, 1));
      setVisible(Math.floor(ratio * text.length));
      if (ratio < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [text, durationMs, startDelay, enabled]);

  const typing = enabled && visible < text.length;
  return (
    <span className={className}>
      {text.slice(0, visible)}
      {typing && <span className="inline-block w-[1px] h-[0.9em] bg-current ml-[1px] align-middle animate-[inova-blink_0.6s_steps(1)_infinite]" />}
    </span>
  );
}
