/**
 * Which registers an e2e run drives, and in which browser engine.
 *
 * `playwright.config.ts` and the specs both need these paths, and they must never disagree: the
 * config points a *server* at a database, and a dozen specs open the **same file** a second time
 * through Prisma to seed the household they are about to drive. Spelled out in both places, a
 * changed path seeds one database and asserts against another — a failure that reads like a broken
 * rule rather than a broken path. So they are spelled out once, here, and imported by both.
 *
 * ## One engine per invocation, not per project
 *
 * DF are supported on Safari and on Chromium-based browsers (ADR-012), so both are gated. The
 * obvious shape — a second Playwright *project* — does not work here, for two independent reasons:
 *
 * 1. **The specs read these paths at module scope**, where `testInfo` does not exist yet and a
 *    project's `use` block cannot reach. `process.env` does exist there, so the engine is chosen by
 *    the environment and every consumer derives the same answer from it.
 * 2. **The register is shared and ordered.** `registration.spec.ts` asserts the lowest free customer
 *    number against what earlier specs in the run already consumed, and each database is deleted and
 *    re-seeded inside `webServer.command` — which runs once per *run*, not per project. A second
 *    project replaying those specs over the already-mutated register would fail on state rather than
 *    on rendering, which teaches nothing about the engine.
 *
 * A separate invocation per engine gives each one a register of its own, freshly seeded, with no
 * ordering between engines to reason about: `npm run test:e2e` drives Chromium,
 * `npm run test:e2e:webkit` drives WebKit. Chromium keeps the ports and filenames it has always
 * used, so the default run is byte-for-byte the run it was before WebKit existed.
 */

/** The engines DF is supported on. Firefox is deliberately not among them — see ADR-012. */
export type EngineName = "chromium" | "webkit";

interface EngineDefinition {
  /** The Playwright device descriptor to spread into `use`. */
  readonly device: "Desktop Chrome" | "Desktop Safari";
  /** The shared register's port; the isolated one takes the next number up. */
  readonly basePort: number;
  /** Appended to every scratch filename. Empty for Chromium, so its paths never moved. */
  readonly suffix: string;
}

const ENGINES: Readonly<Record<EngineName, EngineDefinition>> = {
  chromium: { device: "Desktop Chrome", basePort: 3000, suffix: "" },
  webkit: { device: "Desktop Safari", basePort: 3002, suffix: "-webkit" },
};

function readEngine(): EngineName {
  const requested = process.env.FD_E2E_ENGINE;
  if (requested === undefined) return "chromium";
  if (requested in ENGINES) return requested as EngineName;
  // Loudly, rather than silently falling back: a typo here would otherwise run Chromium twice and
  // report a green WebKit gate that never ran.
  throw new Error(
    `FD_E2E_ENGINE must be one of ${Object.keys(ENGINES).join(", ")}, not ${JSON.stringify(requested)}`,
  );
}

/** The engine this invocation drives, from `FD_E2E_ENGINE`; Chromium when unset. */
export const ENGINE: EngineName = readEngine();

/** The device descriptor key for {@link ENGINE}, spread into the project's `use`. */
export const DEVICE = ENGINES[ENGINE].device;

/** One server: the port it listens on, the register behind it, and its pinned-clock file. */
export interface Register {
  readonly port: number;
  readonly database: string;
  readonly now: string;
}

function register(offset: number, kind: string): Register {
  const { basePort, suffix } = ENGINES[ENGINE];
  return {
    port: basePort + offset,
    database: `data/e2e${suffix}${kind}.db`,
    now: `data/e2e${suffix}${kind}-now.txt`,
  };
}

/** The shared register: everything except the specs listed under {@link ISOLATED_SPECS}. */
export const SHARED: Register = register(0, "");

/** The register a spec may own outright — empty at boot, and nobody else's assertions ride on it. */
export const ISOLATED: Register = register(1, "-isolated");

/**
 * The specs that own their register.
 *
 * Add one here only when it must decide the quota or fill every slot — the isolated project costs a
 * second Next server for the whole run, and a spec that merely writes is fine on the shared one.
 *
 * The two here **share** that register, in alphabetical order like everything else, and each empties
 * it in its own `beforeAll` (`clearRegister`) before setting the quota it needs. That is what makes
 * sharing safe and is required of them anyway: both are `mode: "serial"`, and a CI retry replays the
 * block against the register the previous attempt filled.
 */
export const ISOLATED_SPECS = ["**/number-group.spec.ts", "**/waiting-list.spec.ts"];
