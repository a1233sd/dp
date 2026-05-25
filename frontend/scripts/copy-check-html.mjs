import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const staticDir = resolve(import.meta.dirname, "../../app/static");
copyFileSync(resolve(staticDir, "index.html"), resolve(staticDir, "check.html"));
