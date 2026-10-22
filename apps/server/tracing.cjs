// All server launchers preload this before Next.js. In deployed containers,
// service tags and agent sockets come from the cluster's admission controller.
require("dd-trace").init();
