import type { ChildProcessWithoutNullStreams } from "node:child_process";

let activeProcess: ChildProcessWithoutNullStreams | null = null;
let activeGeneration = 0;

export function getStreamGeneration() {
  return activeGeneration;
}

export function setActiveStreamProcess(process: ChildProcessWithoutNullStreams) {
  activeProcess = process;
}

export function clearActiveStreamProcess(process: ChildProcessWithoutNullStreams) {
  if (activeProcess === process) {
    activeProcess = null;
  }
}

export function requestStreamRefresh() {
  activeGeneration++;

  if (activeProcess && !activeProcess.killed) {
    activeProcess.kill("SIGTERM");
  }
}
