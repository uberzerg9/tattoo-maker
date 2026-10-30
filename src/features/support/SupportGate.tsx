import { useState } from "react";
import type { ReactNode } from "react";
import { detectWebGlSupport } from "./webglSupport";
import { UnsupportedScreen } from "./UnsupportedScreen";

/** Shows the unsupported screen instead of the children, so the engine is not even downloaded for such a browser. */
export function SupportGate({ children }: { children: ReactNode }) {
  const [reason] = useState(() => detectWebGlSupport());
  return reason ? <UnsupportedScreen reason={reason} /> : children;
}
