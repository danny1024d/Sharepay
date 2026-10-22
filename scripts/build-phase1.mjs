import { build } from "vite";
import config from "../vite.config.js";

await build({
  ...config,
  build: {
    ...config.build,
    emptyOutDir: false,
    rollupOptions: {
      ...config.build.rollupOptions,
      input: { index: config.build.rollupOptions.input.index }
    }
  }
});
