import { spawn } from "node:child_process";
import process from "node:process";
import { appRoot, resolveFairShareRuntime } from "./python-runtime.mjs";

let runtime;
try {
  runtime = resolveFairShareRuntime();
} catch (error) {
  console.error(error.message);
  console.error("Create apps/fairshare/.venv, then run `uv pip install --python .venv/bin/python -r requirements.txt`.");
  process.exit(1);
}

console.log(`FairShare runtime: ${runtime.command} (Streamlit ${runtime.version})`);
const child = spawn(
  runtime.command,
  [
    "-m",
    "streamlit",
    "run",
    "app.py",
    "--server.port=5181",
    "--server.address=127.0.0.1",
    "--server.headless=true",
    "--server.fileWatcherType=none",
    "--browser.gatherUsageStats=false",
  ],
  { cwd: appRoot, env: process.env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.once("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
