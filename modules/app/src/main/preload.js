const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ipc', {
  promptYGOPROPathSelect: ()   => ipcRenderer.invoke('select-ygopro-path'),
  queryCardInfo:     code => ipcRenderer.invoke('query-card-info',        code),
  queryCardInfoSync: code => ipcRenderer.sendSync('query-card-info-sync', code),
  randomAvatarCard:  tags => ipcRenderer.invoke('random-avatar-card',     tags),
  startYGOPRO:       args => ipcRenderer.invoke('start-ygopro',           args),
  writeClipboard:    text => ipcRenderer.invoke('write-clipboard',        text),
  database:          ()   => ipcRenderer.invoke('database')
})
