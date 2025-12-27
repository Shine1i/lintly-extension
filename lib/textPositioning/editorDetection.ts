const WORD_WEB_SELECTORS = [
  "#WACViewPanel_EditingElement",
  "#WACViewPanel_EditingElement_WrappingDiv",
  "[id^=\"WACViewPanel_EditingElement\"]",
  ".WACEditing",
  ".EditingSurfaceBody",
];

const MANAGED_EDITOR_SELECTORS = [
  ...WORD_WEB_SELECTORS,
  "[data-lexical-editor]",
  "[data-slate-editor]",
  "[data-slate-node]",
  ".codex-editor",
  ".ce-block__content",
  ".ProseMirror",
  ".remirror-editor",
  ".milkdown",
  ".ql-editor",
  ".ck-editor__editable",
  ".ck-editor__editable_inline",
  ".ck-content",
  ".cke_editable",
  ".fr-element",
  ".fr-view",
  ".jodit-wysiwyg",
  ".redactor-editor",
  ".note-editable",
  ".summernote",
  ".trumbowyg-editor",
  ".pell-editor",
  "trix-editor",
  ".trix-content",
  ".medium-editor-element",
  ".toastui-editor",
  ".toastui-editor-contents",
  ".toastui-editor-ww-container",
  ".w-e-editor",
  ".w-e-text-container",
  ".w-e-text",
  ".edui-container",
  ".k-editor .k-content",
  ".k-editor .k-editable",
  ".e-rte-content",
  ".wysihtml5-editor",
  ".DraftEditor-root",
  ".mce-content-body",
  ".tox-edit-area",
  ".public-DraftEditor-content",
];

export function isWordWebEditor(element: HTMLElement): boolean {
  for (const selector of WORD_WEB_SELECTORS) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }
  return false;
}

export function shouldAvoidDirectDomFallback(element: HTMLElement): boolean {
  if (isWordWebEditor(element)) {
    return true;
  }
  for (const selector of MANAGED_EDITOR_SELECTORS) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }
  return false;
}
