/**
 * Append-only audit log.
 *
 * Placeholder for the walking skeleton. Every state change (archive, block, group move, card
 * reissue, policy edit) will be recorded here with a timestamp and reason — but **never an actor**:
 * FD has ruled out login, so the system cannot tell its 3–4 staff apart. The log answers *what*
 * changed, *when* and *why*, never *who* (docs/tech_stack_architecture_sketch.md §5.2). The concrete
 * append implementation lands when the first state-changing use case does.
 */
export {};
