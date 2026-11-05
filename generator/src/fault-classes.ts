/** The classes of seeded fault the evaluation understands; the single source for types and schemas. */
export const FAULT_CLASSES = ['validation', 'authz', 'crud', 'pagination', 'auth'] as const;

export type FaultClass = (typeof FAULT_CLASSES)[number];
