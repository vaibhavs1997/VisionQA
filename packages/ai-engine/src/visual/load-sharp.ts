import type Sharp from "sharp";

let sharpModule: Promise<typeof Sharp | null> | undefined;

/** Lazy-load sharp so apps can start on platforms without a prebuilt binary (e.g. win32-arm64). */
export async function getSharp(): Promise<typeof Sharp | null> {
  if (!sharpModule) {
    sharpModule = import("sharp")
      .then((mod) => mod.default)
      .catch(() => null);
  }
  return sharpModule;
}
