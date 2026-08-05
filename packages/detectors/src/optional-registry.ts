import { Detector } from "./types";
import { axeViolationsDetector } from "./accessibility/axe-violations.detector";

/** Detectors enabled only when matching PageContext / project flags are set. */
export const OPTIONAL_DETECTORS: Detector[] = [axeViolationsDetector];
