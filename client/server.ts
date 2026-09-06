import { serve } from "bun";
import { existsSync } from "node:fs";

const PORT = Number(process.env.PORT) || 8080;

serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    let filePath = `./dist${url.pathname}`;

    if (!existsSync(filePath) || url.pathname === "/") {
      filePath = "./dist/index.html";
    }

    return new Response(Bun.file(filePath));
  },
});

console.log(`Cloud run service listening on http://0.0.0.0:${PORT}`);