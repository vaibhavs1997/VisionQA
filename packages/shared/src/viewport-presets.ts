export type ViewportName = "desktop" | "tablet" | "mobile";

export interface Viewport {
  name: ViewportName | string;
  width: number;
  height: number;
}

/**
 * Phase 0 scope: desktop and mobile are required, tablet is supported
 * but optional (per the Phase 0 spec). All three are defined here so
 * Phase 1+ can enable tablet without touching this contract.
 */
export const VIEWPORT_PRESETS: Record<ViewportName, Viewport> = {
  desktop: { name: "desktop", width: 1440, height: 900 },
  tablet: { name: "tablet", width: 768, height: 1024 },
  mobile: { name: "mobile", width: 390, height: 844 },
};

export function resolveViewports(names: string[]): Viewport[] {
  const resolved: Viewport[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    const preset = (VIEWPORT_PRESETS as Record<string, Viewport>)[name];
    if (!preset) {
      throw new Error(
        `Unknown viewport "${raw}". Supported: ${Object.keys(VIEWPORT_PRESETS).join(", ")}`
      );
    }
    resolved.push(preset);
  }
  if (resolved.length === 0) {
    throw new Error("At least one viewport must be specified.");
  }
  return resolved;
}
