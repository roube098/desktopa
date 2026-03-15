const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("excelorDesktop", {
  bootstrap: () => ipcRenderer.invoke("excelor-bootstrap"),
  runTurn: (input) => ipcRenderer.invoke("excelor-run-turn", input),
  listSubagents: () => ipcRenderer.invoke("excelor-list-subagents"),
  close: () => ipcRenderer.send("excelor-close"),
  onSnapshot: (callback) => {
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("excelor-snapshot", handler);
    return () => ipcRenderer.removeListener("excelor-snapshot", handler);
  },
});
