import { createV1Descriptors, PACKAGE_ID } from '../contracts/index.js'

/**
 * Browser-side contribution for the Skill Manager Host face.
 *
 * Harness does not discover a plugin's Host methods from the client manifest
 * automatically.  A client package must mount its generated (or equivalent)
 * Typert contribution through `ctx.remote.$mount()` before reading
 * `ctx.remote.skillManager`.  Keeping the descriptor construction next to the
 * shared contract also makes the standalone bundle deterministic and avoids a
 * second runtime schema dependency in the browser.
 */
export const TYPERT_REMOTE = Object.freeze({
  package: PACKAGE_ID,
  descriptors: Object.freeze(createV1Descriptors(PACKAGE_ID)),
})

export default TYPERT_REMOTE
