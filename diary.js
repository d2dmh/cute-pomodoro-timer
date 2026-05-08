const fs = require('fs');
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), '.cute-pomodoro');

if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const diaryFile = path.join(userDataPath, 'diary.json');

function loadDiary() {
  try {
    if (fs.existsSync(diaryFile)) {
      return JSON.parse(fs.readFileSync(diaryFile, 'utf-8'));
    }
  } catch (e) {
    console.error(e);
  }
  return { entries: [] };
}

function saveDiary(diary) {
  fs.writeFileSync(diaryFile, JSON.stringify(diary, null, 2));
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

const input = document.getElementById('diaryInput');
const saveBtn = document.getElementById('saveBtn');
const entriesDiv = document.getElementById('entries');
const charCount = document.getElementById('charCount');

function renderEntries() {
  const diary = loadDiary();
  const sorted = [...diary.entries].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    entriesDiv.innerHTML = `
      <div class="empty-state">
        <div class="emoji">✨</div>
        <div>还没有日记，写下第一篇吧～</div>
      </div>
    `;
    return;
  }

  entriesDiv.innerHTML = sorted.map(entry => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-date">📅 ${formatDate(entry.timestamp)}</span>
        <button class="btn btn-danger" onclick="deleteEntry(${entry.timestamp})">删除</button>
      </div>
      <div class="entry-content">${escapeHtml(entry.content)}</div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function deleteEntry(timestamp) {
  if (!confirm('确定要删除这条日记吗？')) return;
  const diary = loadDiary();
  diary.entries = diary.entries.filter(e => e.timestamp !== timestamp);
  saveDiary(diary);
  renderEntries();
}

window.deleteEntry = deleteEntry;

saveBtn.addEventListener('click', () => {
  const content = input.value.trim();
  if (!content) {
    alert('请输入内容');
    return;
  }

  const diary = loadDiary();
  diary.entries.push({
    timestamp: Date.now(),
    content: content
  });
  saveDiary(diary);
  input.value = '';
  charCount.textContent = '0 字';
  renderEntries();
});

input.addEventListener('input', () => {
  charCount.textContent = input.value.length + ' 字';
});

// Ctrl+Enter 快捷保存
input.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    saveBtn.click();
  }
});

renderEntries();
