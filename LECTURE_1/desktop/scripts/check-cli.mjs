import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installProvider,backendEnvironment,providerPaths,runtimePaths} from '../runtime.mjs';
import {existsSync} from 'node:fs';
const resources=fileURLToPath(new URL('..',import.meta.url));
const base=path.join(resources,'build','cli-check');await mkdir(base,{recursive:true});
const execute=promisify(execFile);
for(const provider of ['codex','claude','gemini']){
  await installProvider(resources,base,provider);
  const binary=providerPaths(base,provider).find(existsSync),env=backendEnvironment(resources,base);
  const exe=provider==='gemini'?runtimePaths(resources).node:binary,args=provider==='gemini'?[binary,'--version']:['--version'];
  const result=await execute(exe,args,{env,windowsHide:true,encoding:'utf8',timeout:60000});
  if(!result.stdout.trim())throw Error(`${provider} returned no version`);
  console.log(`${provider} install + launch: ${result.stdout.trim().slice(0,100)}`);
}
