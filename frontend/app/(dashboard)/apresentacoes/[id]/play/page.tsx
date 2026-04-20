'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPresentation } from '@/lib/presentations/api';
import {
  DEFAULT_CONFIG, DEFAULT_TIMELINE, EMPTY_CANVAS,
  type CanvasJson, type ConfigJson, type TimelineJson,
} from '@/lib/presentations/types';
import { PlayerCore } from '@/components/presentations/player/PlayerCore';

export default function PlayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [canvas, setCanvas] = useState<CanvasJson>(EMPTY_CANVAS);
  const [config, setConfig] = useState<ConfigJson>(DEFAULT_CONFIG);
  const [timeline, setTimeline] = useState<TimelineJson>(DEFAULT_TIMELINE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    (async () => {
      const data = await getPresentation(params.id);
      setName(data.name);
      setCanvas({ ...EMPTY_CANVAS,     ...(data.canvas_json   as unknown as CanvasJson) });
      setConfig({ ...DEFAULT_CONFIG,   ...(data.config_json   as unknown as ConfigJson) });
      setTimeline({ ...DEFAULT_TIMELINE, ...(data.timeline_json as unknown as TimelineJson) });
      setReady(true);
    })();
  }, [params?.id]);

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-gray-400">Carregando...</div>
    );
  }

  return (
    <PlayerCore
      name={name}
      canvas={canvas}
      timeline={timeline}
      config={config}
      onExit={() => router.push(`/apresentacoes/${params!.id}`)}
      allowFreeMode
    />
  );
}
