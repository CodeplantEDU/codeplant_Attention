import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [resources,dataDir]=process.argv.slice(2);
const site=process.env.ATTENTION_SITE_ROOT||path.join(resources,'site');
const {createService}=await import(pathToFileURL(path.join(site,'server.mjs')));
const service=await createService({root:site,dataDir});
service.server.on('error',e=>{process.send?.({error:e.code==='EADDRINUSE'?'port':'start'});process.exitCode=1;});
service.server.listen(process.env.ATTENTION_DESKTOP_SMOKE==='1'?0:49321,'127.0.0.1',()=>{process.send?.({ready:true,port:service.server.address().port});service.refresh().catch(()=>{});});
let closing=false;
async function close(){if(closing)return;closing=true;await service.close();process.exit();}
process.on('message',message=>{if(message==='close')close();});
process.on('disconnect',close);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,close);
