// doing this so that worker's URL stays the same
// - couldn't figure out how to output SW using a custom filename
// - don't want to deal with serving both `/service-worker.js` and `/service-worker/index.js`
import "./src/service-worker/index.ts";
