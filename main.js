const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let leftView;
let rightView;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Create left BrowserView for standup page
  leftView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.addBrowserView(leftView);
  leftView.setBounds({ x: 0, y: 0, width: 200, height: 900 });
  leftView.setAutoResize({ width: false, height: true });
  leftView.webContents.loadURL('https://dhulme.uk/standup/');

  // Listen for custom events from the standup page
  leftView.webContents.on('did-finish-load', () => {
    leftView.webContents.executeJavaScript(`
      window.addEventListener('update-jira-id', (e) => {
        if (e.detail && e.detail.jiraId) {
          window.electronAPI.updateJiraUrl(e.detail.jiraId);
        }
      });
    `);
  });

  // Create right BrowserView for JIRA board
  rightView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.addBrowserView(rightView);
  rightView.setBounds({ x: 200, y: 0, width: 1200, height: 900 });
  rightView.setAutoResize({ width: true, height: true });
  rightView.webContents.loadURL('https://redwoodtech.atlassian.net/jira/software/c/projects/WFM/boards/288');

  // Handle window resize to adjust BrowserView bounds
  mainWindow.on('resize', () => {
    const { width, height } = mainWindow.getBounds();
    leftView.setBounds({ x: 0, y: 0, width: 200, height });
    rightView.setBounds({ x: 200, y: 0, width: width - 200, height });
  });
}

// Listen for JIRA URL update requests from the standup page
ipcMain.on('update-jira-url', (event, jiraFilter) => {
  if (rightView && jiraFilter) {
    const baseUrl = 'https://redwoodtech.atlassian.net/jira/software/c/projects/WFM/boards/288';
    const newUrl = `${baseUrl}?assignee=${encodeURIComponent(jiraFilter)}`;
    rightView.webContents.loadURL(newUrl);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
