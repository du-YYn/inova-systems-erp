import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApresentacao } from "@/api/apresentacoes";
import {
  DEFAULT_CONFIG,
  DEFAULT_TIMELINE,
  EMPTY_CANVAS,
  type CanvasJson,
  type ConfigJson,
  type TimelineJson,
} from "@/editor/types";
import { PlayerCore } from "./PlayerCore";

export function PresentationPlayer() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [nome, setNome] = useState("");
  const [canvas, setCanvas] = useState<CanvasJson>(EMPTY_CANVAS);
  const [config, setConfig] = useState<ConfigJson>(DEFAULT_CONFIG);
  const [timeline, setTimeline] = useState<TimelineJson>(DEFAULT_TIMELINE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const data = await getApresentacao(id);
      setNome(data.nome);
      setCanvas({ ...EMPTY_CANVAS, ...(data.canvas_json as unknown as CanvasJson) });
      setConfig({ ...DEFAULT_CONFIG, ...(data.config_json as unknown as ConfigJson) });
      setTimeline({ ...DEFAULT_TIMELINE, ...(data.timeline_json as unknown as TimelineJson) });
      setReady(true);
    })();
  }, [id]);

  if (!ready) {
    return <div className="h-screen flex items-center justify-center text-[color:var(--color-text-tertiary)] text-sm">Carregando...</div>;
  }

  return (
    <PlayerCore
      nome={nome}
      canvas={canvas}
      timeline={timeline}
      config={config}
      onExit={() => nav(`/apresentacao/${id}/editor`)}
      permitirModoLivre
    />
  );
}
