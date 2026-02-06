const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC methods to the standup webpage
contextBridge.exposeInMainWorld('electronAPI', {
  updateJiraUrl: (jiraFilter) => {
    ipcRenderer.send('update-jira-url', jiraFilter);
  }
});
