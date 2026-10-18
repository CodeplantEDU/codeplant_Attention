import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function isSetupRequest(event,contents,documentPath,platform=process.platform){
  if(!contents||event.sender!==contents)return false;
  const frame=event.senderFrame,main=contents.mainFrame;
  if(!frame||!main||!Number.isInteger(frame.routingId)||!Number.isInteger(frame.processId)||frame.routingId!==main.routingId||frame.processId!==main.processId)return false;
  try{
    const url=new URL(frame.url);
    if(url.protocol!=='file:'||url.search||url.hash)return false;
    const windows=platform==='win32',paths=windows?path.win32:path.posix;
    const actual=paths.normalize(fileURLToPath(url,{windows})),expected=paths.normalize(documentPath);
    return windows?actual.toLowerCase()===expected.toLowerCase():actual===expected;
  }catch{return false;}
}
