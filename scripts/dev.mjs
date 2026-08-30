/* global console, process */

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localEnvPath = path.join(root, ".env.local");

function readLocalEnv(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

const localEnv = readLocalEnv(localEnvPath);
const localIp = process.env.LOCAL_IP ?? localEnv.LOCAL_IP ?? "localhost";
const webUrl = `http://${localIp}:4000`;
const apiUrl = `http://${localIp}:4001`;
const environment = {
  ...localEnv,
  ...process.env,
  HOST: "0.0.0.0",
  WEB_ORIGIN: webUrl,
  NEXT_PUBLIC_API_URL: apiUrl,
};

console.log(`Web disponible en ${webUrl}`);
console.log(`API disponible en ${apiUrl}`);

const child = spawn("pnpm", ["--parallel", "--filter", "./apps/*", "dev"], {
  cwd: root,
  env: environment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
