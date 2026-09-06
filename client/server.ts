import { serve } from "bun";
import { existsSync } from "node:fs";

serve({
  port: 8080,
  fetch(req) {
    const url = new URL(req.url);
    let filePath = `./dist${url.pathname}`;

    // Fallback to index.html
    if (!existsSync(filePath) || url.pathname === "/") {
      filePath = "./dist/index.html";
    }

    return new Response(Bun.file(filePath));
  },
});