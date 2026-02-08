/**
 * Why: Electron main process compiles to CJS, but lib/core modules are ESM.
 * This bridge uses Node.js native import() (not transformed by any bundler)
 * to load ESM modules from CJS context. The ! characters in path names
 * require proper file:// URL encoding via pathToFileURL.
 */

const path = require('path');
const { pathToFileURL } = require('url');

const CORE_DIR = __dirname;

async function loadCoreModule(moduleName) {
  const fullPath = path.join(CORE_DIR, moduleName);
  const moduleUrl = pathToFileURL(fullPath).href;
  return await import(moduleUrl);
}

module.exports = { loadCoreModule };
