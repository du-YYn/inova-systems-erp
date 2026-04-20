import { toPng } from "html-to-image";
import { uploadThumbnail } from "./api";

function flowWrapper(): HTMLElement | null {
  return document.querySelector(".react-flow") as HTMLElement | null;
}

function shouldIncludeInSnapshot(node: HTMLElement) {
  const classes = node.classList;
  if (!classes) return true;
  return !classes.contains("react-flow__controls")
    && !classes.contains("react-flow__minimap")
    && !classes.contains("react-flow__attribution");
}

export async function exportCanvasPng(name: string) {
  const el = flowWrapper();
  if (!el) throw new Error("Canvas não encontrado");
  const dataUrl = await toPng(el, {
    backgroundColor: getComputedStyle(el).backgroundColor || "#08080E",
    pixelRatio: 2,
    filter: (n) => shouldIncludeInSnapshot(n as HTMLElement),
  });
  const link = document.createElement("a");
  link.download = `${name.replace(/[^\w-]+/g, "_")}.png`;
  link.href = dataUrl;
  link.click();
}

export async function generateAndUploadThumbnail(presentationId: string) {
  const el = flowWrapper();
  if (!el) throw new Error("Canvas não encontrado");
  const dataUrl = await toPng(el, {
    backgroundColor: "#08080E",
    pixelRatio: 1.2,
    width: 960,
    height: 540,
    canvasWidth: 960,
    canvasHeight: 540,
    filter: (n) => shouldIncludeInSnapshot(n as HTMLElement),
  });
  const blob = await (await fetch(dataUrl)).blob();
  return uploadThumbnail(presentationId, blob);
}
