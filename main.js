const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let statsWindow;
let diaryWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 520,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createStatsWindow() {
  if (statsWindow) {
    statsWindow.focus();
    return;
  }

  statsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  statsWindow.loadFile('stats.html');

  statsWindow.on('closed', () => {
    statsWindow = null;
  });
}

function createDiaryWindow() {
  if (diaryWindow) {
    diaryWindow.focus();
    return;
  }

  diaryWindow = new BrowserWindow({
    width: 700,
    height: 500,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  diaryWindow.loadFile('diary.html');

  diaryWindow.on('closed', () => {
    diaryWindow = null;
  });
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

ipcMain.on('open-stats', () => {
  createStatsWindow();
});

ipcMain.on('open-diary', () => {
  createDiaryWindow();
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});
