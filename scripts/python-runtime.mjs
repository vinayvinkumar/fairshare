import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { spawnSync } from "node:child_process";

export const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const localEnvironment = join(appRoot, ".venv");
const localPython = process.platform === "win32"
  ? join(localEnvironment, "Scripts", "python.exe")
  : join(localEnvironment, "bin", "python");
const pythonRequirementProbe = [
  "import sys",
  "assert sys.version_info >= (3, 12), f'Python 3.12 or newer is required; found {sys.version.split()[0]}'",
];
const defaultProbe = [
  ...pythonRequirementProbe,
  "print(sys.version.split()[0])",
].join("; ");
const fairShareProbe = [
  ...pythonRequirementProbe,
  "import streamlit",
  "from streamlit.components import v2",
  "print(streamlit.__version__)",
].join("; ");

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function candidates() {
  const configuredPython = process.env.FAIRSHARE_PYTHON?.trim();
  if (configuredPython) return [{ command: configuredPython, timeout: 120_000 }];
  if (existsSync(localEnvironment)) return [{ command: localPython, timeout: 120_000 }];

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
  return unique(common).map((command) => ({ command, timeout: 30_000 }));
}

function failureMessage(probe, timeout) {
  if (probe.error?.code === "ETIMEDOUT") return `timed out after ${timeout / 1_000}s`;
  const details = (probe.stderr || probe.error?.message || "unavailable")
    .trim()
    .split("\n")
    .filter(Boolean);
  return details.at(-1) ?? "unavailable";
}

export function resolvePython(options = {}) {
  const normalizedOptions = typeof options === "string" ? { requiredModule: options } : options;
  const requiredModule = normalizedOptions.requiredModule ?? null;
  const statement = normalizedOptions.validationStatement
    ?? (requiredModule
      ? [...pythonRequirementProbe, `import ${requiredModule}`, `print(${requiredModule}.__version__)`].join("; ")
      : defaultProbe);
  const requirement = normalizedOptions.requirement
    ?? (requiredModule ? `Python 3.12 or newer with ${requiredModule}` : "Python 3.12 or newer");
  const failures = [];
  for (const { command, timeout } of candidates()) {
    const probe = spawnSync(command, ["-c", statement], {
      cwd: appRoot,
      encoding: "utf8",
      timeout,
    });
    if (probe.status === 0) return { command, version: probe.stdout.trim() };
    failures.push(`${command}: ${failureMessage(probe, timeout)}`);
  }
  throw new Error(`Could not find ${requirement}. ${failures.join(" | ")}`);
}

export function resolveFairShareRuntime() {
  return resolvePython({
    validationStatement: fairShareProbe,
    requirement: "Python 3.12 or newer with Streamlit Components v2",
  });
}
