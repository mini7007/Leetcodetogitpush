const DEBOUNCE_MS = 1500;
const POLL_MS = 2500;
const EXTRACTION_RETRY_MS = 1200;
const MAX_RETRIES = 3;

let observer;
let debounceTimer;
let pollTimer;
let lastSentFingerprint = null;
let lastUrl = window.location.href;

start();

function start() {
  console.log('Observer started');
  startObserver();
  startPolling();
  watchNavigation();
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    debounceCheck();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => debounceCheck(), POLL_MS);
}

function watchNavigation() {
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      lastSentFingerprint = null;
    }
  }, 700);
}

function debounceCheck() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkAcceptedAndSync, DEBOUNCE_MS);
}

function checkAcceptedAndSync() {
  const panel = detectResultPanel();
  if (!panel || !isVisible(panel)) return;

  const accepted = isAcceptedState(panel);
  if (!accepted) return;

  console.log('Accepted detected');
  extractAndSend(0);
}

function detectResultPanel() {
  const selectors = [
    '[data-e2e-locator*="submission"]',
    '[data-e2e-locator*="result"]',
    '[class*="submission-result"]',
    '[class*="result-state"]',
    '[class*="success"]',
    '[role="dialog"]',
    '[aria-label*="result" i]'
  ];

  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      const text = (node.textContent || '').trim();
      if (/Accepted/i.test(text) || /testcases\s*passed/i.test(text)) {
        return node;
      }
    }
  }

  const acceptedNode = Array.from(document.querySelectorAll('div,span,h3')).find((el) =>
    /^Accepted$/i.test((el.textContent || '').trim())
  );

  return acceptedNode?.closest('div,section,article,[role="dialog"]') || null;
}

function isAcceptedState(panel) {
  const text = (panel.textContent || '').replace(/\s+/g, ' ');
  const acceptedText = /\bAccepted\b/i.test(text);
  const allPassed =
    /All\s*test\s*cases\s*passed/i.test(text) ||
    /\b\d+\s*\/\s*\d+\s*testcases\s*passed\b/i.test(text);
  const successClass =
    panel.matches('[class*="success" i], [class*="result-state__success" i]') ||
    !!panel.querySelector('[class*="success" i], [class*="result-state__success" i]');

  return acceptedText && allPassed && (successClass || acceptedText);
}

function extractAndSend(retry) {
  console.log('Extracting data');

  const payload = extractData();
  if (!payload || !payload.code) {
    if (retry < MAX_RETRIES) {
      setTimeout(() => extractAndSend(retry + 1), EXTRACTION_RETRY_MS);
    }
    return;
  }

  const fingerprint = `${payload.title}::${payload.language}::${payload.url}`;
  if (fingerprint === lastSentFingerprint) return;
  lastSentFingerprint = fingerprint;

  console.log('Sending to GitHub');
  chrome.runtime.sendMessage({ type: 'LEETCODE_ACCEPTED', payload });
}

function extractData() {
  const title = extractTitle();
  const difficulty = extractDifficulty();
  const code = extractCode();
  const language = extractLanguage();

  if (!title) return null;

  return {
    title,
    difficulty,
    code,
    language,
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
}

function extractTitle() {
  const selectors = ['[data-cy="question-title"]', 'h1 a', 'h1'];
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) return text.replace(/^\d+\.\s*/, '');
  }
  return null;
}

function extractDifficulty() {
  const values = ['Easy', 'Medium', 'Hard'];
  const nodes = Array.from(document.querySelectorAll('span,div'));
  for (const node of nodes) {
    const text = (node.textContent || '').trim();
    if (values.includes(text)) return text;
  }
  return 'Unknown';
}

function extractCode() {
  const selectors = [
    '.monaco-editor .view-lines',
    '.view-lines',
    '[class*="monaco"] [class*="view-lines"]',
    'pre code',
    '[class*="submission"] pre'
  ];

  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      const code = (node.innerText || node.textContent || '').trim();
      if (code.length > 10) return code;
    }
  }

  return null;
}

function extractLanguage() {
  const selectors = [
    '[data-e2e-locator="lang-select"]',
    'button[id*="headlessui-listbox-button"]',
    '[class*="lang" i]'
  ];

  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text && text.length <= 30) return text;
  }

  return 'txt';
}

function isVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
