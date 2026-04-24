import { useCallback, useEffect, useRef, useState } from "react";

export function useHistory<T>(initial: T, limit = 50) {
  const [current, setCurrent] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const skipNext = useRef(false);
  const [, forceUpdate] = useState(0);

  const push = useCallback((value: T) => {
    if (skipNext.current) { skipNext.current = false; setCurrent(value); return; }
    past.current = [...past.current, current].slice(-limit);
    future.current = [];
    setCurrent(value);
    forceUpdate((n) => n + 1);
  }, [current, limit]);

  const replace = useCallback((value: T) => {
    skipNext.current = true;
    setCurrent(value);
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [current, ...future.current];
    skipNext.current = true;
    setCurrent(prev);
    forceUpdate((n) => n + 1);
  }, [current]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, current];
    skipNext.current = true;
    setCurrent(next);
    forceUpdate((n) => n + 1);
  }, [current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return {
    state: current,
    push,
    replace,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
