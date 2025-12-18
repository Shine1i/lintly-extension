export function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;

  const tagName = el.tagName.toUpperCase();

  if (tagName === "TEXTAREA") return true;

  if (tagName === "INPUT") {
    const inputEl = el as HTMLInputElement;
    const editableTypes = ["text", "email", "search", "url", "tel", "password"];
    if (editableTypes.includes(inputEl.type) && !inputEl.readOnly && !inputEl.disabled) {
      return true;
    }
  }

  if ((el as HTMLElement).isContentEditable) {
    return true;
  }

  return false;
}

export function getEditableText(el: HTMLElement): string {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
  }
  return el.innerText || el.textContent || "";
}

export function generateElementId(el: HTMLElement): string {
  if (el.id) return `id:${el.id}`;
  if (el.name) return `name:${(el as HTMLInputElement).name}`;

  const path: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    path.unshift(selector);
    current = parent;
  }

  return `path:${path.join(">")}`;
}
