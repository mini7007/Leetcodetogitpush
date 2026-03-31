const DEBOUNCE_MS = 1500;
const POLL_MS = 2500;
const EXTRACTION_RETRY_MS = 1000;
const MAX_RETRIES = 4;

let observer = null;
let debounceTimer = null;
let pollTimer = null;
let navTimer = null;
let lastUrl = window.location.href;
let lastSyncedProblemKey = null;

init();

function init() {
  console.log('Observer started');
  startObserver();
  startPolling();
  watchNavigation();
  scheduleCheck('init');
}

/**
 * Problem page flow: react to dynamic UI updates (submit popup/result panel).
 */
function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    console.log('Mutation detected');
    scheduleCheck('mutation');
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true
  });
}

/**
 * Submission page flow: static DOM after redirect, so polling is required.
 */
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(() => {
    console.log('Polling...');
    scheduleCheck('polling');
  }, POLL_MS);
}

/**
 * Handle SPA navigation and reset page-specific state.
 */
function watchNavigation() {
  if (navTimer) clearInterval(navTimer);

  navTimer = setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      scheduleCheck('navigation');
    }
  }, 700);
}

function scheduleCheck(source) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => checkAcceptedAndSync(source), DEBOUNCE_MS);
}

function checkAcceptedAndSync(source) {
  const result = detectAcceptedResult();
  if (!result.accepted || !result.allPassed) return;

  console.log('Accepted detected');
  extractAndSend(0, source);
}

/**
 * Core detection logic.
 * - Primary: [data-e2e-locator="submission-result"]
 * - Fallback: body text contains Accepted + all tests passed
 */
function detectAcceptedResult() {
  const resultNode = document.querySelector('[data-e2e-locator="submission-result"]');
  const resultText = normalizeText(resultNode?.textContent || '');
  const bodyText = normalizeText(document.body?.innerText || '');

  const acceptedFromSelector = /\baccepted\b/i.test(resultText);
  const allPassedFromSelector =
    /all\s*test\s*cases\s*passed/i.test(resultText) ||
    /\b(\d+)\s*\/\s*\1\s*testcases\s*passed\b/i.test(resultText);

  const acceptedFromBody = document.body?.innerText.includes('Accepted') || /\baccepted\b/i.test(bodyText);
  const allPassedFromBody =
    /all\s*test\s*cases\s*passed/i.test(bodyText) ||
    /\b(\d+)\s*\/\s*\1\s*testcases\s*passed\b/i.test(bodyText);

  return {
    accepted: acceptedFromSelector || acceptedFromBody,
    allPassed: allPassedFromSelector || allPassedFromBody
  };
}

function extractAndSend(retryCount, source) {
  const payload = extractSubmissionData();

  if (!payload || !payload.code) {
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => extractAndSend(retryCount + 1, source), EXTRACTION_RETRY_MS);
    }
    return;
  }

  const problemKey = getProblemKey(payload);
  if (!problemKey) return;

  if (problemKey === lastSyncedProblemKey) {
    return;
  }

  lastSyncedProblemKey = problemKey;

  console.log('Sending to GitHub');
  chrome.runtime.sendMessage({
    type: 'LEETCODE_ACCEPTED',
    payload: {
      ...payload,
      detectionSource: source
    }
  });
}

function getProblemKey(payload) {
  if (!payload?.title) return null;

  const normalizedTitle = payload.title.toLowerCase().replace(/\s+/g, '-');
  const normalizedLanguage = (payload.language || 'txt').toLowerCase();
  return `${normalizedTitle}::${normalizedLanguage}`;
}

function extractSubmissionData() {
  const title = extractProblemTitle();
  if (!title) return null;

  return {
    title,
    difficulty: extractDifficulty(),
    code: extractCodeFromMonaco(),
    language: extractLanguage(),
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
}

function extractProblemTitle() {
  const selectors = [
    '[data-cy="question-title"]',
    'div.text-title-large a',
    'h1 a',
    'h1'
  ];

  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) {
      return text.replace(/^\d+\.\s*/, '');
    }
  }

  // Submission pages often still include the problem title in the tab title.
  const fromDocumentTitle = document.title.match(/^(.*?)\s*-\s*LeetCode/i)?.[1]?.trim();
  if (fromDocumentTitle) return fromDocumentTitle;

  return null;
}

function extractDifficulty() {
  const allowed = new Set(['Easy', 'Medium', 'Hard']);
  const nodes = document.querySelectorAll('span,div');

  for (const node of nodes) {
    const text = (node.textContent || '').trim();
    if (allowed.has(text)) return text;
  }

  return 'Unknown';
}

/**
 * Required extraction strategy:
 * - Read Monaco lines via querySelectorAll('.view-line')
 * - Join as full source code
 */
function extractCodeFromMonaco() {
  const lineNodes = document.querySelectorAll('.view-line');
  if (lineNodes.length > 0) {
    const lines = Array.from(lineNodes).map((line) => line.textContent || '');
    const code = lines.join('\n').trim();
    if (code.length > 0) return code;
  }

  // Fallback for rare rendering states.
  const fallback = document.querySelector('.monaco-editor')?.textContent?.trim();
  return fallback || null;
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

function normalizeText(input) {
  return (input || '').replace(/\s+/g, ' ').trim();
}
