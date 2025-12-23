import type { SelectionRect } from "./types";

let cachedMirror: HTMLDivElement | null = null;
let cachedMirrorElement: HTMLElement | null = null;

type MirrorHost = HTMLElement | ShadowRoot;
let mirrorHost: MirrorHost | null = null;

export function setMirrorHost(host: MirrorHost | null): void {
  mirrorHost = host;
  if (cachedMirror && mirrorHost && cachedMirror.parentNode !== mirrorHost) {
    mirrorHost.appendChild(cachedMirror);
  }
}

function getMirrorHost(): MirrorHost {
  if (mirrorHost) {
    return mirrorHost;
  }
  return document.body ?? document.documentElement;
}

function ensureMirrorMounted(mirror: HTMLDivElement): void {
  const host = getMirrorHost();
  if (mirror.parentNode !== host) {
    host.appendChild(mirror);
  }
}

const MIRROR_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "fontStretch",
  "fontKerning",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "textRendering",
  "wordBreak",
  "wordWrap",
  "overflowWrap",
  "whiteSpace",
  "tabSize",
  "hyphens",
  "textAlign",
  "direction",
  "unicodeBidi",
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const;

function getMirrorDiv(element: HTMLElement, elementRect?: DOMRectReadOnly): HTMLDivElement {
  const rect = elementRect ?? element.getBoundingClientRect();

  if (cachedMirror && cachedMirrorElement === element) {
    cachedMirror.style.left = `${rect.left}px`;
    cachedMirror.style.top = `${rect.top}px`;
    cachedMirror.style.width = `${rect.width}px`;
    return cachedMirror;
  }

  if (!cachedMirror) {
    cachedMirror = document.createElement("div");
    cachedMirror.style.position = "fixed";
    cachedMirror.style.visibility = "hidden";
    cachedMirror.style.pointerEvents = "none";
    cachedMirror.style.overflow = "hidden";
    cachedMirror.style.zIndex = "-9999";
  }

  const computed = window.getComputedStyle(element);

  cachedMirror.style.left = `${rect.left}px`;
  cachedMirror.style.top = `${rect.top}px`;
  cachedMirror.style.width = `${rect.width}px`;

  for (const prop of MIRROR_STYLES) {
    const cssKey = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    cachedMirror.style.setProperty(cssKey, computed.getPropertyValue(cssKey));
  }

  if (element instanceof HTMLInputElement) {
    cachedMirror.style.whiteSpace = "pre";
    cachedMirror.style.wordWrap = "normal";
    cachedMirror.style.overflowWrap = "normal";
  } else if (element instanceof HTMLTextAreaElement) {
    const wrap = element.getAttribute("wrap");
    if (wrap === "off") {
      cachedMirror.style.whiteSpace = "pre";
      cachedMirror.style.wordWrap = "normal";
    } else {
      cachedMirror.style.whiteSpace = "pre-wrap";
      cachedMirror.style.wordWrap = "break-word";
    }
  } else {
    cachedMirror.style.whiteSpace = computed.whiteSpace || "pre-wrap";
    cachedMirror.style.wordWrap = computed.wordWrap || "break-word";
  }

  cachedMirror.style.borderColor = "transparent";
  cachedMirrorElement = element;

  return cachedMirror;
}

export function cleanupMirrorCache(): void {
  if (cachedMirror && cachedMirror.parentNode) {
    cachedMirror.parentNode.removeChild(cachedMirror);
  }
  cachedMirror = null;
  cachedMirrorElement = null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function getTextareaSelectionRect(
  element: HTMLTextAreaElement | HTMLInputElement
): SelectionRect | null {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (start === end) return null;

  const elementRect = element.getBoundingClientRect();
  const mirror = getMirrorDiv(element, elementRect);

  const value = element.value;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);

  mirror.innerHTML =
    escapeHtml(before) +
    '<span id="lintly-sel-marker">' +
    escapeHtml(selected) +
    "</span>";

  ensureMirrorMounted(mirror);

  const marker = mirror.querySelector("#lintly-sel-marker");
  if (!marker) {
    return null;
  }

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const scrollTop = element.scrollTop;
  const scrollLeft = element.scrollLeft;

  return {
    top: elementRect.top + (markerRect.top - mirrorRect.top) - scrollTop,
    bottom: elementRect.top + (markerRect.bottom - mirrorRect.top) - scrollTop,
    left: elementRect.left + (markerRect.left - mirrorRect.left) - scrollLeft,
    right: elementRect.left + (markerRect.right - mirrorRect.left) - scrollLeft,
  };
}

export function getTextareaTextRects(
  element: HTMLTextAreaElement | HTMLInputElement,
  startIndex: number,
  endIndex: number,
  elementRect?: DOMRectReadOnly
): DOMRect[] {
  const elementRectValue = elementRect ?? element.getBoundingClientRect();
  const mirror = getMirrorDiv(element, elementRectValue);

  const value = element.value;
  const before = value.slice(0, startIndex);
  const target = value.slice(startIndex, endIndex);
  const after = value.slice(endIndex);

  mirror.innerHTML =
    escapeHtml(before) +
    '<span class="lintly-measure-target">' +
    escapeHtml(target) +
    "</span>" +
    escapeHtml(after);

  ensureMirrorMounted(mirror);

  const targetSpan = mirror.querySelector(".lintly-measure-target");
  if (!targetSpan) {
    return [];
  }

  const range = document.createRange();
  range.selectNodeContents(targetSpan);
  const clientRects = range.getClientRects();

  const mirrorRect = mirror.getBoundingClientRect();
  const scrollTop = element.scrollTop;
  const scrollLeft = element.scrollLeft;

  const rects: DOMRect[] = [];
  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i];

    const left = r.left - mirrorRect.left + elementRectValue.left - scrollLeft;
    const top = r.top - mirrorRect.top + elementRectValue.top - scrollTop;

    rects.push(new DOMRect(left, top, r.width, r.height));
  }

  return rects;
}
