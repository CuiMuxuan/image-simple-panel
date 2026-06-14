const path = require("node:path");
const { pathToFileURL } = require("node:url");

process.env.IMAGE_SIMPLE_PANEL_RUNTIME = "desktop";
process.env.IMAGE_SIMPLE_PANEL_OPEN_BROWSER = "1";
process.env.PORT = process.env.PORT || "0";
process.env.IMAGE_SIMPLE_PANEL_APP_DIR = process.env.IMAGE_SIMPLE_PANEL_APP_DIR || path.dirname(process.execPath);

const entryUrl = pathToFileURL(path.resolve(path.dirname(process.execPath), "server", "desktop-entry.js"));
import(entryUrl.href);
