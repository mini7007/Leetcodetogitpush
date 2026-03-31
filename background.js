import { githubRequest, languageExtension, sanitizeSegment, toBase64 } from './utils/github.js';

const KEYS = {
  token: 'githubToken',
  repo: 'githubRepo',
  autoSync: 'autoSyncEnabled',
  lastFingerprint: 'lastFingerprint',
  lastSynced: 'lastSynced'
};

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get([KEYS.autoSync]);
  if (typeof data[KEYS.autoSync] !== 'boolean') {
    await chrome.storage.local.set({ [KEYS.autoSync]: true });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'LEETCODE_ACCEPTED') return;

  syncToGitHub(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function syncToGitHub(payload) {
  const data = await chrome.storage.local.get(Object.values(KEYS));
  const token = data[KEYS.token];
  const repo = data[KEYS.repo];
  const autoSync = data[KEYS.autoSync] ?? true;

  if (!autoSync) return { skipped: true, reason: 'Auto sync disabled' };
  if (!token || !repo) throw new Error('Set GitHub token and repository in popup');

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) throw new Error('Repository must be owner/repo');

  const fingerprint = `${payload.title}::${payload.language}::${payload.url}`;
  if (data[KEYS.lastFingerprint] === fingerprint) {
    return { skipped: true, reason: 'Duplicate submission ignored' };
  }

  const difficulty = sanitizeSegment(payload.difficulty || 'Unknown');
  const title = sanitizeSegment(payload.title);
  const ext = languageExtension(payload.language);

  const basePath = `LeetCode/${difficulty}/${title}`;
  const solutionPath = `${basePath}/solution.${ext}`;
  const readmePath = `${basePath}/README.md`;

  await putFile({
    token,
    owner,
    repo: repoName,
    path: solutionPath,
    content: payload.code,
    message: `Added LeetCode solution: ${payload.title}`
  });

  const readme = `# ${payload.title}\n\n- Difficulty: ${payload.difficulty}\n- Language: ${payload.language}\n- Link: ${payload.url}\n- Synced: ${new Date(payload.timestamp).toISOString()}\n`;

  await putFile({
    token,
    owner,
    repo: repoName,
    path: readmePath,
    content: readme,
    message: `Added LeetCode solution: ${payload.title}`
  });

  await chrome.storage.local.set({
    [KEYS.lastFingerprint]: fingerprint,
    [KEYS.lastSynced]: `${payload.title} (${payload.language})`
  });

  return { synced: true, path: solutionPath };
}

async function putFile({ token, owner, repo, path, content, message }) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

  let sha;
  try {
    const existing = await githubRequest({ token, url });
    sha = existing.sha;
  } catch (error) {
    if (!error.message.includes('404')) throw error;
  }

  await githubRequest({
    token,
    url,
    method: 'PUT',
    body: {
      message,
      content: toBase64(content),
      ...(sha ? { sha } : {})
    }
  });
}
