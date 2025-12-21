import { createContext, useContext } from "react";

const ShadowDOMContext = createContext<HTMLElement | null>(null);

export const ShadowDOMProvider = ShadowDOMContext.Provider;

export function useShadowContainer() {
  return useContext(ShadowDOMContext);
}
