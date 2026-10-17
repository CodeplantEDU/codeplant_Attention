import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function pythonExecutable(){
  const candidates=[process.env.DIALOGUE_PYTHON,
    path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),
    path.join(os.homedir(),'AppData/Local/Programs/Python/Python312/python.exe')].filter(Boolean);
  return candidates.find(p=>existsSync(p))||'python';
}
