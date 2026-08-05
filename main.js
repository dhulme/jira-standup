const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');
const path = require('path');

const JIRA_BOARD_URL = 'https://redwoodtech.atlassian.net/jira/software/c/projects/WFM/boards/288';

const ALLOWED_HOSTNAMES = [
  'redwoodtech.atlassian.net',            // Jira board itself
  'id.atlassian.com',                     // Atlassian login
  'auth.atlassian.com',                   // Atlassian SSO auth
  'www.recaptcha.net',                    // CAPTCHA challenge during login
  'login.microsoftonline.com',            // Microsoft SSO login (used behind Atlassian SSO)
  'aadcdn.msauth.net',                    // Microsoft SSO CDN assets
  'eu-mobile.events.data.microsoft.com',  // Microsoft SSO telemetry ping
];

let mainWindow;
let leftView;
let rightView;

function isJiraOrSSOUrl(targetUrl) {
  try {
    const url = new URL(targetUrl);
    return (url.protocol === 'http:' || url.protocol === 'https:')
        && ALLOWED_HOSTNAMES.includes(url.hostname);
  } catch {
    return false;
  }
}

function routeExternalUrl(targetUrl) {
  if (isJiraOrSSOUrl(targetUrl)) {
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
  rightView.webContents.loadURL(JIRA_BOARD_URL);

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
    rightView.webContents.loadURL(`${JIRA_BOARD_URL}?assignee=unassigned`);
  }
});

// Listen for JIRA URL update requests from the standup page
ipcMain.on('update-jira-url', (event, jiraFilter) => {
  if (rightView && jiraFilter) {
    rightView.webContents.loadURL(`${JIRA_BOARD_URL}?assignee=${encodeURIComponent(jiraFilter)}`);
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
 