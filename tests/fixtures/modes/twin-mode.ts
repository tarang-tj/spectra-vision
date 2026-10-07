import sample from "./sample-mode";

// Registry fixture: reuses an id. Discovery keeps the first file by path
// (sample-mode.ts) and reports this one.
export default { ...sample, order: 99 };
