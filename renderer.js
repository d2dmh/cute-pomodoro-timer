const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), '.cute-pomodoro');

if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const statsFile = path.join(userDataPath, 'stats.json');

// 状态变量
let timerInterval = null;
let remainingSeconds = 25 * 60;
let isRunning = false;
let isPaused = false;
let currentMode = 'work'; // 'work' or 'break'
let workDuration = 25;
let breakDuration = 5;

// DOM 元素
const timerDisplay = document.getElementById('timerDisplay');
const modeDisplay = document.getElementById('modeDisplay');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const workInput = document.getElementById('workDuration');
const breakInput = document.getElementById('breakDuration');
const todayCountEl = document.getElementById('todayCount');
const statsBtn = document.getElementById('statsBtn');
const diaryBtn = document.getElementById('diaryBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');

// 加载统计数据
function loadStats() {
  try {
    if (fs.existsSync(statsFile)) {
      return JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    }
  } catch (e) {
    console.error(e);
  }
  return { records: [] };
}

function saveStats(stats) {
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateTodayCount() {
  const stats = loadStats();
  const today = getTodayString();
  const count = stats.records.filter(r => r.date === today && r.type === 'work').length;
  todayCountEl.textContent = count;
}

function recordPomodoro(type, duration) {
  const stats = loadStats();
  stats.records.push({
    date: getTodayString(),
    timestamp: Date.now(),
    type: type,
    duration: duration
  });
  saveStats(stats);
  updateTodayCount();
}

// 更新显示
function updateDisplay() {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (currentMode === 'work') {
    modeDisplay.textContent = '🍅 工作时间';
  } else {
    modeDisplay.textContent = '☕ 休息时间';
  }
}

// 开始计时
function startTimer() {
  if (isRunning && !isPaused) return;

  if (!isRunning) {
    workDuration = parseInt(workInput.value) || 25;
    breakDuration = parseInt(breakInput.value) || 5;
    remainingSeconds = currentMode === 'work' ? workDuration * 60 : breakDuration * 60;
  }

  isRunning = true;
  isPaused = false;
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  workInput.disabled = true;
  breakInput.disabled = true;

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateDisplay();

    if (remainingSeconds <= 0) {
      handleTimerComplete();
    }
  }, 1000);
}

// 暂停
function pauseTimer() {
  if (!isRunning) return;

  if (isPaused) {
    // 继续
    isPaused = false;
    pauseBtn.textContent = '暂停';
    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateDisplay();
      if (remainingSeconds <= 0) {
        handleTimerComplete();
      }
    }, 1000);
  } else {
    // 暂停
    isPaused = true;
    pauseBtn.textContent = '继续';
    clearInterval(timerInterval);
  }
}

// 重置
function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  isPaused = false;
  currentMode = 'work';
  workDuration = parseInt(workInput.value) || 25;
  remainingSeconds = workDuration * 60;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = '暂停';
  workInput.disabled = false;
  breakInput.disabled = false;
  updateDisplay();
}

// 计时完成
function handleTimerComplete() {
  clearInterval(timerInterval);

  // 记录
  if (currentMode === 'work') {
    recordPomodoro('work', workDuration);
  } else {
    recordPomodoro('break', breakDuration);
  }

  // 播放提示音
  playNotificationSound();

  // 切换模式
  if (currentMode === 'work') {
    currentMode = 'break';
    remainingSeconds = breakDuration * 60;
    showNotification('🎉 工作完成！', '休息一下吧～');
  } else {
    currentMode = 'work';
    remainingSeconds = workDuration * 60;
    showNotification('💪 休息结束！', '继续努力工作吧～');
  }

  updateDisplay();

  // 自动开始下一阶段
  isRunning = false;
  startTimer();
}

// 通知
function showNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    });
  }
}

// 播放提示音
function playNotificationSound() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 1);
}

// 事件监听
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

workInput.addEventListener('change', () => {
  if (!isRunning && currentMode === 'work') {
    workDuration = parseInt(workInput.value) || 25;
    remainingSeconds = workDuration * 60;
    updateDisplay();
  }
});

breakInput.addEventListener('change', () => {
  if (!isRunning && currentMode === 'break') {
    breakDuration = parseInt(breakInput.value) || 5;
    remainingSeconds = breakDuration * 60;
    updateDisplay();
  }
});

statsBtn.addEventListener('click', () => {
  ipcRenderer.send('open-stats');
});

diaryBtn.addEventListener('click', () => {
  ipcRenderer.send('open-diary');
});

minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// 初始化
updateDisplay();
updateTodayCount();

// 请求通知权限
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
