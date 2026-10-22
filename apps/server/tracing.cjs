// Preload this before Next.js so its modules can be instrumented when loaded.
// DD_ENV, DD_SERVICE and the agent settings are read from the environment.
require("dd-trace").init();
