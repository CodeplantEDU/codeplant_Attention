const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('attention',{
  status:()=>ipcRenderer.invoke('attention:status'),
  install:providers=>ipcRenderer.invoke('attention:install',providers),
  open:()=>ipcRenderer.invoke('attention:open'),
  auth:(action,provider)=>ipcRenderer.invoke('attention:auth',action,provider),
  loginBrowser:provider=>ipcRenderer.invoke('attention:login-browser',provider),
  onProgress:callback=>ipcRenderer.on('attention:progress',(_event,text)=>callback(text))
});
