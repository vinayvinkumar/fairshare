import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { spawnSync } from "node:child_process";

export const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function candidates() {
  const localPython = process.platform === "win32"
    ? join(appRoot, ".venv", "Scripts", "python.exe")
    : join(appRoot, ".venv", "bin", "python");
  const common = process.platform === "win32"
    ? ["python", "python3"]
    : [
        "/opt/homebrew/bin/python3.14",
        "/opt/homebrew/bin/python3.13",
        "/opt/homebrew/bin/python3.12",
        "/opt/homebrew/bin/python3.11",
        "/usr/local/bin/python3",
        "python3",
        "python",
      ];
  return unique([process.env.FAIRSHARE_PYTHON?.trim(), localPython, ...common]);
}

export function resolvePython(requiredModule = null) {
  const failures = [];
  for (const command of candidates()) {
    if (command.includes("/") && !existsSync(command)) continue;
    const statement = requiredModule
      ? `import ${requiredModule}; print(${requiredModule}.__version__)`
      : "import sys; print(sys.version.split()[0])";
    const probe = spawnSync(command, ["-c", statement], {
      cwd: appRoot,
      encoding: "utf8",
      timeout: 15_000,
    });
    if (probe.status === 0) return { command, version: probe.stdout.trim() };
    failures.push(`${command}: ${(probe.stderr || probe.error?.message || "unavailable").split("\n")[0]}`);
  }
  const dependency = requiredModule ? ` with ${requiredModule}` : "";
  throw new Error(`Could not find Python${dependency}. ${failures.join(" | ")}`);
}
