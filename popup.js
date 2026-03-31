const KEYS = {
  token: 'githubToken',
  repo: 'githubRepo',
  autoSync: 'autoSyncEnabled',
  lastSynced: 'lastSynced'
};

const tokenEl = document.getElementById('token');
const repoEl = document.getElementById('repo');
const autoSyncEl = document.getElementById('autoSync');
const saveBtn = document.getElementById('saveBtn');
const lastSyncedEl = document.getElementById('lastSynced');

init();

async function init() {
  const data = await chrome.storage.local.get(Object.values(KEYS));
  tokenEl.value = data[KEYS.token] || '';
  repoEl.value = data[KEYS.repo] || '';
  autoSyncEl.checked = data[KEYS.autoSync] ?? true;
  lastSyncedEl.textContent = `Last synced: ${data[KEYS.lastSynced] || 'None'}`;
}

saveBtn.addEventListener('click', async () => {
  const token = tokenEl.value.trim();
  const repo = repoEl.value.trim();
  const autoSync = autoSyncEl.checked;

  if (repo && !repo.includes('/')) {
    alert('Repository format must be owner/repo');
    return;
  }

  await chrome.storage.local.set({
    [KEYS.token]: token,
    [KEYS.repo]: repo,
    [KEYS.autoSync]: autoSync
  });

  saveBtn.textContent = 'Saved';
  setTimeout(() => (saveBtn.textContent = 'Save'), 900);
});
