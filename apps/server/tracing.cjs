// Initialize before Next.js, using the service tags and agent socket settings
// already injected by the cluster's Datadog admission controller.
require("dd-trace").init();
