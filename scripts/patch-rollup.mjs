import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const nativeJsPath = resolve("node_modules/rollup/dist/native.js");

if (existsSync(nativeJsPath)) {
  let content = readFileSync(nativeJsPath, "utf8");
  if (!content.includes("@rollup/wasm-node/dist/native.js")) {
    const original = `const nativeModule = requireWithFriendlyError(
\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`
);`;
    const replacement = `let nativeModule;
try {
\tnativeModule = require('@rollup/wasm-node/dist/native.js');
} catch {
\tnativeModule = requireWithFriendlyError(
\t\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`
\t);
}`;
    if (content.includes(original)) {
      content = content.replace(original, replacement);
      writeFileSync(nativeJsPath, content, "utf8");
      console.log("✅ Patched rollup native loader to use @rollup/wasm-node");
    }
  }
}
