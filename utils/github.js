export function toBase64(content) {
  return btoa(unescape(encodeURIComponent(content || '')));
}

export function sanitizeSegment(input) {
  return (input || 'Unknown')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function languageExtension(language) {
  const map = {
    c: 'c',
    cpp: 'cpp',
    'c++': 'cpp',
    java: 'java',
    python: 'py',
    python3: 'py',
    javascript: 'js',
    typescript: 'ts',
    go: 'go',
    rust: 'rs',
    kotlin: 'kt',
    swift: 'swift',
    php: 'php',
    ruby: 'rb',
    'c#': 'cs'
  };

  const normalized = (language || '').toLowerCase().trim();
  return map[normalized] || 'txt';
}

export async function githubRequest({ token, url, method = 'GET', body }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}
