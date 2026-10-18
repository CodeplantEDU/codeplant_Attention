const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('attention',{
  status:()=>ipcRenderer.invoke('attention:status'),
  install:providers=>ipcRenderer.invoke('attention:install',providers),
  open:()=>ipcRenderer.invoke('attention:open'),
  onProgress:callback=>ipcRenderer.on('attention:progress',(_event,text)=>callback(text))
});
