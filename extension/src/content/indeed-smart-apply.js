/**
 * Indeed Smart Apply automation for AutoCVApply.
 * Best-effort multi-step apply flow on indeed.com job pages.
 */
let isRunning = false;
let userExplicitlyClickedStart = false;
let config = {};
let appliedCount = 0;
let skippedCount = 0;
let appliedJobs = [];

function log(msg) {
  console.log('[AutoCVApply Indeed]', msg);
  try {
    chrome.runtime.sendMessage({ type: 'log', message: msg });
  } catch (e) {}
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitFullName(fullName) {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const parts = fullName.trim().split(/\s+/);

  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

async function buildBotConfig() {
  const settings = await chrome.storage.sync.get([
    'yearsOfExperience',
    'maxYearsRequired',
    'blacklistKeywords',
    'expectedSalary',
    'visaSponsorship',
    'legallyAuthorized',
    'phoneCountryCode',
  ]);

  const profileData = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });

  const profile = profileData.profile || {};
  const { firstName, lastName } = splitFullName(profile.full_name);

  return {
    firstName,
    lastName,
    email: profile.email || profileData.user?.email || '',
    phone: profile.phone || '',
    city: profile.city || profile.location?.split(',')[0]?.trim() || '',
    yearsOfExperience: settings.yearsOfExperience || '2',
    maxYearsRequired: settings.maxYearsRequired || '3',
    blacklistKeywords: settings.blacklistKeywords || '',
    expectedSalary: settings.expectedSalary || '',
    visaSponsorship: settings.visaSponsorship || 'no',
    legallyAuthorized: settings.legallyAuthorized || 'yes',
    phoneCountryCode: settings.phoneCountryCode || '+44',
  };
}

function setInputValue(element, value) {
  if (!element || !value) {
    return false;
  }

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

function fillVisibleFields(root = document) {
  let filled = 0;
  const mappings = [
    { selectors: ['input[name="applicant.name.first"]', '#input-firstName', 'input[autocomplete="given-name"]'], value: config.firstName },
    { selectors: ['input[name="applicant.name.last"]', '#input-lastName', 'input[autocomplete="family-name"]'], value: config.lastName },
    { selectors: ['input[name="applicant.emailAddress"]', 'input[type="email"]', 'input[autocomplete="email"]'], value: config.email },
    { selectors: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]', 'input[autocomplete="tel"]'], value: config.phone },
    { selectors: ['input[name="applicant.location.city"]', 'input[autocomplete="address-level2"]'], value: config.city },
  ];

  for (const mapping of mappings) {
    for (const selector of mapping.selectors) {
      const element = root.querySelector(selector);

      if (element && !element.value && mapping.value) {
        if (setInputValue(element, mapping.value)) {
          filled += 1;
          break;
        }
      }
    }
  }

  return filled;
}

function getJobMeta() {
  const title =
    document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.textContent?.trim()
    || document.querySelector('h1.jobsearch-JobInfoHeader-title')?.textContent?.trim()
    || document.querySelector('h1')?.textContent?.trim()
    || 'Indeed job';

  const company =
    document.querySelector('[data-testid="inlineHeader-companyName"]')?.textContent?.trim()
    || document.querySelector('[data-company-name="true"]')?.textContent?.trim()
    || document.querySelector('.jobsearch-CompanyInfoWithoutHeaderImage a')?.textContent?.trim()
    || 'Unknown company';

  const description =
    document.querySelector('#jobDescriptionText')?.textContent?.trim()
    || document.querySelector('[data-testid="jobsearch-JobComponent-description"]')?.textContent?.trim()
    || '';

  return {
    title,
    company,
    link: window.location.href.split('?')[0],
    location: document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.textContent?.trim() || null,
    job_description: description.slice(0, 20000),
    source: 'indeed',
  };
}

function shouldSkipByBlacklist(title, company, description) {
  if (!config.blacklistKeywords?.trim()) {
    return false;
  }

  const haystack = `${title} ${company} ${description}`.toLowerCase();
  const keywords = config.blacklistKeywords.toLowerCase().split(',').map((k) => k.trim()).filter(Boolean);

  return keywords.some((keyword) => haystack.includes(keyword));
}

async function clickApplyButton() {
  const selectors = [
    '#indeedApplyButton',
    'button[data-testid="indeedApplyButton-test"]',
    'button[aria-label*="Apply now"]',
    'button[aria-label*="Apply on company site"]',
    'a[data-testid="applyButtonLinkContainer"] button',
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);

    if (button && !button.disabled) {
      button.click();
      await wait(1500);

      return true;
    }
  }

  return false;
}

function findContinueButton(root = document) {
  const buttons = root.querySelectorAll('button, input[type="submit"]');

  for (const button of buttons) {
    const text = (button.textContent || button.value || '').trim().toLowerCase();

    if (text.match(/continue|next|review|submit|apply/)) {
      return button;
    }
  }

  return null;
}

async function recordApplication(job) {
  appliedJobs.unshift({
    title: job.title,
    company: job.company,
    link: job.link,
    date: new Date().toISOString(),
  });
  appliedCount += 1;

  await chrome.storage.local.set({ appliedCount, appliedJobs });

  try {
    chrome.runtime.sendMessage({ type: 'updateCount', count: appliedCount });
  } catch (e) {}

  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'RECORD_APPLICATION',
          application: {
            ...job,
            applied_at: new Date().toISOString(),
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        },
      );
    });
  } catch (error) {
    log(`⚠️ Could not sync application to dashboard: ${error.message}`);
  }
}

async function runApplicationFlow() {
  const job = getJobMeta();

  if (shouldSkipByBlacklist(job.title, job.company, job.job_description || '')) {
    skippedCount += 1;
    await chrome.storage.local.set({ skippedCount });
    try {
      chrome.runtime.sendMessage({ type: 'updateSkippedCount', count: skippedCount });
    } catch (e) {}
    log(`⏭️ Skipped (blacklist): ${job.title}`);

    return;
  }

  if (!await clickApplyButton()) {
    log('⚠️ Apply button not found on this page.');

    return;
  }

  for (let step = 0; step < 8; step++) {
    if (!isRunning || !userExplicitlyClickedStart) {
      return;
    }

    await wait(1200);
    fillVisibleFields(document);

    const continueButton = findContinueButton(document);

    if (!continueButton) {
      break;
    }

    const label = (continueButton.textContent || continueButton.value || '').toLowerCase();

    if (label.includes('submit') || label.includes('apply')) {
      continueButton.click();
      await wait(2000);
      await recordApplication(job);
      log(`✅ Applied: ${job.title} @ ${job.company}`);

      return;
    }

    continueButton.click();
    await wait(1500);
  }

  log(`⚠️ Could not complete Indeed apply flow for: ${job.title}`);
}

async function mainLoop() {
  log('Indeed bot started');

  while (isRunning && userExplicitlyClickedStart) {
    await runApplicationFlow();
    break;
  }

  isRunning = false;
  userExplicitlyClickedStart = false;
  await chrome.storage.local.set({ isRunning: false, botRunning: false });

  try {
    chrome.runtime.sendMessage({ type: 'botStopped' });
  } catch (e) {}

  log('Indeed bot stopped');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === 'start') {
      config = await buildBotConfig();

      if (!config.firstName || !config.email || !config.phone) {
        sendResponse({
          success: false,
          error: 'Complete your profile (name, email, phone) on autocvapply.com before starting the bot.',
        });

        return;
      }

      const local = await chrome.storage.local.get(['appliedCount', 'skippedCount', 'appliedJobs']);
      appliedCount = local.appliedCount || 0;
      skippedCount = local.skippedCount || 0;
      appliedJobs = local.appliedJobs || [];

      isRunning = true;
      userExplicitlyClickedStart = true;
      await chrome.storage.local.set({ isRunning: true, botRunning: true });

      sendResponse({ success: true });
      try {
        chrome.runtime.sendMessage({ type: 'botStarted' });
      } catch (e) {}

      mainLoop();
    } else if (request.action === 'stop') {
      isRunning = false;
      userExplicitlyClickedStart = false;
      await chrome.storage.local.set({ isRunning: false, botRunning: false });
      sendResponse({ success: true });
      try {
        chrome.runtime.sendMessage({ type: 'botStopped' });
      } catch (e) {}
    }
  })();

  return true;
});

(async () => {
  isRunning = false;
  userExplicitlyClickedStart = false;
  await chrome.storage.local.set({ isRunning: false, botRunning: false });
})();
