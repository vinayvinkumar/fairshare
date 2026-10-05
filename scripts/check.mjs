import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { appRoot, resolvePython } from "./python-runtime.mjs";

let runtime;
try {
  runtime = resolvePython();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const checks = [
  ["-m", "compileall", "-q", "app.py", "fairshare", "tests"],
  ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"],
];
const checkEnvironment = {
  ...process.env,
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONPYCACHEPREFIX: join(tmpdir(), "fairshare-pycache"),
};

for (const argumentsList of checks) {
  const result = spawnSync(runtime.command, argumentsList, { cwd: appRoot, env: checkEnvironment, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
