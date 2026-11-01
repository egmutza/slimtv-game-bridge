import type { InputDetail } from "./contract";
/** Returns a function that gives each reader (by name) its own `emit`, merged into `emit`. */
export declare function mergeInputs(emit: (detail: InputDetail) => void): (reader: string) => (detail: InputDetail) => void;
