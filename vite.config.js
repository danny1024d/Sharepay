import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = resolve(projectRoot, "public");

export default defineConfig({
  root: publicRoot,
  publicDir: false,
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(publicRoot, "index.html"),
        login: resolve(publicRoot, "login.html"),
        trips: resolve(publicRoot, "trips.html"),
        itinerary: resolve(publicRoot, "itinerary.html"),
        kamui: resolve(publicRoot, "kamui.html"),
        snowNotes: resolve(publicRoot, "snow-notes.html")
      },
      external: id => id.startsWith("https://www.gstatic.com/firebasejs/")
    }
  }
});