// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");

const source = path.join(process.cwd(), ".next", "static");
const destination = path.join(process.cwd(), ".next", "standalone", ".next", "static");

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });
