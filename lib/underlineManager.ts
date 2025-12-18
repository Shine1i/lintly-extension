import type { Severity, IssueWithPosition } from "./types";
import { findTextRange, getInputTextRect } from "./textFinder";

interface UnderlineElement {
  id: string;
  element: HTMLDivElement;
  issue: IssueWithPosition;
}

let container: HTMLDivElement | null = null;
let stylesInjected = false;
const underlines = new Map<string, UnderlineElement>();
let currentTargetElement: HTMLElement | null = null;
let scrollListener: (() => void) | null = null;
let resizeListener: (() => void) | null = null;

function injectStyles(): void {
  if (stylesInjected) return;

  const style = document.createElement("style");
  style.id = "lintly-underline-styles";
  style.textContent = `
    @keyframes lintlyAppear {
      from { opacity: 0; transform: scaleX(0); }
      to { opacity: 1; transform: scaleX(1); }
    }
    .lintly-underline {
      pointer-events: auto;
      cursor: pointer;
      transform-origin: left;
      animation: lintlyAppear 0.3s ease-out forwards;
      border-radius: 1px;
    }
    .lintly-error { background: #ef4444; }
    .lintly-warning { background: #f59e0b; }
    .lintly-suggestion { background: #06b6d4; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function ensureContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) {
    return container;
  }

  container = document.createElement("div");
  container.id = "lintly-underlines";
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2147483640;
  `;
  document.body.appendChild(container);
  return container;
}

function getUnderlineRect(
  element: HTMLElement,
  issue: IssueWithPosition
): DOMRect | null {
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    return getInputTextRect(
      element as HTMLInputElement | HTMLTextAreaElement,
      issue.startOffset,
      issue.endOffset - issue.startOffset
    );
  }

  const range = findTextRange(element, issue.original);
  if (!range) return null;

  return range.getBoundingClientRect();
}

function createUnderlineId(issue: IssueWithPosition): string {
  return `${issue.startOffset}-${issue.endOffset}-${issue.original.slice(0, 10)}`;
}

export function addUnderline(
  targetElement: HTMLElement,
  issue: IssueWithPosition,
  onClick?: (issue: IssueWithPosition) => void
): void {
  injectStyles();
  const cont = ensureContainer();

  const id = createUnderlineId(issue);
  if (underlines.has(id)) return;

  const rect = getUnderlineRect(targetElement, issue);
  if (!rect || rect.width <= 0) return;

  const el = document.createElement("div");
  el.className = `lintly-underline lintly-${issue.severity}`;
  el.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom - 2}px;
    width: ${rect.width}px;
    height: 2px;
  `;
  el.title = issue.explanation;

  if (onClick) {
    el.addEventListener("click", () => onClick(issue));
  }

  cont.appendChild(el);
  underlines.set(id, { id, element: el, issue });
}

export function removeUnderline(issue: IssueWithPosition): void {
  const id = createUnderlineId(issue);
  const underline = underlines.get(id);
  if (underline) {
    underline.element.remove();
    underlines.delete(id);
  }
}

export function updatePositions(targetElement: HTMLElement): void {
  underlines.forEach((underline) => {
    const rect = getUnderlineRect(targetElement, underline.issue);
    if (rect && rect.width > 0) {
      underline.element.style.left = `${rect.left}px`;
      underline.element.style.top = `${rect.bottom - 2}px`;
      underline.element.style.width = `${rect.width}px`;
    } else {
      underline.element.style.display = "none";
    }
  });
}

export function clearUnderlines(): void {
  underlines.forEach((underline) => underline.element.remove());
  underlines.clear();
}

export function setTargetElement(
  element: HTMLElement | null,
  issues: IssueWithPosition[] = [],
  onClick?: (issue: IssueWithPosition) => void
): void {
  if (scrollListener && currentTargetElement) {
    currentTargetElement.removeEventListener("scroll", scrollListener);
    window.removeEventListener("scroll", scrollListener);
    window.removeEventListener("resize", resizeListener!);
  }

  clearUnderlines();
  currentTargetElement = element;

  if (!element) return;

  for (const issue of issues) {
    addUnderline(element, issue, onClick);
  }

  let rafId = 0;
  const throttledUpdate = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      updatePositions(element);
      rafId = 0;
    });
  };

  scrollListener = throttledUpdate;
  resizeListener = throttledUpdate;

  element.addEventListener("scroll", scrollListener);
  window.addEventListener("scroll", scrollListener);
  window.addEventListener("resize", resizeListener);
}

export function updateIssues(
  issues: IssueWithPosition[],
  onClick?: (issue: IssueWithPosition) => void
): void {
  if (!currentTargetElement) return;

  const newIds = new Set(issues.map(createUnderlineId));

  underlines.forEach((underline, id) => {
    if (!newIds.has(id)) {
      underline.element.remove();
      underlines.delete(id);
    }
  });

  for (const issue of issues) {
    const id = createUnderlineId(issue);
    if (!underlines.has(id)) {
      addUnderline(currentTargetElement, issue, onClick);
    }
  }
}

export function destroy(): void {
  if (scrollListener && currentTargetElement) {
    currentTargetElement.removeEventListener("scroll", scrollListener);
    window.removeEventListener("scroll", scrollListener);
    window.removeEventListener("resize", resizeListener!);
  }

  clearUnderlines();

  if (container) {
    container.remove();
    container = null;
  }

  const style = document.getElementById("lintly-underline-styles");
  if (style) style.remove();
  stylesInjected = false;

  currentTargetElement = null;
  scrollListener = null;
  resizeListener = null;
}
