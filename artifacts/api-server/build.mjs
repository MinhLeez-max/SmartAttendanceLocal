import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts"], outdir: "dist", outExtension: { ".js": ".mjs" },
  bundle: true, platform: "node", format: "esm", target: "node22",
  plugins: [{ name: "external-npm-not-workspace", setup(build) {
    build.onResolve({ filter: /^[^./]|^@/ }, args => args.path.startsWith("@workspace/") ? undefined : ({ path: args.path, external: true }));
  } }],
});
