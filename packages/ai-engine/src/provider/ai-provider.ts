import { AiProvider } from "../types";

/**
 * Re-exported for convenience — the actual interface lives in ../types
 * since AiValidationRequest/Response need to be colocated with it.
 * Providers are swapped purely via this interface: the AiService never
 * imports a concrete provider, only depends on AiProvider.
 */
export type { AiProvider };
