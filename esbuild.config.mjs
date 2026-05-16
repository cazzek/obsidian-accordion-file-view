import esbuild from "esbuild";
import { builtinModules } from "node:module";
import process from "process";

const isProduction = process.argv[2] === "production";
const builtins = builtinModules.filter((mod) => !mod.startsWith("node:"));

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2018",
  sourcemap: isProduction ? false : "inline",
  outfile: "main.js",
  external: ["obsidian", "electron", ...builtins],
  minify: isProduction,
});

if (isProduction) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  console.log("Watching for changes...");
}
