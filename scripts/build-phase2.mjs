import { build } from "vite";
import config from "../vite.config.js";

const input = { ...config.build.rollupOptions.input };
delete input.index;

await build({
  ...config,
  build: {
    ...config.build,
    emptyOutDir: false,
    rollupOptions: {
      ...config.build.rollupOptions,
      input
    }
  }
});
