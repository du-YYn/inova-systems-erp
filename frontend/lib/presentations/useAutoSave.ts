import { useEffect, useRef, useState } from "react";

type Status = "idle" | "dirty" | "saving" | "saved" | "error";

export function useAutoSave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delay = 1500,
) {
  const [status, setStatus] = useState<Status>("idle");
  const first = useRef(true);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("dirty");
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await save(latest.current);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, delay);
    return () => { if (timeout.current) clearTimeout(timeout.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return status;
}
