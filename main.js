const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');
const path = require('path');

const jiraHostname = 'redwoodtech.atlassian.net';

let mainWindow;
let leftView;
let rightView;

function isJiraUrl(targetUrl) {
  try {
    const url = new URL(targetUrl);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === jiraHostname;
  } catch {
    return false;
  }
}

function routeExternalUrl(targetUrl) {
  if (isJiraUrl(targetUrl)) {
    return false;
  }

  shell.openExternal(targetUrl);
  return true;
}

function handleJiraNavigation(targetUrl) {
  if (routeExternalUrl(targetUrl)) {
    return;
  }

  if (rightView && rightView.webContents.getURL() !== targetUrl) {
    rightView.webContents.loadURL(targetUrl);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load a simple HTML page with the Unassigned button
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Create left BrowserView for standup page
  leftView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.addBrowserView(leftView);
  const { height } = mainWindow.getContentBounds();
  const buttonHeight = 30; // Height for the Unassigned button
  const leftViewWidth = 200;
  leftView.setBounds({ x: 0, y: buttonHeight, width: leftViewWidth, height: height - buttonHeight });
  leftView.setAutoResize({ width: false, height: true });
  leftView.webContents.loadURL('https://dhulme.uk/standup/');

  // Listen for custom events from the standup page
  leftView.webContents.on('did-finish-load', () => {
    // Zoom out the standup panel
    leftView.webContents.setZoomFactor(0.9);
    
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
  const { width: windowWidth, height: windowHeight } = mainWindow.getContentBounds();
  rightView.setBounds({ x: leftViewWidth, y: 0, width: windowWidth - leftViewWidth, height: windowHeight });
  rightView.setAutoResize({ width: true, height: true });
  rightView.webContents.setWindowOpenHandler(({ url }) => {
    handleJiraNavigation(url);
    return { action: 'deny' };
  });
  rightView.webContents.on('will-navigate', (event, url) => {
    if (routeExternalUrl(url)) {
      event.preventDefault();
    }
  });
  rightView.webContents.loadURL('https://redwoodtech.atlassian.net/jira/software/c/projects/WFM/boards/288');

  // Handle window resize to adjust BrowserView bounds
  mainWindow.on('resize', () => {
    const { width, height } = mainWindow.getContentBounds();
    leftView.setBounds({ x: 0, y: buttonHeight, width: leftViewWidth, height: height - buttonHeight });
    rightView.setBounds({ x: leftViewWidth, y: 0, width: width - leftViewWidth, height });
  });
}

// Listen for unassigned button click from the main window
ipcMain.on('show-unassigned', () => {
  if (rightView) {
    const baseUrl = 'https://redwoodtech.atlassian.net/jira/software/c/projects/WFM/boards/288';
    const newUrl = `${baseUrl}?assignee=unassigned`;
    rightView.webContents.loadURL(newUrl);
  }
});

// Listen for JIRA URL update requests from the standup page
ipcMain.on('update-jira-url', (event, jiraFilter) => {
  if (rightView && jiraFilter) {
    console.log(`jiraFilter`, jiraFilter);
    const baseUrl = 'https://redwoodtech.atlassian.net/jira/software/c/projects/WFM/boards/288';
    const newUrl = `${baseUrl}?assignee=${encodeURIComponent(jiraFilter)}`;
    console.log(`newUrl`, newUrl);
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
