const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (cb) => {
  const handler = (_e, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('hushfallDesktop', {
  isDesktop: true,
  platform: process.platform,
  info: () => ipcRenderer.invoke('library:info'),
  fetchLibrary: (mode) => ipcRenderer.invoke('library:fetch', mode),
  stopFetch: () => ipcRenderer.invoke('library:stop'),
  openFolder: () => ipcRenderer.invoke('library:openFolder'),
  chooseFolder: () => ipcRenderer.invoke('library:chooseFolder'),
  resetFolder: () => ipcRenderer.invoke('library:resetFolder'),
  onLog: listen('library:log'),
  onProgress: listen('library:progress'),
  // Updating: the app reports for itself when a newer version is ready.
  onUpdate: listen('update:staat'),
  installUpdate: () => ipcRenderer.invoke('update:installeer'),
  // Sonos: let speakers on the local network listen along
  sonos: {
    list: () => ipcRenderer.invoke('sonos:list'),
    play: (host) => ipcRenderer.invoke('sonos:play', host),
    stop: (host) => ipcRenderer.invoke('sonos:stop', host),
    status: (host) => ipcRenderer.invoke('sonos:status', host),
    volume: (host, v) => ipcRenderer.invoke('sonos:volume', host, v),
    info: () => ipcRenderer.invoke('sonos:info'),
  },
});
