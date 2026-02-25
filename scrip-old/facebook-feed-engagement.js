const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== DEBUG MODE - Set to true to see internal debug logs =====
const DEBUG_MODE = false;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => { };

// ===== USER LOG - Always shown to user in UI =====
const userLog = (message) => console.log(message);

// ===== SPIN TEXT FUNCTION =====
/**
 * Spin text function - randomly selects one option from {{option1|option2|option3}}
 * Format: {{text1|text2|text3}}
 * @param {string} text - Text with spin syntax
 * @returns {string} - Text with spun content
 */
function spinText(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    const spinPattern = /\{\{([^}]+)\}\}/g;

    return text.replace(spinPattern, (match, options) => {
        const optionList = options.split('|').map(opt => opt.trim());
        const validOptions = optionList.filter(opt => opt.length > 0);

        if (validOptions.length === 0) {
            return match;
        }

        const timestamp = Date.now();
        const hrtime = process.hrtime.bigint().toString(10);
        const randomSource = (timestamp + parseInt(hrtime.slice(-8)) + Math.random() * 1000000) % 1000000;
        const randomIndex = Math.floor(randomSource % validOptions.length);

        debugLog(`🎲 [SPIN] Options: ${validOptions.length}, Index: ${randomIndex}, Selected: "${validOptions[randomIndex]}"`);

        return validOptions[randomIndex];
    });
}

// ===== HUMAN-LIKE TYPING FUNCTION =====
/**
 * Types text character by character with random delays like a human
 * @param {Page} page - Playwright page object
 * @param {string} text - Text to type
 * @param {number} minDelay - Minimum delay between keystrokes (ms)
 * @param {number} maxDelay - Maximum delay between keystrokes (ms)
 */
async function humanLikeType(page, text, minDelay = 50, maxDelay = 150) {
    for (const char of text) {
        await page.keyboard.type(char);
        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        await page.waitForTimeout(delay);

        // Occasionally pause longer (like thinking)
        if (Math.random() < 0.05) {
            await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
        }
    }
}

// ===== HUMAN-LIKE MOUSE MOVEMENT =====
/**
 * Moves mouse in a natural curve before clicking
 * @param {Page} page - Playwright page object
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 */
async function humanLikeMouseMove(page, targetX, targetY) {
    // Get current viewport size
    const viewport = page.viewportSize() || { width: 1920, height: 1080 };

    // Start from a random position
    const startX = Math.floor(Math.random() * viewport.width);
    const startY = Math.floor(Math.random() * viewport.height);

    // Move to starting position
    await page.mouse.move(startX, startY);

    // Move in steps towards target with slight randomness
    const steps = Math.floor(Math.random() * 5) + 3;
    for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const currentX = startX + (targetX - startX) * progress + (Math.random() - 0.5) * 20;
        const currentY = startY + (targetY - startY) * progress + (Math.random() - 0.5) * 20;
        await page.mouse.move(currentX, currentY);
        await page.waitForTimeout(Math.floor(Math.random() * 50) + 20);
    }

    // Final move to exact target
    await page.mouse.move(targetX, targetY);
    await page.waitForTimeout(Math.floor(Math.random() * 100) + 50);
}

// ===== RANDOM HUMAN ACTIONS =====
/**
 * Performs random human-like actions to appear more natural
 * @param {Page} page - Playwright page object
 */
async function randomHumanActions(page) {
    const actions = [
        async () => {
            // Random scroll up/down a bit
            const scrollAmount = Math.floor(Math.random() * 200) - 100;
            await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
        },
        async () => {
            // Move mouse to random position
            const viewport = page.viewportSize() || { width: 1920, height: 1080 };
            const x = Math.floor(Math.random() * viewport.width);
            const y = Math.floor(Math.random() * viewport.height);
            await page.mouse.move(x, y);
        },
        async () => {
            // Just wait a bit
            await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
        }
    ];

    // Execute 1-3 random actions
    const numActions = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numActions; i++) {
        const action = actions[Math.floor(Math.random() * actions.length)];
        await action();
        await page.waitForTimeout(Math.floor(Math.random() * 300) + 100);
    }
}

// Debug: Show Node version and current directory
debugLog(`🔧 Node version: ${process.version}`);
debugLog(`📂 Current directory: ${__dirname}`);

// Function to get browser executable path for dynamically installed browsers
async function getBrowserExecutablePath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    debugLog(`🔍 getBrowserExecutablePath() called`);
    debugLog(`🔍 PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'not set'}`);

    const customBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (customBrowsersPath && customBrowsersPath !== '0') {
        debugLog(`🔍 Checking custom browsers path: ${customBrowsersPath}`);

        if (fs.existsSync(customBrowsersPath)) {
            try {
                const files = fs.readdirSync(customBrowsersPath);
                const chromiumFolder = files.find(f => f.startsWith('chromium-') && !f.includes('headless'));

                if (chromiumFolder) {
                    let execPath;
                    if (isWindows) {
                        execPath = path.join(customBrowsersPath, chromiumFolder, 'chrome-win64', 'chrome.exe');
                        if (!fs.existsSync(execPath)) {
                            execPath = path.join(customBrowsersPath, chromiumFolder, 'chrome-win', 'chrome.exe');
                        }
                    } else if (isMac) {
                        execPath = path.join(customBrowsersPath, chromiumFolder, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
                    } else {
                        execPath = path.join(customBrowsersPath, chromiumFolder, 'chrome-linux', 'chrome');
                    }

                    if (fs.existsSync(execPath)) {
                        debugLog(`🌐 Using custom browser: ${execPath}`);
                        return execPath;
                    }
                }
            } catch (e) {
                debugLog(`⚠️ Error reading custom browsers path: ${e.message}`);
            }
        }
    }

    // Try Playwright's built-in detection (use already imported chromium)
    try {
        // Use the chromium variable already imported at the top of the file
        const executablePath = chromium.executablePath();

        if (fs.existsSync(executablePath)) {
            debugLog(`🌐 Using Playwright browser: ${executablePath}`);
            return executablePath;
        }
    } catch (error) {
        debugLog(`🌐 Playwright browser not found: ${error.message}`);
    }

    const possiblePaths = [];

    if (isWindows) {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        possiblePaths.push(
            path.join(localAppData, 'ms-playwright'),
            path.join(__dirname, 'node_modules', 'playwright-core', '.local-browsers'),
            path.join(__dirname, 'node_modules', 'playwright', '.local-browsers')
        );
    } else if (isMac) {
        possiblePaths.push(
            path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
            path.join(__dirname, 'node_modules', 'playwright-core', '.local-browsers'),
            path.join(__dirname, 'node_modules', 'playwright', '.local-browsers')
        );
    } else {
        possiblePaths.push(
            path.join(os.homedir(), '.cache', 'ms-playwright'),
            path.join(__dirname, 'node_modules', 'playwright-core', '.local-browsers'),
            path.join(__dirname, 'node_modules', 'playwright', '.local-browsers')
        );
    }

    debugLog(`🔍 Checking fallback paths: ${possiblePaths.join(', ')}`);

    for (const basePath of possiblePaths) {
        debugLog(`🔍 Checking: ${basePath} - exists: ${fs.existsSync(basePath)}`);
        if (fs.existsSync(basePath)) {
            try {
                const files = fs.readdirSync(basePath);
                const chromiumFolder = files.find(f => f.startsWith('chromium-') && !f.includes('headless'));
                debugLog(`🔍 Found chromium folder: ${chromiumFolder || 'none'}`);

                if (chromiumFolder) {
                    let execPath;
                    if (isWindows) {
                        execPath = path.join(basePath, chromiumFolder, 'chrome-win64', 'chrome.exe');
                        if (!fs.existsSync(execPath)) {
                            execPath = path.join(basePath, chromiumFolder, 'chrome-win', 'chrome.exe');
                        }
                    } else if (isMac) {
                        execPath = path.join(basePath, chromiumFolder, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
                    } else {
                        execPath = path.join(basePath, chromiumFolder, 'chrome-linux', 'chrome');
                    }

                    debugLog(`🔍 Checking executable: ${execPath} - exists: ${fs.existsSync(execPath)}`);
                    if (fs.existsSync(execPath)) {
                        debugLog(`🌐 Using fallback browser: ${execPath}`);
                        return execPath;
                    }
                }
            } catch (e) {
                debugLog(`⚠️ Error checking path ${basePath}: ${e.message}`);
            }
        }
    }

    debugLog(`⚠️ No browser found in any location, Playwright will try default detection`);
    return undefined;
}

// Get session directory from environment variable
const ACCOUNT_SESSION_DIR = process.env.ACCOUNT_SESSION_DIR ||
    path.join(__dirname, 'sessions');
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || 'Default Account';

debugLog(`👤 Account: ${ACCOUNT_NAME} (${ACCOUNT_ID})`);
debugLog(`📁 Session: ${ACCOUNT_SESSION_DIR}`);

// Clean up Chrome lock files that can prevent browser from starting
async function cleanupChromeLocks(userDataDir) {
    debugLog(`🔒 [${ACCOUNT_ID}] Checking Chrome locks in: ${userDataDir}`);

    if (!fs.existsSync(userDataDir)) {
        debugLog(`✅ [${ACCOUNT_ID}] No lock files found (directory doesn't exist)`);
        return;
    }

    const lockFiles = [
        'lockfile',
        'SingletonLock',
        'SingletonCookie',
        'SingletonSocket',
        'SingletonTracker',
        'chrome.lock',
        'user-data-dir.lock'
    ];

    let removedCount = 0;

    for (const lockFile of lockFiles) {
        const lockPath = path.join(userDataDir, lockFile);

        if (fs.existsSync(lockPath)) {
            try {
                fs.unlinkSync(lockPath);
                debugLog(`🗑️ [${ACCOUNT_ID}] Removed lock file: ${lockFile}`);
                removedCount++;
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not remove ${lockFile}: ${e.message}`);
            }
        }
    }

    const defaultProfileDir = path.join(userDataDir, 'Default');
    if (fs.existsSync(defaultProfileDir)) {
        for (const lockFile of lockFiles) {
            const lockPath = path.join(defaultProfileDir, lockFile);

            if (fs.existsSync(lockPath)) {
                try {
                    fs.unlinkSync(lockPath);
                    debugLog(`🗑️ [${ACCOUNT_ID}] Removed lock file from Default/: ${lockFile}`);
                    removedCount++;
                } catch (e) {
                    debugLog(`⚠️ [${ACCOUNT_ID}] Could not remove Default/${lockFile}: ${e.message}`);
                }
            }
        }
    }

    if (removedCount > 0) {
        debugLog(`✅ [${ACCOUNT_ID}] Removed ${removedCount} lock file(s)`);
    } else {
        debugLog(`✅ [${ACCOUNT_ID}] No lock files found`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
}

// Global flag to prevent duplicate processes
let isProcessRunning = false;
let isCancelled = false;

// Track processed posts to avoid duplicates
const processedPostIds = new Set();

async function runFeedEngagement() {
    let engagementData = '';

    process.stdin.on('data', (chunk) => {
        const data = chunk.toString();
        debugLog(`📥 [${ACCOUNT_ID}] Received data: ${data.substring(0, 100)}...`);

        try {
            const parsed = JSON.parse(data);

            if (parsed.action === 'login-confirmation') {
                userLog(`✅ [${ACCOUNT_ID}] Login confirmation: ${parsed.confirmed ? 'CONTINUE' : 'CANCEL'}`);

                if (parsed.confirmed) {
                    process.nextTick(async () => {
                        try {
                            if (global.engagementData) {
                                await continueAfterLogin(global.engagementData);
                            } else {
                                console.error(`❌ [${ACCOUNT_ID}] No engagementData found`);
                                process.exit(1);
                            }
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error continuing: ${error.message}`);
                            process.exit(1);
                        }
                    });
                } else {
                    debugLog(`❌ [${ACCOUNT_ID}] Process cancelled by user`);
                    process.exit(0);
                }
            } else if (parsed.action === 'close-browser') {
                userLog(`🔄 [${ACCOUNT_ID}] Closing browser as requested...`);
                process.exit(0);
            } else if (parsed.action === 'cancel-posting') {
                userLog(`⏹️ [${ACCOUNT_ID}] Feed engagement cancelled by user`);
                isCancelled = true;
                isProcessRunning = false;

                userLog(`FEED_ENGAGEMENT_STATUS_UPDATE:cancelled:Proses feed engagement dibatalkan oleh user`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:FEED_ENGAGEMENT_STATUS_UPDATE:cancelled:Proses feed engagement dibatalkan oleh user\n`);

                if (global.browserInstance) {
                    process.nextTick(async () => {
                        try {
                            await global.browserInstance.close();
                            userLog(`✅ [${ACCOUNT_ID}] Browser closed successfully`);
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error closing browser: ${error.message}`);
                        } finally {
                            process.exit(0);
                        }
                    });
                } else {
                    process.exit(0);
                }
            } else {
                engagementData = parsed;
                global.engagementData = parsed;
                userLog(`✅ [${ACCOUNT_ID}] Feed engagement data received`);

                process.nextTick(async () => {
                    try {
                        if (!isProcessRunning) {
                            isProcessRunning = true;
                            await startFeedEngagementProcess(engagementData);
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error starting feed engagement: ${error.message}`);
                        process.exit(1);
                    }
                });
            }
        } catch (error) {
            userLog(`📝 [${ACCOUNT_ID}] Raw input: ${data.substring(0, 100)}`);
        }
    });
}

async function startFeedEngagementProcess(engagementData) {
    userLog(`🚀 [${ACCOUNT_ID}] Starting Feed Engagement process for ${ACCOUNT_NAME}...`);

    const SESSION_DIR = ACCOUNT_SESSION_DIR;
    const USER_DATA_DIR = path.join(SESSION_DIR, 'chrome_profile');

    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    await cleanupChromeLocks(USER_DATA_DIR);

    let browser;
    let page;

    try {
        const browserWidth = parseInt(process.env.BROWSER_WIDTH) || 960;
        const browserHeight = parseInt(process.env.BROWSER_HEIGHT) || 1080;
        const browserX = parseInt(process.env.BROWSER_X) || 960;
        const browserY = parseInt(process.env.BROWSER_Y) || 0;
        const sizeOption = process.env.BROWSER_SIZE || 'half';

        debugLog(`📐 [${ACCOUNT_ID}] Browser size: ${browserWidth}x${browserHeight} at position (${browserX}, ${browserY})`);

        const isFullscreen = sizeOption === 'full' || sizeOption === 'fullscreen' || sizeOption === 'maximized';
        const viewport = isFullscreen ? null : { width: browserWidth, height: browserHeight };

        debugLog(`🔧 User Data Dir: ${USER_DATA_DIR}`);

        const baseArgs = isFullscreen
            ? ['--start-maximized']
            : [`--window-size=${browserWidth},${browserHeight}`, `--window-position=${browserX},${browserY}`];

        const separationArgs = [
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-plugins',
            '--no-first-run',
            '--noerrdialogs',
            '--disable-save-password-bubble',
            '--disable-background-mode',
        ];

        const args = [...baseArgs, ...separationArgs];

        debugLog(`🚀 [${ACCOUNT_ID}] Launching Chromium instance with isolated profile...`);

        const executablePath = await getBrowserExecutablePath();
        debugLog(`🔧 Using executable: ${executablePath || 'Playwright default'}`);

        const deleteCorruptProfile = async () => {
            debugLog(`🗑️ [${ACCOUNT_ID}] Deleting potentially corrupt profile: ${USER_DATA_DIR}`);
            try {
                if (fs.existsSync(USER_DATA_DIR)) {
                    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
                    userLog(`✅ [${ACCOUNT_ID}] Profile deleted successfully`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not delete profile: ${e.message}`);
            }
        };

        const launchArgs = [
            ...args,
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            // Stealth arguments to avoid automation detection
            '--disable-blink-features=AutomationControlled',
            '--disable-automation',
            '--disable-infobars',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--ignore-certificate-errors',
            '--lang=en-US,en',
        ];

        try {
            browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
                headless: false,
                viewport: viewport,
                args: launchArgs,
                executablePath: executablePath,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                slowMo: 0,
                timeout: 120000,
                ignoreDefaultArgs: ['--enable-automation'],  // Hide automation banner
            });
        } catch (error) {
            debugLog(`❌ [${ACCOUNT_ID}] Failed to launch with executablePath: ${error.message}`);

            // 🔧 FIX: ONLY clean lock files, NEVER delete entire profile!
            // Error 2147483651 means browser was closed (not corruption)
            // Error 'Target closed' means browser was closed by user or crashed
            // These are NOT reasons to delete the profile and lose login session!

            const isLockFileError = error.message.includes('lock file') ||
                error.message.includes('EPERM') ||
                error.message.includes('EBUSY') ||
                error.message.includes('SingletonLock');

            if (isLockFileError) {
                userLog(`🔄 [${ACCOUNT_ID}] Lock file issue detected, cleaning locks and retrying...`);
            } else {
                debugLog(`⚠️ [${ACCOUNT_ID}] Launch failed, cleaning locks only (NOT deleting profile): ${error.message}`);
            }

            // Always just clean lock files, never delete entire profile
            await cleanupChromeLocks(USER_DATA_DIR);

            debugLog(`🔄 [${ACCOUNT_ID}] Retrying with Playwright default chromium...`);

            browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
                headless: false,
                viewport: viewport,
                args: launchArgs,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                slowMo: 0,
                timeout: 120000,
                ignoreDefaultArgs: ['--enable-automation'],  // Hide automation banner
            });
        }

        userLog(`✅ [${ACCOUNT_ID}] Chrome instance launched successfully!`);

        const cookiesPath = path.join(SESSION_DIR, 'cookies.json');
        if (fs.existsSync(cookiesPath)) {
            try {
                const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
                await browser.addCookies(cookies);
                userLog(`✅ [${ACCOUNT_ID}] Loaded saved cookies`);
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not load cookies: ${e.message}`);
            }
        }

        const pages = browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();

        page.setDefaultTimeout(60000);

        global.browserInstance = browser;
        userLog(`✅ [${ACCOUNT_ID}] Global browser instance set`);

        debugLog(`🌐 [${ACCOUNT_ID}] Opening Facebook homepage...`);
        await page.goto('https://www.facebook.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(3000);

        try {
            const accountTitle = `[${ACCOUNT_NAME}] - Feed Engagement`;
            await page.evaluate((title) => {
                document.title = title;

                const existingBadge = document.getElementById('account-badge');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.id = 'account-badge';
                    badge.style.cssText = `
                        position: fixed;
                        top: 5px;
                        left: 5px;
                        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-family: Arial, sans-serif;
                        font-size: 11px;
                        font-weight: bold;
                        z-index: 999999;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        pointer-events: none;
                        user-select: none;
                    `;
                    badge.textContent = title;
                    document.body.appendChild(badge);
                }
            }, accountTitle);
        } catch (titleError) {
            debugLog(`⚠️ [${ACCOUNT_ID}] Could not set browser title: ${titleError.message}`);
        }

        // Login confirmation process
        userLog(`⏰ [${ACCOUNT_ID}] Waiting 10 seconds for user to login...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.engagementData = engagementData;

        }, 10000);

        let checkCount = 0;
        const maxChecks = 6;
        let loginConfirmedManually = false;

        const checkInterval = setInterval(async () => {
            if (loginConfirmedManually) {
                clearInterval(checkInterval);
                return;
            }

            checkCount++;

            try {
                const isLoggedIn = await checkIfLoggedInSimple(page);
                debugLog(`🔍 [${ACCOUNT_ID}] Auto-check ${checkCount}/${maxChecks}: ${isLoggedIn ? '✅ Logged in' : '❌ Not logged in'}`);

                if (isLoggedIn) {
                    clearInterval(checkInterval);
                    clearTimeout(loginTimeout);
                    userLog(`✅ [${ACCOUNT_ID}] Auto-detected login! Continuing...`);

                    loginConfirmedManually = true;
                    await continueFeedEngagement(page, browser, engagementData);
                }

                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    debugLog(`⏰ [${ACCOUNT_ID}] Auto-check completed`);
                }
            } catch (error) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Auto-check error: ${error.message}`);
            }
        }, 3000);

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Error: ${error.message}`);
        isProcessRunning = false;
        // Biarkan browser tetap terbuka untuk mempertahankan session
        throw error;
    }
}

async function checkIfLoggedInSimple(page) {
    try {
        const url = await page.url();
        if (url.includes('login') || url.includes('checkpoint')) {
            return false;
        }

        const emailField = await page.locator('#email, input[name="email"]').first();
        if (await emailField.count() > 0) {
            return false;
        }

        const loginBtn = await page.locator('button:has-text("Log In"), button:has-text("Masuk")').first();
        if (await loginBtn.count() > 0) {
            return false;
        }

        return true;

    } catch {
        return false;
    }
}

async function continueAfterLogin(engagementData) {
    userLog(`🔄 [${ACCOUNT_ID}] Continuing after login confirmation...`);

    if (!global.loginPage || !global.browserInstance) {
        console.error(`❌ [${ACCOUNT_ID}] Browser instance not found`);
        isProcessRunning = false;
        throw new Error('Browser session lost');
    }

    try {
        userLog(`🔄 [${ACCOUNT_ID}] Refreshing page...`);
        await global.loginPage.reload({
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await global.loginPage.waitForTimeout(3000);

        await continueFeedEngagement(global.loginPage, global.browserInstance, engagementData);
    } finally {
        delete global.loginPage;
        delete global.browserInstance;
        delete global.engagementData;
    }
}

async function continueFeedEngagement(page, browser, engagementData) {
    userLog(`\n🚀 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🎯 [${ACCOUNT_ID}] STARTING FEED ENGAGEMENT PROCESS`);
    userLog(`==========================================\n`);

    try {
        // Extract settings
        const enableLike = engagementData.enableLike || false;
        const enableComment = engagementData.enableComment || false;
        const targetLikes = engagementData.targetLikes || 0;
        const targetComments = engagementData.targetComments || 0;
        const commentTemplates = engagementData.commentTemplates || [];
        const delayMin = engagementData.delayMin || 10;
        const delayMax = engagementData.delayMax || 30;
        const restCount = engagementData.restCount || 10;
        const restDelay = engagementData.restDelay || 120;

        userLog(`📋 [${ACCOUNT_ID}] Settings:`);
        userLog(`   - Enable Like: ${enableLike} (Target: ${targetLikes})`);
        userLog(`   - Enable Comment: ${enableComment} (Target: ${targetComments})`);
        userLog(`   - Comment Templates: ${commentTemplates.length}`);
        userLog(`   - Delay: ${delayMin}-${delayMax} seconds`);
        userLog(`   - Rest: Every ${restCount} actions, ${restDelay} seconds`);

        let likeCount = 0;
        let commentCount = 0;
        let scrollCount = 0;
        let actionCount = 0;
        const maxScrollAttempts = 200;

        // Navigate to Facebook feed if not already there
        const currentUrl = await page.url();
        if (!currentUrl.includes('facebook.com') || currentUrl.includes('login')) {
            await page.goto('https://www.facebook.com/', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            await page.waitForTimeout(3000);
        }

        userLog(`\n🔄 [${ACCOUNT_ID}] Starting scroll & engagement loop...`);
        userLog(`📋 [${ACCOUNT_ID}] Mode: Like first until target reached, then Comment on new posts`);

        // Track processed posts separately for likes and comments
        const processedLikeAreas = new Set();
        const processedCommentAreas = new Set();

        // Helper function to get post area ID from button position
        const getPostAreaId = (top) => {
            // Group by ~300px areas to identify unique posts
            return Math.floor(top / 300);
        };

        // Helper function to click Close button after comment
        const clickCloseButton = async () => {
            try {
                const clicked = await page.evaluate(() => {
                    // Try multiple selectors for close button
                    const selectors = [
                        '[role="button"][aria-label="Close"]',
                        '[aria-label="Close"]',
                        '[aria-label="Tutup"]',
                        'div[aria-label="Close"]',
                        'div[aria-label="Tutup"]'
                    ];

                    for (const selector of selectors) {
                        const closeBtn = document.querySelector(selector);
                        if (closeBtn) {
                            closeBtn.click();
                            return true;
                        }
                    }
                    return false;
                });

                await page.waitForTimeout(500);

                if (clicked) {
                    userLog(`✖️ [${ACCOUNT_ID}] Close button clicked`);
                } else {
                    // Try pressing Escape as fallback
                    await page.keyboard.press('Escape');
                    userLog(`✖️ [${ACCOUNT_ID}] Pressed Escape to close dialog`);
                }
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not click Close: ${e.message}`);
                // Try pressing Escape as last resort
                try {
                    await page.keyboard.press('Escape');
                } catch (escError) {
                    // Ignore
                }
            }
        };

        while (!isCancelled && scrollCount < maxScrollAttempts) {
            // Check if targets are reached
            const likesDone = !enableLike || likeCount >= targetLikes;
            const commentsDone = !enableComment || commentCount >= targetComments;

            if (likesDone && commentsDone) {
                userLog(`🎉 [${ACCOUNT_ID}] All targets reached!`);
                break;
            }

            scrollCount++;
            userLog(`📜 [${ACCOUNT_ID}] Scroll #${scrollCount} - Likes: ${likeCount}/${targetLikes}, Comments: ${commentCount}/${targetComments}`);

            // ===== FIND ALL POSTS WITH LIKE/COMMENT BUTTONS =====
            const allButtons = await page.evaluate(() => {
                const buttons = [];
                const scrollY = window.scrollY || window.pageYOffset;

                // Find all Like buttons (using text match)
                document.querySelectorAll('*').forEach(el => {
                    const text = el.textContent?.trim().toLowerCase();
                    if (text === 'like' || text === 'suka') {
                        const button = el.closest('[role="button"]');
                        if (button) {
                            const rect = button.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
                                const absoluteTop = scrollY + rect.top;
                                buttons.push({
                                    type: 'like',
                                    postArea: Math.floor(absoluteTop / 300),
                                    x: rect.x + rect.width / 2,
                                    y: rect.y + rect.height / 2,
                                    top: rect.top,
                                    absoluteTop: absoluteTop
                                });
                            }
                        }
                    }
                });

                // Find Comment buttons using multiple approaches
                // Approach 1: aria-label selectors
                const commentSelectors = [
                    '[aria-label="Comment"]',
                    '[aria-label="Komentar"]',
                    '[role="button"][aria-label="Comment"]',
                    '[role="button"][aria-label="Komentar"]',
                    '[aria-label="Leave a comment"]',
                    '[aria-label="Write a comment"]'
                ];

                commentSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(button => {
                        const rect = button.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
                            const absoluteTop = scrollY + rect.top;
                            const postArea = Math.floor(absoluteTop / 300);
                            const exists = buttons.some(b => b.type === 'comment' && b.postArea === postArea);
                            if (!exists) {
                                buttons.push({
                                    type: 'comment',
                                    postArea: postArea,
                                    x: rect.x + rect.width / 2,
                                    y: rect.y + rect.height / 2,
                                    top: rect.top,
                                    absoluteTop: absoluteTop
                                });
                            }
                        }
                    });
                });

                // Approach 2: Text-based matching (fallback)
                // Find elements containing "Comment" or "Komentar" text
                document.querySelectorAll('[role="button"]').forEach(button => {
                    const text = button.textContent?.trim().toLowerCase() || '';
                    // Check if button text starts with or equals "comment" or "komentar"
                    if (text === 'comment' || text === 'komentar' ||
                        text.startsWith('comment ') || text.startsWith('komentar ') ||
                        text.includes('comment') || text.includes('komentar')) {

                        const rect = button.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
                            const absoluteTop = scrollY + rect.top;
                            const postArea = Math.floor(absoluteTop / 300);
                            const exists = buttons.some(b => b.type === 'comment' && b.postArea === postArea);
                            if (!exists) {
                                buttons.push({
                                    type: 'comment',
                                    postArea: postArea,
                                    x: rect.x + rect.width / 2,
                                    y: rect.y + rect.height / 2,
                                    top: rect.top,
                                    absoluteTop: absoluteTop
                                });
                            }
                        }
                    }
                });

                return buttons.sort((a, b) => a.top - b.top);
            });

            // Group buttons by post area
            const postMap = new Map();
            for (const btn of allButtons) {
                if (!postMap.has(btn.postArea)) {
                    postMap.set(btn.postArea, { like: null, comment: null });
                }
                if (btn.type === 'like' && !postMap.get(btn.postArea).like) {
                    postMap.get(btn.postArea).like = btn;
                }
                if (btn.type === 'comment' && !postMap.get(btn.postArea).comment) {
                    postMap.get(btn.postArea).comment = btn;
                }
            }

            userLog(`🔍 [${ACCOUNT_ID}] Found ${postMap.size} posts: ${allButtons.filter(b => b.type === 'like').length} like, ${allButtons.filter(b => b.type === 'comment').length} comment buttons`);

            // Process each post - Like first, then Comment on new posts
            for (const [postArea, buttons] of postMap) {
                if (isCancelled) break;

                // Check what we still need
                const stillNeedsLikes = enableLike && likeCount < targetLikes;
                const stillNeedsComments = enableComment && commentCount < targetComments && commentTemplates.length > 0;

                // Decide action based on priority: Like first until done, then Comment
                let doLike = false;
                let doComment = false;

                if (stillNeedsLikes && buttons.like && !processedLikeAreas.has(postArea)) {
                    doLike = true;
                } else if (stillNeedsComments && buttons.comment && !processedCommentAreas.has(postArea)) {
                    doComment = true;
                }

                // Debug log to understand why post is skipped
                if (!doLike && !doComment) {
                    userLog(`⏩ [${ACCOUNT_ID}] Skipping post area ${postArea}: needsLikes=${stillNeedsLikes}, needsComments=${stillNeedsComments}, hasComment=${!!buttons.comment}, alreadyCommented=${processedCommentAreas.has(postArea)}`);
                    continue;
                }

                // ===== LIKE ACTION =====
                if (doLike) {
                    try {
                        // Mark as processed BEFORE action
                        processedLikeAreas.add(postArea);

                        await page.mouse.click(buttons.like.x, buttons.like.y);
                        await page.waitForTimeout(800);

                        likeCount++;
                        actionCount++;
                        userLog(`❤️ [${ACCOUNT_ID}] Like #${likeCount}/${targetLikes} (Post area: ${postArea})`);
                        process.stdout.write(`FEED_ENGAGEMENT_STATUS_UPDATE:like:${likeCount}:${targetLikes}:Like berhasil\n`);

                        // Random scroll 1-10 times after like to look more natural
                        const randomScrolls = Math.floor(Math.random() * 10) + 1;
                        userLog(`📜 [${ACCOUNT_ID}] Random scrolling ${randomScrolls} times...`);
                        for (let s = 0; s < randomScrolls; s++) {
                            await page.evaluate(() => {
                                window.scrollBy({ top: Math.floor(Math.random() * 400) + 200, behavior: 'smooth' });
                            });
                            await page.waitForTimeout(800 + Math.random() * 500);
                        }

                        // Random delay between likes
                        const delay = Math.floor((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
                        userLog(`⏱️ [${ACCOUNT_ID}] Waiting ${Math.round(delay / 1000)} seconds before next action...`);
                        await page.waitForTimeout(delay);

                    } catch (likeError) {
                        debugLog(`⚠️ [${ACCOUNT_ID}] Like error: ${likeError.message}`);
                    }
                }
                // ===== COMMENT ACTION =====
                else if (doComment) {
                    try {
                        // Note: Don't mark as processed until comment is successful
                        // Track consecutive failures for this session
                        if (!global.commentFailCount) global.commentFailCount = 0;
                        const MAX_CONSECUTIVE_FAILURES = 3;

                        // Click comment button
                        await page.mouse.click(buttons.comment.x, buttons.comment.y);
                        await page.waitForTimeout(2000);

                        // Get random comment template
                        const randomTemplate = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];
                        const commentText = spinText(randomTemplate.text);

                        // Find comment box with RETRY logic (3 attempts)
                        const commentBoxSelectors = [
                            'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
                            'div[role="textbox"][contenteditable="true"][aria-label^="Comment as"]',
                            'div[role="textbox"][contenteditable="true"][aria-label*="comment" i]',
                            'div[role="textbox"][contenteditable="true"][placeholder*="Write" i]',
                            'div[role="textbox"][contenteditable="true"]',
                            '[role="textbox"][contenteditable="true"]'
                        ];

                        let commentBox = null;
                        const MAX_RETRIES = 3;

                        for (let retry = 1; retry <= MAX_RETRIES; retry++) {
                            userLog(`🔍 [${ACCOUNT_ID}] Looking for comment box (attempt ${retry}/${MAX_RETRIES})...`);

                            // Try all selectors
                            for (const selector of commentBoxSelectors) {
                                try {
                                    const elements = await page.locator(selector).all();
                                    if (elements.length > 0) {
                                        for (let i = 0; i < Math.min(elements.length, 5); i++) {
                                            const element = elements[i];
                                            const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
                                            const isEditable = await element.isEditable({ timeout: 1000 }).catch(() => false);
                                            if (isVisible && isEditable) {
                                                commentBox = element;
                                                debugLog(`✅ [${ACCOUNT_ID}] Found comment box with selector: ${selector}`);
                                                break;
                                            }
                                        }
                                        if (commentBox) break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            if (commentBox) break;

                            // If not found, try scrolling and wait before next retry
                            if (retry < MAX_RETRIES) {
                                userLog(`⚠️ [${ACCOUNT_ID}] Comment box not found, scrolling and retrying...`);
                                await page.evaluate(() => window.scrollBy(0, 300));
                                await page.waitForTimeout(2000);

                                // Re-click comment button with human-like movement
                                await humanLikeMouseMove(page, buttons.comment.x, buttons.comment.y);
                                await page.mouse.click(buttons.comment.x, buttons.comment.y);
                                await page.waitForTimeout(2000);
                            }
                        }

                        if (commentBox && await commentBox.isVisible().catch(() => false)) {
                            // Reset failure count on success finding comment box
                            global.commentFailCount = 0;

                            // Perform some random actions before commenting (like a human reading)
                            await randomHumanActions(page);

                            // Click to focus with human-like movement
                            const boxBound = await commentBox.boundingBox();
                            if (boxBound) {
                                await humanLikeMouseMove(page, boxBound.x + boxBound.width / 2, boxBound.y + boxBound.height / 2);
                            }
                            await commentBox.click();
                            await page.waitForTimeout(500 + Math.random() * 300);

                            // Clear any existing text first
                            await commentBox.fill('');
                            await page.waitForTimeout(200 + Math.random() * 200);

                            // Type the comment text like a human (character by character)
                            userLog(`⌨️ [${ACCOUNT_ID}] Typing comment...`);
                            await humanLikeType(page, commentText, 30, 120);
                            await page.waitForTimeout(800 + Math.random() * 500);

                            // Upload image if template has one
                            if (randomTemplate.imagePath && fs.existsSync(randomTemplate.imagePath)) {
                                try {
                                    const fileInputs = await page.locator('input[type="file"]').all();
                                    if (fileInputs.length > 0) {
                                        const fileInput = fileInputs.length > 1 ? fileInputs[1] : fileInputs[0];
                                        await fileInput.setInputFiles(randomTemplate.imagePath);
                                        await page.waitForTimeout(3000 + Math.random() * 1000);
                                        userLog(`📎 [${ACCOUNT_ID}] Image attached to comment`);
                                    }
                                } catch (e) {
                                    debugLog(`⚠️ [${ACCOUNT_ID}] Image upload failed: ${e.message}`);
                                }
                            }

                            // Small random pause before submitting (like reviewing)
                            await page.waitForTimeout(500 + Math.random() * 1000);

                            // Submit comment
                            await page.keyboard.press('Enter');
                            await page.waitForTimeout(2500 + Math.random() * 1000);

                            // Verify comment was submitted
                            const textAfterSubmit = await commentBox.textContent().catch(() => '');
                            const commentSuccess = textAfterSubmit.length === 0 || textAfterSubmit !== commentText;

                            if (commentSuccess) {
                                processedCommentAreas.add(postArea);
                                commentCount++;
                                actionCount++;
                                userLog(`💬 [${ACCOUNT_ID}] Comment #${commentCount}/${targetComments}: "${commentText.substring(0, 30)}..."`);
                                process.stdout.write(`FEED_ENGAGEMENT_STATUS_UPDATE:comment:${commentCount}:${targetComments}:Comment berhasil\n`);
                            } else {
                                userLog(`⚠️ [${ACCOUNT_ID}] Comment may have failed, text still in box`);
                            }

                            // Click Close button after comment
                            await clickCloseButton();

                            // Random scroll 1-10 times after comment to look more natural
                            const randomScrolls = Math.floor(Math.random() * 10) + 1;
                            userLog(`📜 [${ACCOUNT_ID}] Random scrolling ${randomScrolls} times...`);
                            for (let s = 0; s < randomScrolls; s++) {
                                await page.evaluate(() => {
                                    window.scrollBy({ top: Math.floor(Math.random() * 400) + 200, behavior: 'smooth' });
                                });
                                await page.waitForTimeout(800 + Math.random() * 500);
                            }

                            // Random delay
                            const delay = Math.floor((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
                            userLog(`⏱️ [${ACCOUNT_ID}] Waiting ${Math.round(delay / 1000)} seconds before next action...`);
                            await page.waitForTimeout(delay);
                        } else {
                            // Comment box not found after all retries
                            global.commentFailCount++;
                            userLog(`❌ [${ACCOUNT_ID}] Comment box NOT FOUND after ${MAX_RETRIES} attempts! (Failure ${global.commentFailCount}/${MAX_CONSECUTIVE_FAILURES})`);
                            await clickCloseButton();

                            // If failed 3 times in a row, abort and close browser
                            if (global.commentFailCount >= MAX_CONSECUTIVE_FAILURES) {
                                userLog(`\n❌ [${ACCOUNT_ID}] ==========================================`);
                                userLog(`❌ [${ACCOUNT_ID}] FEED ENGAGEMENT FAILED`);
                                userLog(`❌ [${ACCOUNT_ID}] Comment box not found ${MAX_CONSECUTIVE_FAILURES} times in a row`);
                                userLog(`❌ [${ACCOUNT_ID}] Exiting with FAILED status...`);
                                userLog(`==========================================\n`);

                                process.stdout.write(`FEED_ENGAGEMENT_STATUS_UPDATE:failed:Comment box tidak ditemukan setelah ${MAX_CONSECUTIVE_FAILURES} percobaan\n`);
                                process.stdout.write(`FEED_ENGAGEMENT_COMPLETE:${likeCount}:${commentCount}\n`);

                                // Biarkan browser tetap terbuka untuk mempertahankan session
                                process.exit(1);
                            }
                        }
                    } catch (commentError) {
                        userLog(`⚠️ [${ACCOUNT_ID}] Comment error: ${commentError.message}`);
                        // Try to close any open dialog
                        await clickCloseButton();
                    }
                }

                // Rest time check
                if (actionCount > 0 && actionCount % restCount === 0) {
                    const stillNeedsActions = (enableLike && likeCount < targetLikes) || (enableComment && commentCount < targetComments);
                    if (stillNeedsActions) {
                        userLog(`💤 [${ACCOUNT_ID}] Rest time: ${restDelay} seconds after ${actionCount} actions...`);
                        process.stdout.write(`FEED_ENGAGEMENT_STATUS_UPDATE:rest:${restDelay}:Resting...\n`);
                        await page.waitForTimeout(restDelay * 1000);
                        userLog(`✅ [${ACCOUNT_ID}] Rest completed, resuming...`);
                    }
                }
            }

            // Scroll down to load more posts
            await page.evaluate(() => {
                window.scrollBy({ top: 700, behavior: 'smooth' });
            });
            await page.waitForTimeout(2500);
        }

        // Final summary
        userLog(`\n🎯 [${ACCOUNT_ID}] ==========================================`);
        userLog(`📊 [${ACCOUNT_ID}] FEED ENGAGEMENT SUMMARY`);
        userLog(`✅ [${ACCOUNT_ID}] Total Likes: ${likeCount}/${targetLikes}`);
        userLog(`✅ [${ACCOUNT_ID}] Total Comments: ${commentCount}/${targetComments}`);
        userLog(`📜 [${ACCOUNT_ID}] Total Scrolls: ${scrollCount}`);
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] Process was cancelled by user`);
        } else {
            userLog(`🎉 [${ACCOUNT_ID}] FEED ENGAGEMENT COMPLETED`);
        }
        userLog(`==========================================\n`);

        process.stdout.write(`FEED_ENGAGEMENT_COMPLETE:${likeCount}:${commentCount}\n`);
        isProcessRunning = false;

        // Biarkan browser tetap terbuka untuk mempertahankan session
        // User dapat menutup browser secara manual
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Feed engagement error: ${error.message}`);
        userLog(`❌ [${ACCOUNT_ID}] Error: ${error.message}`);

        // Still send complete signal with current counts
        process.stdout.write(`FEED_ENGAGEMENT_COMPLETE:${likeCount || 0}:${commentCount || 0}\n`);
        isProcessRunning = false;

        // Biarkan browser tetap terbuka untuk mempertahankan session
        process.exit(1);
    }
}

async function findFeedPosts(page) {
    try {
        // Find all feed post elements
        const posts = await page.locator('[data-pagelet^="FeedUnit"], [role="article"]').all();
        return posts;
    } catch (error) {
        debugLog(`⚠️ [${ACCOUNT_ID}] Error finding posts: ${error.message}`);
        return [];
    }
}

async function getPostId(postElement) {
    try {
        // Try to extract post ID from various attributes
        const dataId = await postElement.getAttribute('data-id');
        if (dataId) return dataId;

        // Generate a unique ID based on position and content
        const textContent = await postElement.textContent();
        const hash = textContent.substring(0, 100).split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return `post_${hash}`;
    } catch {
        return `post_${Date.now()}_${Math.random()}`;
    }
}

async function likePost(page, postElement) {
    try {
        // Method 1: Find Like button by aria-label
        const likeButtonSelectors = [
            '[aria-label="Like"]',
            '[aria-label="Suka"]',
            '[aria-label="Thích"]',
            '[role="button"][aria-label*="Like"]',
            '[role="button"][aria-label*="Suka"]'
        ];

        for (const selector of likeButtonSelectors) {
            try {
                const likeButton = await postElement.locator(selector).first();
                if (await likeButton.count() > 0) {
                    const isVisible = await likeButton.isVisible({ timeout: 1000 });
                    if (isVisible) {
                        // Check if already liked (aria-pressed or already reacted)
                        const ariaPressed = await likeButton.getAttribute('aria-pressed');
                        if (ariaPressed === 'true') {
                            debugLog(`⏩ [${ACCOUNT_ID}] Post already liked, skipping`);
                            return false;
                        }

                        await likeButton.click({ timeout: 5000 });
                        await page.waitForTimeout(800);
                        return true;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // Method 2: Find by text content (like the console script)
        // Look for elements with exact "Like" or "Suka" text
        const textMatches = await page.evaluate((postSelector) => {
            const postEl = document.querySelector(postSelector);
            if (!postEl) return [];

            const buttons = [];
            postEl.querySelectorAll('*').forEach(el => {
                const text = el.textContent?.trim().toLowerCase();
                if (text === 'like' || text === 'suka') {
                    const button = el.closest('[role="button"]');
                    if (button) {
                        // Check if it's a like button (not already reacted)
                        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                        if (!ariaLabel.includes('love') && !ariaLabel.includes('haha') &&
                            !ariaLabel.includes('wow') && !ariaLabel.includes('sad') &&
                            !ariaLabel.includes('angry')) {
                            buttons.push({
                                found: true,
                                rect: button.getBoundingClientRect()
                            });
                        }
                    }
                }
            });
            return buttons;
        }, '[role="article"]');

        if (textMatches && textMatches.length > 0) {
            // Click on the first found like button
            for (const match of textMatches) {
                if (match.rect && match.rect.width > 0) {
                    const x = match.rect.x + match.rect.width / 2;
                    const y = match.rect.y + match.rect.height / 2;

                    await page.mouse.click(x, y);
                    await page.waitForTimeout(800);
                    return true;
                }
            }
        }

        // Method 3: Direct click on visible Like text in post actions bar
        try {
            const likeText = await postElement.locator('[role="button"] span:text-is("Like"), [role="button"] span:text-is("Suka")').first();
            if (await likeText.count() > 0) {
                await likeText.click({ timeout: 3000 });
                await page.waitForTimeout(800);
                return true;
            }
        } catch (e) {
            // Continue to next method
        }

        return false;
    } catch (error) {
        debugLog(`⚠️ [${ACCOUNT_ID}] Error liking post: ${error.message}`);
        return false;
    }
}

async function commentOnFeedPost(page, postElement, commentText, imagePath) {
    try {
        // Step 1: Find and click Comment button
        const commentButtonSelectors = [
            '[aria-label="Comment"]',
            '[aria-label="Komentar"]',
            '[aria-label="Bình luận"]',
            '[role="button"][aria-label*="Comment"]',
            '[role="button"][aria-label*="Komentar"]'
        ];

        let commentButtonClicked = false;

        for (const selector of commentButtonSelectors) {
            try {
                const commentButton = await postElement.locator(selector).first();
                if (await commentButton.count() > 0) {
                    const isVisible = await commentButton.isVisible({ timeout: 1000 });
                    if (isVisible) {
                        await commentButton.click({ timeout: 5000 });
                        commentButtonClicked = true;
                        await page.waitForTimeout(1500);
                        break;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // Alternative: Find by text "Comment" or "Komentar"
        if (!commentButtonClicked) {
            try {
                const commentByText = await postElement.locator('[role="button"] span:text-is("Comment"), [role="button"] span:text-is("Komentar")').first();
                if (await commentByText.count() > 0) {
                    await commentByText.click({ timeout: 3000 });
                    commentButtonClicked = true;
                    await page.waitForTimeout(1500);
                }
            } catch (e) {
                // Continue
            }
        }

        if (!commentButtonClicked) {
            debugLog(`⚠️ [${ACCOUNT_ID}] Could not find comment button`);
            return false;
        }

        // Step 2: Find comment box with multiple selectors
        const commentBoxSelectors = [
            'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
            'div[role="textbox"][contenteditable="true"][aria-label*="Comment"]',
            'div[role="textbox"][contenteditable="true"][aria-label*="Komentar"]',
            'div[role="textbox"][contenteditable="true"][aria-label^="Write a comment"]',
            'div[role="textbox"][contenteditable="true"][placeholder*="Write"]',
            'div[role="textbox"][contenteditable="true"]'
        ];

        let commentBox = null;

        for (const selector of commentBoxSelectors) {
            try {
                const elements = await page.locator(selector).all();
                for (const element of elements) {
                    const isVisible = await element.isVisible({ timeout: 1000 });
                    const isEditable = await element.isEditable({ timeout: 1000 });
                    if (isVisible && isEditable) {
                        commentBox = element;
                        break;
                    }
                }
                if (commentBox) break;
            } catch (e) {
                continue;
            }
        }

        if (!commentBox) {
            debugLog(`⚠️ [${ACCOUNT_ID}] Could not find comment box`);
            return false;
        }

        // Step 3: Click and fill comment
        await commentBox.click();
        await page.waitForTimeout(500);
        await commentBox.fill(''); // Clear first
        await commentBox.fill(commentText);
        await page.waitForTimeout(800);

        // Step 4: Upload image if provided
        if (imagePath && fs.existsSync(imagePath)) {
            try {
                const fileInputs = await page.locator('input[type="file"]').all();
                if (fileInputs.length > 0) {
                    // Usually the second file input is for comment attachments
                    const fileInput = fileInputs.length > 1 ? fileInputs[1] : fileInputs[0];
                    await fileInput.setInputFiles(imagePath);
                    await page.waitForTimeout(3000);
                    debugLog(`📎 [${ACCOUNT_ID}] Image attached to comment`);
                }
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not attach image: ${e.message}`);
            }
        }

        // Step 5: Submit comment (Enter key)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2500);

        userLog(`💬 [${ACCOUNT_ID}] Comment posted successfully`);
        return true;

    } catch (error) {
        debugLog(`⚠️ [${ACCOUNT_ID}] Error commenting on post: ${error.message}`);
        return false;
    }
}

// Run script
if (require.main === module) {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    runFeedEngagement();
}

module.exports = { runFeedEngagement };
