const fs = require('fs');
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), '.cute-pomodoro');
const statsFile = path.join(userDataPath, 'stats.json');

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

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 加载数据
const stats = loadStats();
const workRecords = stats.records.filter(r => r.type === 'work');

// 今日完成
const today = getTodayString();
const todayCount = workRecords.filter(r => r.date === today).length;
document.getElementById('todayCount').textContent = todayCount;

// 本周完成
const weekStart = getWeekStart();
const weekCount = workRecords.filter(r => r.date >= weekStart).length;
document.getElementById('weekCount').textContent = weekCount;

// 总计完成
document.getElementById('totalCount').textContent = workRecords.length;

// 总工作时长
const totalMinutes = workRecords.reduce((sum, r) => sum + (r.duration || 25), 0);
const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
document.getElementById('totalHours').textContent = totalHours + 'h';

// 最近7天图表
const last7Days = [];
const last7DaysCounts = [];

for (let i = 6; i >= 0; i--) {
  const dateStr = getDateString(i);
  last7Days.push(dateStr.substring(5)); // MM-DD
  const count = workRecords.filter(r => r.date === dateStr).length;
  last7DaysCounts.push(count);
}

const weekChartCtx = document.getElementById('weekChart').getContext('2d');
new Chart(weekChartCtx, {
  type: 'bar',
  data: {
    labels: last7Days,
    datasets: [{
      label: '完成番茄钟数',
      data: last7DaysCounts,
      backgroundColor: 'rgba(255, 107, 157, 0.6)',
      borderColor: 'rgba(255, 107, 157, 1)',
      borderWidth: 2,
      borderRadius: 8
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  }
});

// 工作时长分布图表
const durationMap = {};
workRecords.forEach(r => {
  const duration = r.duration || 25;
  durationMap[duration] = (durationMap[duration] || 0) + 1;
});

const durations = Object.keys(durationMap).sort((a, b) => a - b);
const durationCounts = durations.map(d => durationMap[d]);

const durationChartCtx = document.getElementById('durationChart').getContext('2d');
new Chart(durationChartCtx, {
  type: 'doughnut',
  data: {
    labels: durations.map(d => d + '分钟'),
    datasets: [{
      data: durationCounts,
      backgroundColor: [
        'rgba(255, 107, 157, 0.8)',
        'rgba(255, 143, 171, 0.8)',
        'rgba(255, 179, 193, 0.8)',
        'rgba(255, 211, 224, 0.8)'
      ],
      borderWidth: 2,
      borderColor: '#fff'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom'
      }
    }
  }
});
