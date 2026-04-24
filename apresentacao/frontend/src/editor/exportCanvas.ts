import { toPng } from "html-to-image";
import { api } from "@/api/client";

function canvasElement(): HTMLElement | null {
  return document.querySelector(".react-flow__viewport") as HTMLElement | null;
}

function flowWrapper(): HTMLElement | null {
  return document.querySelector(".react-flow") as HTMLElement | null;
}

export async function exportarCanvasPng(nome: string) {
  const el = flowWrapper();
  if (!el) throw new Error("Canvas não encontrado");
  const dataUrl = await toPng(el, {
    backgroundColor: getComputedStyle(el).backgroundColor || "#08080E",
    pixelRatio: 2,
    filter: (node) => {
      const classes = (node as HTMLElement).classList;
      if (!classes) return true;
      return !classes.contains("react-flow__controls")
        && !classes.contains("react-flow__minimap")
        && !classes.contains("react-flow__attribution");
    },
  });
  const link = document.createElement("a");
  link.download = `${nome.replace(/[^\w\-]+/g, "_")}.png`;
  link.href = dataUrl;
  link.click();
}

export async function gerarEnviarThumbnail(apresentacaoId: string) {
  const el = canvasElement() ?? flowWrapper();
  if (!el) throw new Error("Canvas não encontrado");
  const dataUrl = await toPng(el, {
    backgroundColor: "#08080E",
    pixelRatio: 1.2,
    width: 960,
    height: 540,
    canvasWidth: 960,
    canvasHeight: 540,
    filter: (node) => {
      const classes = (node as HTMLElement).classList;
      if (!classes) return true;
      return !classes.contains("react-flow__controls")
        && !classes.contains("react-flow__minimap")
        && !classes.contains("react-flow__attribution");
    },
  });
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("arquivo", blob, "thumbnail.png");
  const { data } = await api.post<{ thumbnail_url: string }>(
    `/apresentacoes/${apresentacaoId}/thumbnail/`,
    form,
  );
  return data.thumbnail_url;
}
