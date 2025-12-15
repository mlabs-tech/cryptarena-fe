/**
 * Shim for the `tape` test runner.
 *
 * Some transitive dependencies (e.g. `thread-stream`) publish `test/*` files
 * that `require("tape")`. Those files should not be bundled into a Next.js app,
 * but if they are pulled into the build graph, this shim prevents a hard
 * "Module not found: Can't resolve 'tape'" failure during bundling.
 *
 * This module is not meant to be executed at runtime.
 */
module.exports = function tapeShim() {
  throw new Error(
    "The `tape` shim was executed. A dependency test file was bundled and run unexpectedly."
  );
};


