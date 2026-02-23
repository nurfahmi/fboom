const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== DEBUG MODE - Set to true to see internal debug logs =====
const DEBUG_MODE = false;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => { };

// ===== USER LOG - Always shown to user in UI =====
// Use this for important status messages that user needs to see
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

    // Regular expression to match {{option1|option2|option3}}
    const spinPattern = /\{\{([^}]+)\}\}/g;

    return text.replace(spinPattern, (match, options) => {
        // Split by pipe character |
        const optionList = options.split('|').map(opt => opt.trim());

        // Remove empty options
        const validOptions = optionList.filter(opt => opt.length > 0);

        if (validOptions.length === 0) {
            return match; // Return original if no valid options
        }

        // Use multiple random sources for better randomness
        // Combine timestamp, process.hrtime, and Math.random
        const timestamp = Date.now();
        const hrtime = process.hrtime.bigint().toString(10);
        const randomSource = (timestamp + parseInt(hrtime.slice(-8)) + Math.random() * 1000000) % 1000000;
        const randomIndex = Math.floor(randomSource % validOptions.length);

        // Debug log to show randomness
        debugLog(`🎲 [SPIN] Options: ${validOptions.length}, Index: ${randomIndex}, Selected: "${validOptions[randomIndex]}"`);

        return validOptions[randomIndex];
    });
}

// Debug: Show Node version and current directory
debugLog(`🔧 Node version: ${process.version}`);
debugLog(`📂 Current directory: ${__dirname}`);

// Function to get browser executable path for dynamically installed browsers
// CRITICAL FIX: This function now prioritizes ms-playwright global path for production reliability
async function getBrowserExecutablePath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    debugLog(`🔍 getBrowserExecutablePath() called`);
    debugLog(`🔍 PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'not set'}`);

    // Helper function to find newest chromium folder and get executable path
    const findChromiumExecutable = (browsersPath) => {
        if (!fs.existsSync(browsersPath)) {
            debugLog(`🔍 Path not found: ${browsersPath}`);
            return null;
        }

        try {
            const files = fs.readdirSync(browsersPath);
            // Find all chromium folders (excluding headless variants)
            const chromiumFolders = files
                .filter(f => f.startsWith('chromium-') && !f.includes('headless'))
                .sort((a, b) => {
                    // Sort by version number (higher = newer)
                    const vA = parseInt(a.replace('chromium-', '')) || 0;
                    const vB = parseInt(b.replace('chromium-', '')) || 0;
                    return vB - vA; // Descending order (newest first)
                });

            debugLog(`🔍 Found chromium folders: ${chromiumFolders.join(', ') || 'none'}`);

            for (const chromiumFolder of chromiumFolders) {
                let execPath;
                if (isWindows) {
                    // Try chrome-win64 first (newer), then chrome-win (older)
                    execPath = path.join(browsersPath, chromiumFolder, 'chrome-win64', 'chrome.exe');
                    if (!fs.existsSync(execPath)) {
                        execPath = path.join(browsersPath, chromiumFolder, 'chrome-win', 'chrome.exe');
                    }
                } else if (isMac) {
                    execPath = path.join(browsersPath, chromiumFolder, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
                } else {
                    execPath = path.join(browsersPath, chromiumFolder, 'chrome-linux', 'chrome');
                }

                debugLog(`🔍 Checking executable: ${execPath} - exists: ${fs.existsSync(execPath)}`);
                if (fs.existsSync(execPath)) {
                    return execPath;
                }
            }
        } catch (e) {
            debugLog(`⚠️ Error reading path ${browsersPath}: ${e.message}`);
        }
        return null;
    };

    // PRIORITY 1: Check custom PLAYWRIGHT_BROWSERS_PATH from environment
    const customBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (customBrowsersPath && customBrowsersPath !== '0') {
        debugLog(`🔍 [PRIORITY 1] Checking custom browsers path: ${customBrowsersPath}`);
        const execPath = findChromiumExecutable(customBrowsersPath);
        if (execPath) {
            userLog(`✅ [BROWSER] Found browser at custom path: ${execPath}`);
            return execPath;
        }
    }

    // PRIORITY 2: Check global ms-playwright path (most reliable for production)
    let globalMsPlaywrightPath;
    if (isWindows) {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        globalMsPlaywrightPath = path.join(localAppData, 'ms-playwright');
    } else if (isMac) {
        globalMsPlaywrightPath = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
    } else {
        globalMsPlaywrightPath = path.join(os.homedir(), '.cache', 'ms-playwright');
    }

    debugLog(`🔍 [PRIORITY 2] Checking global ms-playwright path: ${globalMsPlaywrightPath}`);
    const globalExecPath = findChromiumExecutable(globalMsPlaywrightPath);
    if (globalExecPath) {
        userLog(`✅ [BROWSER] Found browser at global path: ${globalExecPath}`);
        return globalExecPath;
    }

    // PRIORITY 3: Try Playwright's built-in detection
    try {
        debugLog(`🔍 [PRIORITY 3] Trying Playwright's built-in detection...`);
        // Use the chromium variable already imported at the top of the file
        // Note: executablePath() is NOT async in Playwright
        const executablePath = chromium.executablePath();

        debugLog(`🔍 Playwright reports executable at: ${executablePath}`);
        if (executablePath && fs.existsSync(executablePath)) {
            userLog(`✅ [BROWSER] Found Playwright browser: ${executablePath}`);
            return executablePath;
        }
    } catch (error) {
        debugLog(`⚠️ Playwright detection failed: ${error.message}`);
    }

    // PRIORITY 4: Check local node_modules paths (development mode fallback)
    const localPaths = [
        path.join(__dirname, 'node_modules', 'playwright-core', '.local-browsers'),
        path.join(__dirname, 'node_modules', 'playwright', '.local-browsers')
    ];

    // Handle packaged app - check unpacked directory
    if (__dirname.includes('.asar')) {
        const unpackedDir = __dirname.replace('.asar', '.asar.unpacked');
        localPaths.unshift(
            path.join(unpackedDir, 'node_modules', 'playwright-core', '.local-browsers'),
            path.join(unpackedDir, 'node_modules', 'playwright', '.local-browsers')
        );
    }

    debugLog(`🔍 [PRIORITY 4] Checking local paths...`);
    for (const localPath of localPaths) {
        const execPath = findChromiumExecutable(localPath);
        if (execPath) {
            userLog(`✅ [BROWSER] Found browser at local path: ${execPath}`);
            return execPath;
        }
    }

    userLog(`⚠️ [BROWSER] No browser found in any location!`);
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

// Global flag to prevent duplicate processes
let isProcessRunning = false;
let isCancelled = false;

async function runFacebookGroupsPoster() {
    userLog(`🚀 [${ACCOUNT_ID}] Facebook Groups Poster started`);
    let postData = '';

    process.stdin.on('data', (chunk) => {
        const data = chunk.toString();
        debugLog(`📥 [${ACCOUNT_ID}] Received data: ${data.substring(0, 100)}...`);

        try {
            const parsed = JSON.parse(data);
            debugLog(`📄 [${ACCOUNT_ID}] Parsed data:`, parsed);

            if (parsed.action === 'login-confirmation') {
                userLog(`✅ [${ACCOUNT_ID}] Login confirmation: ${parsed.confirmed ? 'CONTINUE' : 'CANCEL'}`);

                if (parsed.confirmed) {
                    process.nextTick(async () => {
                        try {
                            if (global.postData) {
                                // Use global.postData instead of local postData
                                await continueAfterLogin(global.postData);
                            } else {
                                console.error(`❌ [${ACCOUNT_ID}] No postData found`);
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
                userLog(`⏹️ [${ACCOUNT_ID}] Posting cancelled by user`);
                isCancelled = true;
                isProcessRunning = false;
                // Biarkan browser tetap terbuka untuk mempertahankan session
                process.exit(0);
            } else if (parsed.action === 'bring-browser-to-front') {
                const uniqueTitle = parsed.uniqueTitle || `FBOOM-ACCOUNT-${ACCOUNT_ID}`;
                userLog(`🔄 [${ACCOUNT_ID}] Bringing browser to front with unique title: ${uniqueTitle}...`);
                process.nextTick(async () => {
                    try {
                        if (global.browserInstance) {
                            // For launchPersistentContext, browserInstance IS the BrowserContext
                            let pages = [];
                            try {
                                pages = global.browserInstance.pages() || [];
                                debugLog(`🔍 [${ACCOUNT_ID}] Found ${pages.length} pages in persistent context`);
                            } catch (e) {
                                debugLog(`⚠️ [${ACCOUNT_ID}] Error getting pages: ${e.message}`);
                            }

                            if (pages.length > 0) {
                                const page = pages[0];

                                // Set unique title to the page using JavaScript (document.title)
                                try {
                                    await page.evaluate((title) => {
                                        document.title = title;
                                        if (!window.fboomAccountTitle) {
                                            window.fboomAccountTitle = title;
                                        }
                                    }, `${uniqueTitle} - Browser`);
                                    debugLog(`🔖 [${ACCOUNT_ID}] Set window title: ${uniqueTitle}`);
                                } catch (titleError) {
                                    debugLog(`⚠️ [${ACCOUNT_ID}] Could not set title: ${titleError.message}`);
                                }

                                try {
                                    await page.bringToFront();

                                    // Flash the title using document.title
                                    const flashTitles = ['🔔 AKTIF', '📢 AKTIF', '⚡ AKTIF', '🌟 AKTIF'];
                                    for (let i = 0; i < 8; i++) {
                                        const icon = flashTitles[i % flashTitles.length];
                                        await page.evaluate((t) => { document.title = t; }, `${icon} - ${uniqueTitle}`);
                                        await page.waitForTimeout(200);
                                    }
                                    await page.evaluate((t) => { document.title = t; }, `${uniqueTitle} - Browser`);

                                    userLog(`✅ [${ACCOUNT_ID}] Browser brought to front!`);

                                } catch (error) {
                                    console.error(`❌ [${ACCOUNT_ID}] Error: ${error.message}`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error in bring-browser-to-front: ${error.message}`);
                    }
                });
            } else {
                postData = parsed;
                global.postData = parsed; // Store in global for login confirmation
                userLog(`✅ [${ACCOUNT_ID}] Post data received for groups posting`);

                process.nextTick(async () => {
                    try {
                        if (!isProcessRunning) {
                            isProcessRunning = true;
                            await startGroupsPostingProcess(postData);
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error starting groups posting: ${error.message}`);
                        process.exit(1);
                    }
                });
            }
        } catch (error) {
            userLog(`📝 [${ACCOUNT_ID}] Raw input: ${data.substring(0, 100)}`);
        }
    });
}

// Clean up Chrome lock files before launching browser
async function cleanupChromeLocks(userDataDir) {
    debugLog(`🧹 [${ACCOUNT_ID}] Checking Chrome locks in: ${userDataDir}`);

    if (!fs.existsSync(userDataDir)) {
        debugLog(`✅ [${ACCOUNT_ID}] User data dir doesn't exist yet, no cleanup needed`);
        return;
    }

    const lockFiles = [
        'SingletonLock',
        'SingletonCookie',
        'SingletonSocket',
        'SingletonLockc',
        'pre_fetch_stats',
        'TransportSecurity'
    ];

    let cleanedCount = 0;
    for (const lockFile of lockFiles) {
        const lockPath = path.join(userDataDir, lockFile);
        if (fs.existsSync(lockPath)) {
            try {
                fs.unlinkSync(lockPath);
                debugLog(`🗑️ [${ACCOUNT_ID}] Removed lock file: ${lockFile}`);
                cleanedCount++;
            } catch (err) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not remove ${lockFile}: ${err.message}`);
            }
        }
    }

    // Also check for lock files in subdirectories
    const subdirs = ['Local Storage', 'Session Storage', 'GPUCache', 'Service Worker'];
    for (const subdir of subdirs) {
        const subdirPath = path.join(userDataDir, subdir);
        if (fs.existsSync(subdirPath)) {
            try {
                const files = fs.readdirSync(subdirPath);
                for (const file of files) {
                    if (file.endsWith('.lock') || file.startsWith('lock')) {
                        const lockPath = path.join(subdirPath, file);
                        try {
                            fs.unlinkSync(lockPath);
                            debugLog(`🗑️ [${ACCOUNT_ID}] Removed lock in ${subdir}: ${file}`);
                            cleanedCount++;
                        } catch (err) {
                            // Ignore
                        }
                    }
                }
            } catch (err) {
                // Ignore
            }
        }
    }

    if (cleanedCount > 0) {
        debugLog(`✅ [${ACCOUNT_ID}] Cleaned up ${cleanedCount} lock file(s)`);
    } else {
        debugLog(`✅ [${ACCOUNT_ID}] No lock files found`);
    }

    // Small delay to ensure files are fully deleted
    await new Promise(resolve => setTimeout(resolve, 500));
}

async function startGroupsPostingProcess(postData) {
    userLog(`🚀 [${ACCOUNT_ID}] Starting Facebook Groups posting process...`);
    userLog(`📋 [${ACCOUNT_ID}] Post data received:`, postData);

    // Gunakan session directory khusus akun
    const SESSION_DIR = ACCOUNT_SESSION_DIR;
    const USER_DATA_DIR = path.join(SESSION_DIR, 'chrome_profile');

    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    // Clean up Chrome lock files before launching to prevent "Target closed" error
    await cleanupChromeLocks(USER_DATA_DIR);

    let browser;
    let page;

    try {
        // Konfigurasi ukuran browser - bisa diatur via environment variable
        const browserWidth = parseInt(process.env.BROWSER_WIDTH) || 960;
        const browserHeight = parseInt(process.env.BROWSER_HEIGHT) || 1080;
        const browserX = parseInt(process.env.BROWSER_X) || 960; // Default to right half
        const browserY = parseInt(process.env.BROWSER_Y) || 0;
        const sizeOption = process.env.BROWSER_SIZE || 'half';

        debugLog(`📐 [${ACCOUNT_ID}] Browser size: ${browserWidth}x${browserHeight} at position (${browserX}, ${browserY})`);

        // Tentukan viewport dan args berdasarkan ukuran
        const isFullscreen = sizeOption === 'full' || sizeOption === 'fullscreen' || sizeOption === 'maximized';
        const viewport = isFullscreen ? null : { width: browserWidth, height: browserHeight };

        // 🔧 UNIQUE BROWSER INSTANCE per account
        // Gunakan launchPersistentContext dengan USER_DATA_DIR yang UNIK per akun
        // PENTING: JANGAN gunakan channel: "chrome" karena Chrome sistem bisa berbagi session!
        // Gunakan Chromium Playwright untuk isolasi session yang benar
        debugLog(`🔧 User Data Dir: ${USER_DATA_DIR}`);

        const baseArgs = isFullscreen
            ? ['--start-maximized']
            : [`--window-size=${browserWidth},${browserHeight}`, `--window-position=${browserX},${browserY}`];

        // Args untuk memisahkan browser instance (TANPA --user-data-dir, launchPersistentContext sudah menanganinya)
        // 🔒 ANTI-AUTOMATION DETECTION: Menyembunyikan banner "Chrome is being controlled by automated software"
        const separationArgs = [
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-plugins',
            '--no-first-run',
            '--noerrdialogs',
            '--disable-save-password-bubble',
            '--disable-background-mode',
            // 🔒 Anti-automation detection flags
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-automation',
            '--exclude-switches=enable-automation',
        ];

        const args = [...baseArgs, ...separationArgs];

        debugLog(`🚀 [${ACCOUNT_ID}] Launching Chromium instance with isolated profile...`);
        debugLog(`📐 Window size: ${browserWidth}x${browserHeight}, position: ${browserX},${browserY}`);

        // 🔧 FIX: Gunakan Chromium Playwright (BUKAN Chrome sistem) untuk isolasi session yang benar
        // Setiap akun memiliki user data dir sendiri = instance browser dan session terpisah!
        const executablePath = await getBrowserExecutablePath();
        userLog(`🔧 [${ACCOUNT_ID}] Browser executable: ${executablePath || 'Playwright default'}`);
        debugLog(`🔧 Using executable: ${executablePath || 'Playwright default'}`);

        // Function to clean lock files (NOT delete entire profile!)
        // This preserves session data while allowing browser to launch
        const cleanupLocksOnly = async () => {
            debugLog(`🔒 [${ACCOUNT_ID}] Cleaning lock files only (preserving session): ${USER_DATA_DIR}`);
            try {
                if (fs.existsSync(USER_DATA_DIR)) {
                    const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
                    for (const lockFile of lockFiles) {
                        const lockPath = path.join(USER_DATA_DIR, lockFile);
                        if (fs.existsSync(lockPath)) {
                            try {
                                fs.unlinkSync(lockPath);
                                debugLog(`🗑️ [${ACCOUNT_ID}] Removed lock: ${lockFile}`);
                            } catch (e) {
                                debugLog(`⚠️ [${ACCOUNT_ID}] Could not remove ${lockFile}: ${e.message}`);
                            }
                        }
                    }
                    userLog(`✅ [${ACCOUNT_ID}] Lock files cleaned (session preserved)`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not clean locks: ${e.message}`);
            }
        };

        // Add compatibility flags
        const launchArgs = [
            ...args,
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
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
                ignoreDefaultArgs: ['--enable-automation'],  // 🔒 Hide automation banner
            });
        } catch (error) {
            userLog(`❌ [${ACCOUNT_ID}] Launch failed: ${error.message}`);
            debugLog(`❌ [${ACCOUNT_ID}] Failed to launch with executablePath: ${error.message}`);

            // Check if browser executable not found - be very specific
            if (error.message.includes('Executable doesn\'t exist') ||
                (error.message.includes('chromium') && error.message.includes('not found')) ||
                error.message.includes('Failed to find browser')) {
                userLog(`❌ [${ACCOUNT_ID}] BROWSER_NOT_INSTALLED`);
                console.error(`❌ [${ACCOUNT_ID}] Chromium browser not installed. Please restart the app to install browser.`);
                process.exit(1);
            }

            // Only clean lock files for lock-related errors (preserve session!)
            if (error.message.includes('2147483651') ||
                error.message.includes('lock file') ||
                error.message.includes('EPERM') ||
                error.message.includes('EBUSY') ||
                error.message.includes('SingletonLock')) {
                userLog(`🔄 [${ACCOUNT_ID}] Lock file issue detected, cleaning locks and retrying...`);
                await cleanupLocksOnly();
            } else {
                debugLog(`⚠️ [${ACCOUNT_ID}] Launch failed but not cleaning locks: ${error.message}`);
            }

            debugLog(`🔄 [${ACCOUNT_ID}] Retrying with Playwright default chromium...`);

            try {
                browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
                    headless: false,
                    viewport: viewport,
                    args: launchArgs,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    slowMo: 0,
                    timeout: 120000,
                    ignoreDefaultArgs: ['--enable-automation'],  // 🔒 Hide automation banner
                });
            } catch (retryError) {
                // Final failure - browser definitely not installed
                if (retryError.message.includes('Executable doesn\'t exist') ||
                    retryError.message.includes('Failed to find browser') ||
                    (retryError.message.includes('chromium') && retryError.message.includes('not found'))) {
                    userLog(`❌ [${ACCOUNT_ID}] BROWSER_NOT_INSTALLED`);
                    console.error(`❌ [${ACCOUNT_ID}] Chromium browser not installed. Error: ${retryError.message}`);
                    process.exit(1);
                }
                throw retryError; // Re-throw other errors
            }
        }

        userLog(`✅ [${ACCOUNT_ID}] SEPARATE Chrome instance launched successfully!`);

        // Load cookies dari session sebelumnya jika ada
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

        // Create page
        const pages = browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();

        page.setDefaultTimeout(180000);

        // IMPORTANT: Set global browserInstance IMMEDIATELY after browser is created
        // This ensures the "Open Browser" button works even before login confirmation
        global.browserInstance = browser;
        userLog(`✅ [${ACCOUNT_ID}] Global browser instance set for bring-to-front command`);

        debugLog(`🌐 [${ACCOUNT_ID}] Opening Facebook...`);
        await page.goto('https://www.facebook.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(3000);

        // Set browser window title with account name for easy identification
        try {
            const accountTitle = `[${ACCOUNT_NAME}] - Facebook Auto Post`;
            await page.setTitle(accountTitle);
            debugLog(`🏷️ [${ACCOUNT_ID}] Browser window title set to: ${accountTitle}`);

            // Also set it via JavaScript for better persistence
            await page.evaluate((title) => {
                document.title = title;

                // Create a persistent badge/indicator in the page
                const existingBadge = document.getElementById('account-badge');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.id = 'account-badge';
                    badge.style.cssText = `
                        position: fixed;
                        top: 5px;
                        left: 5px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

        // Stop auto-check interval jika sudah terdeteksi login
        let checkInterval;
        let loginConfirmedManually = false;

        userLog(`⏰ [${ACCOUNT_ID}] Waiting 10 seconds for user to login...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            debugLog(`❓ [${ACCOUNT_ID}] Please check browser and login if needed`);
            userLog(`✅ [${ACCOUNT_ID}] If already logged in, click YES in the app popup`);
            debugLog(`❌ [${ACCOUNT_ID}] If not logged in, click NO to cancel`);

            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.postData = postData;

            // Send browser instance info to main process
            // For chromium.launch(), browserInstance is a Browser object (not BrowserContext)
            process.stdout.write(`BROWSER_CREATED:${ACCOUNT_ID}:${browser.contexts()?.[0]?.pages()?.length || 0}\n`);

        }, 1800000);

        let checkCount = 0;
        const maxChecks = 6;

        checkInterval = setInterval(async () => {
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

                    // Set flag to prevent duplicate processes
                    loginConfirmedManually = true;
                    await continueGroupsPosting(page, browser, postData);
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

async function continueAfterLogin(postData) {
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

        await continueGroupsPosting(global.loginPage, global.browserInstance, postData);
    } finally {
        delete global.loginPage;
        delete global.browserInstance;
        delete global.postData;
    }
}

async function continueGroupsPosting(page, browser, postData) {
    debugLog(`\n🤖 [${ACCOUNT_ID}] Starting Groups Process...\n`);

    let targetGroups = [];

    try {
        // Check if this is an extract-groups action (don't post, just extract)
        if (postData.action === 'extract-groups') {
            debugLog(`🔍 [${ACCOUNT_ID}] Extract Groups action detected - will extract without posting`);

            // Signal UI to clear old groups and show processing state
            userLog(`GROUPS_PROCESSING_START`);

            // STEP 1: Kunjungi halaman groups joins SEKALI
            debugLog(`📍 [${ACCOUNT_ID}] Step 1: Navigating to Facebook Groups joins page...`);
            await page.goto('https://www.facebook.com/groups/joins', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            await page.waitForTimeout(5000);

            // STEP 2: Scroll sampai bawah SEKALI
            debugLog(`📜 [${ACCOUNT_ID}] Step 2: Scrolling to load all groups...`);
            await scrollToBottom(page);

            // STEP 3: Extract groups data SEKALI
            debugLog(`🔍 [${ACCOUNT_ID}] Step 3: Extracting group data...`);
            const groups = await extractGroupsData(page);

            if (groups.length === 0) {
                debugLog(`❌ [${ACCOUNT_ID}] No groups found`);
                isProcessRunning = false;
                process.exit(0);
            }

            // TAMPILKAN DATA GROUP YANG DI-EXTRACT
            userLog(`\n📋 [${ACCOUNT_ID}] EXTRACTED GROUPS (${groups.length} groups):`);
            debugLog('══════════════════════════════════════════════════════════');
            groups.forEach((group, index) => {
                debugLog(`${index + 1}. ${group.name} (${group.id})`);
            });
            debugLog('══════════════════════════════════════════════════════════\n');

            // Kirim list group ke main process untuk ditampilkan di UI
            userLog(`GROUPS_EXTRACTED:${groups.length}:${JSON.stringify(groups)}`);

            userLog(`✅ [${ACCOUNT_ID}] Groups extraction completed successfully`);
            isProcessRunning = false;
            return; // Exit without posting
        }

        // Check if we have selected groups from saved data
        if (postData.selectedGroups && postData.selectedGroups.length > 0) {
            debugLog(`📋 [${ACCOUNT_ID}] Using ${postData.selectedGroups.length} selected saved groups`);
            targetGroups = postData.selectedGroups.map(group => `https://www.facebook.com/groups/${group.id}/buy_sell_discussion`);

            userLog(`\n📋 [${ACCOUNT_ID}] USING SAVED GROUP LINKS (${targetGroups.length} groups):`);
            debugLog('══════════════════════════════════════════════════════════');
            postData.selectedGroups.forEach((group, index) => {
                debugLog(`${index + 1}. ${group.name} (${group.id})`);
            });
            debugLog('══════════════════════════════════════════════════════════\n');

            // Note: Don't send GROUPS_EXTRACTED here as the groups are already saved and displayed in UI
            // Sending it would trigger unwanted "Groups Extracted" notification popup

            // Langsung lanjutkan dengan posting ke groups tersimpan
            await postToAllGroups(page, targetGroups, postData);
        } else {
            // Extract groups from Facebook and then post
            debugLog(`🔍 [${ACCOUNT_ID}] No saved groups selected, extracting from Facebook and posting...`);

            // Signal UI to clear old groups and show processing state
            userLog(`GROUPS_PROCESSING_START`);

            // STEP 1: Kunjungi halaman groups joins SEKALI
            debugLog(`📍 [${ACCOUNT_ID}] Step 1: Navigating to Facebook Groups joins page...`);
            await page.goto('https://www.facebook.com/groups/joins', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            await page.waitForTimeout(5000);

            // STEP 2: Scroll sampai bawah SEKALI
            debugLog(`📜 [${ACCOUNT_ID}] Step 2: Scrolling to load all groups...`);
            await scrollToBottom(page);

            // STEP 3: Extract groups data SEKALI
            debugLog(`🔍 [${ACCOUNT_ID}] Step 3: Extracting group data...`);
            const groups = await extractGroupsData(page);

            if (groups.length === 0) {
                debugLog(`❌ [${ACCOUNT_ID}] No groups found`);
                isProcessRunning = false;
                process.exit(0);
            }

            // Convert to URLs for processing
            targetGroups = groups.map(group => `https://www.facebook.com/groups/${group.id}/buy_sell_discussion`);

            // TAMPILKAN DATA GROUP YANG DI-EXTRACT
            userLog(`\n📋 [${ACCOUNT_ID}] EXTRACTED GROUPS (${groups.length} groups):`);
            debugLog('══════════════════════════════════════════════════════════');
            groups.forEach((group, index) => {
                debugLog(`${index + 1}. ${group.name} (${group.id})`);
            });
            debugLog('══════════════════════════════════════════════════════════\n');

            // Kirim list group ke main process untuk ditampilkan di UI
            userLog(`GROUPS_EXTRACTED:${groups.length}:${JSON.stringify(groups)}`);

            // PERUBAHAN PENTING: LANGSUNG LANJUT TANPA KONFIRMASI
            userLog(`🚀 [${ACCOUNT_ID}] Auto-continuing to group posting...`);

            // Langsung lanjutkan dengan posting ke groups
            await postToAllGroups(page, targetGroups, postData);
        }

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Groups posting error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    }
}

async function postToAllGroups(page, groupLinks, postData) {
    userLog(`\n📤 [${ACCOUNT_ID}] Starting to post to ${groupLinks.length} groups...\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < groupLinks.length; i++) {
        // Check if cancelled
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] Posting cancelled by user at group ${i + 1}/${groupLinks.length}`);

            // Update status untuk group yang belum diposting ketika cancelled
            const groupId = groupLinks[i].split('/groups/')[1]?.split('/')[0] || 'unknown';
            let groupName = 'Unknown Group';
            if (postData.selectedGroups && postData.selectedGroups[i]) {
                groupName = postData.selectedGroups[i].name || 'Unknown Group';
            }

            userLog(`GROUP_STATUS_UPDATE:${groupId}:idle:Posting cancelled by user`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:idle:Posting to group "${groupName}" cancelled\n`);

            break;
        }

        const groupLink = groupLinks[i];
        const groupNumber = i + 1;
        const totalGroups = groupLinks.length;

        // Ekstrak groupId dari link
        const groupId = groupLink.split('/groups/')[1]?.split('/')[0] || 'unknown';

        // Dapatkan group info dari savedGroupsData
        let groupName = 'Unknown Group';
        if (postData.selectedGroups && postData.selectedGroups[i]) {
            groupName = postData.selectedGroups[i].name || 'Unknown Group';
        }

        debugLog(`\n📌 [${ACCOUNT_ID}] GROUP ${groupNumber}/${totalGroups}: ${groupName}`);
        userLog(`🔗 [${ACCOUNT_ID}] ${groupLink}`);
        userLog(`GROUP_POSTING:${groupNumber}/${totalGroups}:${groupLink}`);

        // Send immediate status update that this group is now being processed
        userLog(`GROUP_STATUS_UPDATE:${groupId}:posting:Processing post to group "${groupName}"...`);
        process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:posting:Processing post to group "${groupName}"...\n`);

        try {
            // Kunjungi group
            debugLog(`🌐 [${ACCOUNT_ID}] Navigating to group...`);
            await page.goto(groupLink, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            await page.waitForTimeout(5000);

            // Cek apakah kita bisa mengakses group
            const canAccess = await canAccessGroup(page);
            if (!canAccess) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Cannot access group ${groupNumber}, skipping...`);
                userLog(`GROUP_ERROR:${groupNumber}/${totalGroups}:Cannot access group`);

                // Update status to failed untuk group yang tidak dapat diakses
                userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Group "${groupName}" cannot be accessed`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Group "${groupName}" cannot be accessed\n`);

                failCount++;
                continue;
            }

            // Buat postingan di group dengan mengirimkan group info
            userLog(`📝 [${ACCOUNT_ID}] Creating post in group...`);

            // Update status to posting
            userLog(`🔄 [${ACCOUNT_ID}] Sending posting status update...`);
            userLog(`GROUP_STATUS_UPDATE:${groupId}:posting:Starting post to group "${groupName}"...`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:posting:Starting post to group "${groupName}"...\n`);

            // Send immediate feedback that posting has started for this group
            userLog(`GROUP_POSTING_START:${groupId}:${groupName}`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_POSTING_START:${groupId}:${groupName}\n`);

            // Buat object groupInfo untuk dikirim ke createGroupPost
            const groupInfo = {
                id: groupId,
                name: groupName,
                number: groupNumber,
                total: totalGroups
            };

            debugLog(`🔍 [${ACCOUNT_ID}] About to call createGroupPost for group ${groupNumber}...`);
            const posted = await createGroupPost(page, postData, groupInfo);
            userLog(`📊 [${ACCOUNT_ID}] createGroupPost returned: ${posted} for group ${groupNumber}`);

            if (posted) {
                userLog(`✅ [${ACCOUNT_ID}] Post button clicked successfully for group ${groupNumber}`);
                userLog(`GROUP_STATUS_UPDATE:${groupId}:success:Posting to group "${groupName}" successful!`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:success:Posting to group "${groupName}" successful!\n`);
                successCount++;
            } else {
                debugLog(`❌ [${ACCOUNT_ID}] Failed to post to group ${groupNumber} (ID: ${groupId})`);
                userLog(`GROUP_ERROR:${groupNumber}/${totalGroups}:Posting failed`);
                userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Posting to group "${groupName}" failed`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Posting to group "${groupName}" failed\n`);
                failCount++;
            }

            // Tunggu sebelum group berikutnya
            if (i < groupLinks.length - 1) {
                const delayMin = postData.delayMin || 10;
                const delayMax = postData.delayMax || 120;
                const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
                const waitTime = randomDelay * 1000;

                debugLog(`⏳ [${ACCOUNT_ID}] Waiting ${Math.round(randomDelay)} seconds before next group...`);
                await page.waitForTimeout(waitTime);
            }

            // Rest Time: Setiap N post, rest untuk X detik
            const restCount = postData.restCount || 5;  // default: setiap 5 post
            const restDelay = postData.restDelay || 300;  // default: rest 300 detik (5 menit)

            // Cek apakah sudah mencapai restCount (hanya hitung successful posts)
            if ((successCount % restCount === 0) && (successCount > 0) && (i < groupLinks.length - 1)) {
                userLog(`💤 [${ACCOUNT_ID}] REST TIME: ${successCount} posts completed. Taking a break for ${restDelay} seconds (${Math.round(restDelay / 60)} minutes)...`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:REST_TIME:Started - resting for ${restDelay} seconds after ${successCount} posts\n`);

                // Countdown tiap 30 detik
                const remainingTime = restDelay * 1000;
                const checkInterval = 30000;  // update tiap 30 detik
                let elapsed = 0;

                while (elapsed < remainingTime) {
                    await page.waitForTimeout(Math.min(checkInterval, remainingTime - elapsed));
                    elapsed += Math.min(checkInterval, remainingTime - elapsed);
                    const remainingSecs = Math.round((remainingTime - elapsed) / 1000);
                    userLog(`⏰ [${ACCOUNT_ID}] Rest time remaining: ${remainingSecs} seconds (${Math.round(remainingSecs / 60)} minutes)`);
                }

                userLog(`✅ [${ACCOUNT_ID}] Rest time completed! Resuming posting...`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:REST_TIME:Completed - resuming posting\n`);
            }

        } catch (error) {
            console.error(`❌ [${ACCOUNT_ID}] Error posting to group ${groupNumber}: ${error.message}`);
            userLog(`GROUP_ERROR:${groupNumber}/${totalGroups}:${error.message}`);

            // Update status to failed untuk group yang error
            userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Posting to group "${groupName}" failed - ${error.message}`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Posting to group "${groupName}" failed - ${error.message}\n`);

            failCount++;
            continue;
        }
    }

    // Summary
    userLog(`\n📊 [${ACCOUNT_ID}] POSTING SUMMARY`);
    debugLog('══════════════════════════════════════════');
    userLog(`✅ [${ACCOUNT_ID}] Successful posts: ${successCount}`);
    debugLog(`❌ [${ACCOUNT_ID}] Failed posts: ${failCount}`);
    userLog(`📊 [${ACCOUNT_ID}] Success rate: ${Math.round((successCount / groupLinks.length) * 100)}%`);
    if (isCancelled) {
        userLog(`⏹️ [${ACCOUNT_ID}] Posting was cancelled by user`);
    }
    debugLog('══════════════════════════════════════════\n');

    if (isCancelled) {
        userLog(`⏹️ [${ACCOUNT_ID}] GROUPS_PROCESS_CANCELLED`);
    } else {
        userLog(`🎉 [${ACCOUNT_ID}] GROUPS_PROCESS_COMPLETED`);
    }
    isProcessRunning = false;
}

async function canAccessGroup(page) {
    try {
        // Cek apakah ada elemen yang menunjukkan kita bisa posting
        const indicators = [
            'div[role="button"]:has-text("Write something")',
            'div[role="button"]:has-text("Write something...")',
            'span:has-text("Write something")',
            'div[aria-label*="Create a post"]'
        ];

        for (const selector of indicators) {
            const element = await page.locator(selector).first();
            if (await element.count() > 0) {
                return true;
            }
        }

        return false;
    } catch {
        return false;
    }
}

async function scrollToBottom(page) {
    debugLog('⬇️ Scrolling to bottom...');

    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    let scrollCount = 0;
    const maxScrolls = 8;

    while (scrollCount < maxScrolls && previousHeight !== currentHeight) {
        previousHeight = currentHeight;

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        await page.waitForTimeout(2000 + Math.random() * 2000);

        currentHeight = await page.evaluate(() => document.body.scrollHeight);
        scrollCount++;

        // [browser] debugLog(`  📏 Scroll ${scrollCount}/${maxScrolls}, Height: ${currentHeight}px`);
    }

    userLog(`✅ Finished scrolling after ${scrollCount} scrolls`);
}

async function extractGroupsData(page) {
    debugLog('🔗 Extracting groups data from "Preview of a group" section...');

    const groups = await page.evaluate(() => {
        const groupsObj = {};

        // Temukan kontainer utama yang berisi daftar grup
        const groupPreviewSection = document.querySelector('[aria-label="Preview of a group"]');

        if (!groupPreviewSection) {
            // [browser] debugLog('❌ Tidak ditemukan section "Preview of a group"');
            return [];
        }

        // Cari semua item grup dalam section tersebut
        const groupItems = groupPreviewSection.querySelectorAll('[role="listitem"]');

        // [browser] debugLog(`📊 Found ${groupItems.length} group items in Preview section`);

        groupItems.forEach((item, index) => {
            // Cari link grup utama dalam item
            const groupLinks = item.querySelectorAll('[role="main"] [role="list"] a[href*="/groups/"]');

            groupLinks.forEach(a => {
                const link = a.href.split('?')[0]; // hapus parameter

                // Ambil ID group: angka setelah /groups/
                const match = link.match(/\/groups\/(\d+)/);

                if (match) {
                    const groupId = match[1];

                    // Coba ambil nama grup dengan strategi yang lebih robust
                    let groupName = '';

                    // STRATEGI 1: Dari elemen <a> itu sendiri - cari teks yang paling mungkin
                    const allTexts = [];

                    // Kumpulkan semua teks dari elemen <a> dan children-nya
                    const collectTexts = (element) => {
                        // Skip elemen yang berisi waktu/status
                        if (element.textContent.includes('last visited') ||
                            element.textContent.includes('View group') ||
                            element.textContent.includes('ago') ||
                            element.textContent.match(/\d+\s*(minute|hour|day)s?\s*ago/i)) {
                            return;
                        }

                        // Ambil teks langsung dari elemen (tapi bukan dari children)
                        if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
                            const text = element.textContent.trim();
                            if (text && text.length > 2 && !text.includes('View group')) {
                                allTexts.push(text);
                            }
                        }

                        // Rekursif untuk children
                        element.childNodes.forEach(child => {
                            if (child.nodeType === Node.ELEMENT_NODE) {
                                collectTexts(child);
                            }
                        });
                    };

                    collectTexts(a);

                    // Pilih teks terpanjang (biasanya nama grup)
                    if (allTexts.length > 0) {
                        groupName = allTexts.reduce((longest, current) =>
                            current.length > longest.length ? current : longest
                            , '');
                    }

                    // STRATEGI 2: Jika tidak ditemukan, coba dari struktur HTML umum Facebook
                    if (!groupName) {
                        // Coba cari elemen dengan teks yang kemungkinan nama grup
                        // Biasanya nama grup ada dalam span dengan dir="auto" atau teks bold
                        const possibleNameElements = a.querySelectorAll('span, div, h1, h2, h3, h4, h5, h6');
                        for (const el of possibleNameElements) {
                            const text = el.textContent.trim();
                            // Kriteria untuk kemungkinan nama grup:
                            // 1. Panjang minimal 3 karakter
                            // 2. Tidak mengandung kata-kata umum Facebook
                            // 3. Tidak berisi waktu/tanggal
                            // 4. Tidak hanya angka
                            if (text.length >= 3 &&
                                !text.includes('View group') &&
                                !text.includes('last visited') &&
                                !text.match(/^\d+\s*(minute|hour|day)s?\s*ago$/i) &&
                                !text.match(/^\d+[mhd]$/i) &&
                                !text.match(/^\d+$/)) {

                                groupName = text;
                                break;
                            }
                        }
                    }

                    // STRATEGI 3: Dari aria-label di SVG atau elemen gambar
                    if (!groupName) {
                        const svg = a.querySelector('svg[aria-label]');
                        if (svg) {
                            groupName = svg.getAttribute('aria-label').trim();
                        }
                    }

                    // STRATEGI 4: Coba dari parent container (terkadang nama grup di luar link)
                    if (!groupName) {
                        const parentContainer = a.closest('div[role="listitem"]');
                        if (parentContainer) {
                            // Ambil semua teks dari container, lalu filter
                            const allContainerText = parentContainer.textContent;
                            const lines = allContainerText.split('\n').map(line => line.trim()).filter(line => line);

                            for (const line of lines) {
                                if (line.length >= 3 &&
                                    !line.includes('View group') &&
                                    !line.includes('last visited') &&
                                    !line.match(/^\d+\s*(minute|hour|day)s?\s*ago$/i) &&
                                    !line.match(/^You\s/) &&
                                    line !== 'Sort') {

                                    groupName = line;
                                    break;
                                }
                            }
                        }
                    }

                    // Bersihkan nama grup
                    if (groupName) {
                        // Hapus informasi waktu dan teks Facebook umum
                        groupName = groupName
                            .replace(/You last visited.*/i, '')
                            .replace(/View group/i, '')
                            .replace(/^\s*Welcome to\s*/i, '')
                            .replace(/\s*Mark as read\s*$/i, '')
                            .replace(/\s*\d+\s*(minute|hour|day)s?\s*ago/gi, '')
                            .replace(/\s*mentioned you.*/i, '')
                            .replace(/^\s*Unread\s*/i, '');

                        // Hapus karakter spesial di awal/akhir
                        groupName = groupName.replace(/^[^\w&]+|[^\w&]+$/g, '');

                        // Hapus spasi berlebihan
                        groupName = groupName.replace(/\s+/g, ' ').trim();

                        // Jika masih ada informasi waktu di akhir, hapus
                        if (groupName.match(/\d+\s*(m|h|d)$/)) {
                            groupName = groupName.replace(/\s*\d+\s*(m|h|d)$/, '').trim();
                        }
                    }

                    // Validasi akhir nama grup
                    if (groupName &&
                        groupName.length >= 3 &&
                        !groupName.match(/^\d+$/) && // bukan hanya angka
                        !groupName.includes('View group') &&
                        !groupName.includes('last visited') &&
                        !groupName.match(/^\d+\s*(minute|hour|day)/i)) {

                        if (!groupsObj[groupId]) {
                            groupsObj[groupId] = groupName;
                            console.log(`📝 Extracted group [${index + 1}]: "${groupName}" (ID: ${groupId})`);
                        }
                    } else {
                        // [browser] debugLog(`⚠️  Could not extract valid name for group ID: ${groupId}`);
                        // [browser] debugLog(`   Raw name found: "${groupName}"`);
                    }
                }
            });
        });

        // Ubah object jadi array dengan dateAdded
        const currentDate = new Date().toISOString();
        const uniqueGroups = Object.entries(groupsObj).map(([id, name]) => ({
            id: id,
            name: name,
            dateAdded: currentDate
        }));

        return uniqueGroups;
    });

    userLog(`✅ Total unique groups extracted: ${groups.length}`);

    // Debug: tampilkan semua grup yang ditemukan
    groups.forEach((group, i) => {
        debugLog(`${i + 1}. ${group.name} (${group.id})`);
    });

    return groups;
}

async function createGroupPost(page, postData, groupInfo) {
    debugLog('📝 Creating post in group...');

    // Ambil groupId dari parameter groupInfo
    const groupId = groupInfo?.id || 'unknown';
    const groupName = groupInfo?.name || 'Unknown Group';

    try {
        await page.waitForTimeout(3000);

        // ========== UPDATE STATUS: MEMULAI POSTING ==========
        userLog(`🔄 [${ACCOUNT_ID}] Starting post creation for group "${groupName}"...`);

        // ========== STEP 1: Cari dan klik tombol "Write something..." ==========
        debugLog('🔍 STEP 1: Looking for "Write something..." button...');

        let composerFound = false;

        // Metode 1: JavaScript query langsung
        const foundViaJS = await page.evaluate(() => {
            try {
                const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                for (const button of buttons) {
                    if (button.innerText && button.innerText.includes('Write something')) {
                        button.click();
                        return true;
                    }
                }
                return false;
            } catch (error) {
                console.error('JS error:', error);
                return false;
            }
        });

        if (foundViaJS) {
            debugLog('✅ Found and clicked "Write something..." via JavaScript');
            composerFound = true;
        } else {
            // Metode 2: Playwright locator
            debugLog('🔄 Trying Playwright method...');
            const writeSomethingButtons = await page.locator('div[role="button"]').all();

            for (const button of writeSomethingButtons) {
                try {
                    const text = await button.textContent();
                    if (text && text.includes('Write something')) {
                        await button.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(1000);
                        await button.click({ delay: 200 });
                        debugLog('✅ Found and clicked "Write something..." via Playwright');
                        composerFound = true;
                        break;
                    }
                } catch {
                    continue;
                }
            }
        }

        if (!composerFound) {
            debugLog('❌ "Write something..." button not found');

            // ========== UPDATE STATUS: GAGAL ==========
            userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Could not find "Write something..." button`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Could not find "Write something..." button untuk group "${groupName}"\n`);

            return false;
        }

        // Tunggu composer terbuka SEBELUM lanjut ke step berikutnya
        debugLog('⏳ Waiting for composer to open (5 seconds)...');
        await page.waitForTimeout(5000);

        // ========== STEP 2: Upload files jika ada (max 10 files) ==========
        if (postData.filePaths && Array.isArray(postData.filePaths) && postData.filePaths.length > 0) {
            debugLog(`🖼️ STEP 2: Uploading ${postData.filePaths.length} file(s)...`);

            // Filter hanya files yang exists
            const existingFiles = postData.filePaths.filter(filePath => fs.existsSync(filePath));

            if (existingFiles.length !== postData.filePaths.length) {
                debugLog(`⚠️ ${postData.filePaths.length - existingFiles.length} file(s) not found, uploading ${existingFiles.length} file(s)`);
            }

            if (existingFiles.length > 0) {
                let filesUploaded = false;

                // Tunggu lebih lama untuk memastikan composer terbuka
                await page.waitForTimeout(2000);

                // Upload files - handle single file differently
                if (existingFiles.length === 1) {
                    debugLog(`📎 Uploading single file: ${existingFiles[0]}`);
                    filesUploaded = await uploadSingleFile(page, existingFiles[0]);
                } else {
                    // Upload multiple files
                    filesUploaded = await uploadFileInGroup(page, existingFiles);
                }

                if (!filesUploaded) {
                    debugLog('⚠️ Could not upload files, continuing without files');
                } else {
                    userLog(`✅ Successfully uploaded ${existingFiles.length} file(s)`);
                }
            } else {
                debugLog('📝 No valid files to upload');
            }

            // Tunggu SEBELUM lanjut ke step berikutnya
            await page.waitForTimeout(2000);
        } else {
            debugLog('📝 No files to upload');
        }

        // ========== STEP 3: Isi caption ==========
        debugLog('✏️ STEP 3: Filling caption...');

        // Tunggu sebentar sebelum mencari editor
        await page.waitForTimeout(2000);

        const editorSelectors = [
            'div[aria-placeholder*="Create a public post"]',
            'div[contenteditable="true"][aria-placeholder*="Create a public post"]',
            'div[contenteditable="true"][role="textbox"]'
        ];

        let editorFound = false;
        let editor = null;

        for (const selector of editorSelectors) {
            try {
                editor = await page.locator(selector).first();
                if (await editor.count() > 0) {
                    debugLog(`✅ Found editor: ${selector}`);
                    editorFound = true;
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        if (!editorFound || !editor) {
            debugLog('❌ Editor not found');

            // ========== UPDATE STATUS: GAGAL ==========
            userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Could not find text editor`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Could not find text editor untuk group "${groupName}"\n`);

            return false;
        }

        // Focus editor
        await editor.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);

        const editorBox = await editor.boundingBox();
        if (editorBox) {
            await page.mouse.move(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 2);
            await page.waitForTimeout(500);
            await page.mouse.click(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 2, { delay: 200 });
        } else {
            await editor.click({ delay: 250 });
        }

        debugLog('✅ Editor focused');

        // Tunggu SEBELUM mengetik
        await page.waitForTimeout(2000);

        // Clear text
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.waitForTimeout(300);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);

        // Apply spin text if hasSpintax flag is true
        let text = postData.text + '  '; // Selalu tambah 2 spasi di akhir
        if (postData.hasSpintax) {
            text = spinText(postData.text) + '  ';
            debugLog(`🎲 Spin text applied: "${postData.text}" → "${text.trim()}"`);
        }

        // ⚡ FAST TYPING - tetap cepat untuk typing
        debugLog(`⌨️ Fast typing caption (${text.length} chars)...`);
        const chunkSize = 100;  // Chunk besar untuk typing cepat

        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.substring(i, Math.min(i + chunkSize, text.length));
            await page.keyboard.type(chunk, { delay: 5 + Math.random() * 10 });  // ⚡ 5-15ms per karakter (CEPAT)
        }

        debugLog('✅ Caption typed');
        await page.waitForTimeout(2000);

        // ========== STEP 4: Klik tombol Post ==========
        debugLog('🔍 STEP 4: Looking for Post button...');

        // Tunggu sebentar sebelum mencari tombol Post
        await page.waitForTimeout(2000);

        const postButtonFound = await clickPostButton(page);

        if (!postButtonFound) {
            debugLog('❌ Post button not found, trying Enter key...');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000);

            const composerVisible = await page.locator('div[contenteditable="true"][role="textbox"]').first().count();
            if (composerVisible === 0) {
                debugLog('✅ Post published with Enter key');
                postButtonFound = true;

                // ========== UPDATE STATUS: SUKSES ==========
                userLog(`🎉 [${ACCOUNT_ID}] Posting successful with Enter key`);
                userLog(`GROUP_STATUS_UPDATE:${groupId}:success:Posting to group "${groupName}" successful!`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:success:Posting to group "${groupName}" successful!\n`);
            }
        }

        // Tunggu SEBELUM selesai
        await page.waitForTimeout(3000);

        if (postButtonFound) {
            // ========== UPDATE STATUS: SUKSES ==========
            userLog(`🎉 [${ACCOUNT_ID}] Posting successful`);
            userLog(`GROUP_STATUS_UPDATE:${groupId}:success:Posting to group "${groupName}" successful!`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:success:Posting to group "${groupName}" successful!\n`);
        } else {
            // ========== UPDATE STATUS: GAGAL ==========
            debugLog(`❌ [${ACCOUNT_ID}] Posting failed`);
            userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Failed to post to group "${groupName}"`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Failed to post to group "${groupName}"\n`);
        }

        return postButtonFound;

    } catch (error) {
        console.error(`❌ Error creating group post: ${error.message}`);

        // ========== UPDATE STATUS: ERROR ==========
        debugLog(`❌ [${ACCOUNT_ID}] Error during posting`);
        userLog(`GROUP_STATUS_UPDATE:${groupId}:error:Error - ${error.message}`);
        process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:error:Error - ${error.message}\n`);

        return false;
    }
}

// ========== FUNGSI BARU: Upload multiple files di group (max 10) ==========
async function uploadFileInGroup(page, filePaths) {
    debugLog(`📤 Uploading ${filePaths.length} file(s) in group...`);

    try {
        // Jika tidak ada file, return true (tidak ada yang perlu diupload)
        if (!filePaths || filePaths.length === 0) {
            debugLog('📝 No files to upload');
            return true;
        }

        // Pastikan maksimal 10 files
        const limitedFiles = filePaths.slice(0, 10);
        if (filePaths.length > 10) {
            debugLog(`⚠️ Limiting to 10 files (received ${filePaths.length})`);
        }

        debugLog(`📎 Will upload ${limitedFiles.length} file(s)`);

        // Method 1: Cari langsung input file tanpa klik tombol terlebih dahulu
        debugLog('🔍 Looking for file input directly...');

        // Tunggu sebentar untuk memastikan composer fully loaded
        await page.waitForTimeout(3000);

        // Cari semua input file
        const fileInputs = await page.locator('input[type="file"]').all();
        debugLog(`Found ${fileInputs.length} file inputs`);

        if (fileInputs.length > 0) {
            // Gunakan input file pertama yang ditemukan
            const fileInput = fileInputs[0];

            // Periksa jika file input visible
            const isVisible = await fileInput.isVisible();

            if (isVisible) {
                debugLog('✅ Found visible file input');

                try {
                    // Upload multiple files sekaligus ke input file
                    await fileInput.setInputFiles(limitedFiles);
                    userLog(`✅ ${limitedFiles.length} file(s) uploaded successfully`);

                    // Tunggu upload selesai (reduced for faster execution)
                    const waitTime = Math.min(2000 + (limitedFiles.length * 500), 8000); // Reduced from 8-20s to 2-8s
                    debugLog(`⏳ Fast waiting for file upload (${waitTime / 1000} seconds)...`);
                    await page.waitForTimeout(waitTime);

                    // Verifikasi upload berhasil dengan mencari preview
                    const previewSelectors = [
                        'img[src*="blob:"]',
                        'img[src*="data:"]',
                        'div[data-testid*="media-attachment"]',
                        'div[aria-label*="Remove"]',
                        'div[role="button"][aria-label*="Remove"]',
                        'div[aria-label*="Photo"]',
                        'div[aria-label*="Video"]'
                    ];

                    let previewCount = 0;
                    for (const selector of previewSelectors) {
                        const previews = await page.locator(selector).all();
                        previewCount += previews.length;
                    }

                    if (previewCount >= limitedFiles.length) {
                        debugLog(`✅ Found ${previewCount} media previews, upload successful`);
                        return true;
                    } else if (previewCount > 0) {
                        debugLog(`⚠️ Found ${previewCount} previews but expected ${limitedFiles.length}, upload might be partial`);
                        return true;
                    }

                    debugLog('⚠️ No previews found, but files might be uploaded');
                    return true;

                } catch (uploadError) {
                    console.error(`❌ Error uploading files: ${uploadError.message}`);

                    // Method 2: Try alternative approach - upload satu per satu
                    debugLog('🔄 Trying alternative method - upload one by one...');
                    return await uploadFilesAlternativeMethod(page, limitedFiles);
                }
            } else {
                debugLog('⚠️ File input found but not visible, trying alternative method...');
                return await uploadFilesAlternativeMethod(page, limitedFiles);
            }
        } else {
            debugLog('❌ No file inputs found, trying to find upload button...');
            return await uploadFilesAlternativeMethod(page, limitedFiles);
        }

    } catch (error) {
        console.error(`❌ Upload files error: ${error.message}`);
        return false;
    }
}

// ========== FUNGSI BARU: Upload single file dengan handling khusus ==========
async function uploadSingleFile(page, filePath) {
    debugLog(`📤 Uploading single file: ${filePath.split('/').pop() || filePath.split('\\').pop()}`);

    try {
        // Pastikan file exists
        if (!fs.existsSync(filePath)) {
            debugLog('❌ File does not exist');
            return false;
        }

        // GUNAKAN LOGIKA YANG SAMA DENGAN MULTIPLE FILES
        // Method 1: Cari langsung input file tanpa klik tombol terlebih dahulu
        debugLog('🔍 Looking for file input directly...');

        // Tunggu sebentar untuk memastikan composer fully loaded
        await page.waitForTimeout(3000);

        // Cari semua input file
        const fileInputs = await page.locator('input[type="file"]').all();
        debugLog(`Found ${fileInputs.length} file inputs`);

        if (fileInputs.length > 0) {
            // Gunakan input file pertama yang ditemukan
            const fileInput = fileInputs[0];

            // Periksa jika file input visible
            const isVisible = await fileInput.isVisible();

            if (isVisible) {
                debugLog('✅ Found visible file input');

                try {
                    // Upload single file sebagai array (SAMA PERSIS dengan multiple files)
                    await fileInput.setInputFiles([filePath]); // ← SAMA dengan multiple files!
                    userLog(`✅ Single file uploaded successfully via direct method`);

                    // Tunggu upload selesai (reduced for faster execution)
                    const waitTime = 2000; // Reduced from 8s to 2s
                    debugLog(`⏳ Fast waiting for single file upload (${waitTime / 1000} seconds)...`);
                    await page.waitForTimeout(waitTime);

                    // Verifikasi upload berhasil dengan mencari preview (SAMA dengan multiple files)
                    const previewSelectors = [
                        'img[src*="blob:"]',
                        'img[src*="data:"]',
                        'div[data-testid*="media-attachment"]',
                        'div[aria-label*="Remove"]',
                        'div[role="button"][aria-label*="Remove"]',
                        'div[aria-label*="Photo"]',
                        'div[aria-label*="Video"]'
                    ];

                    let previewCount = 0;
                    for (const selector of previewSelectors) {
                        const previews = await page.locator(selector).all();
                        previewCount += previews.length;
                    }

                    if (previewCount >= 1) {
                        debugLog(`✅ Found ${previewCount} media preview(s), single file upload successful`);
                        return true;
                    } else if (previewCount > 0) {
                        debugLog(`⚠️ Found ${previewCount} previews but expected 1, upload might be partial`);
                        return true;
                    }

                    debugLog('⚠️ No previews found, but file might be uploaded');
                    return true;

                } catch (uploadError) {
                    console.error(`❌ Error uploading single file: ${uploadError.message}`);
                    // Method 2: Try alternative approach - upload satu per satu (SAMA dengan multiple files)
                    debugLog('🔄 Trying alternative method - upload single file one by one...');
                    return await uploadFilesAlternativeMethod(page, [filePath]);
                }
            } else {
                debugLog('⚠️ File input found but not visible, trying alternative method...');
                return await uploadFilesAlternativeMethod(page, [filePath]); // ← GUNAKAN multiple method untuk single file
            }
        } else {
            debugLog('❌ No file inputs found, trying to find upload button...');
            return await uploadFilesAlternativeMethod(page, [filePath]); // ← GUNAKAN multiple method untuk single file
        }

    } catch (error) {
        console.error(`❌ Upload single file error: ${error.message}`);
        return false;
    }
}

// ========== FUNGSI BARU: Alternative method untuk upload single file ==========
async function uploadSingleFileAlternative(page, filePaths) {
    debugLog(`🔄 Trying alternative method for single file: ${filePaths[0].split('/').pop() || filePaths[0].split('\\').pop()}`);

    try {
        // Method: Klik tombol upload photo/video terlebih dahulu
        const uploadButtonSelectors = [
            'div[role="button"][aria-label*="Photo"]',
            'div[role="button"][aria-label*="Video"]',
            'div[role="button"][aria-label*="photo"]',
            'div[role="button"][aria-label*="video"]',
            'div[aria-label*="Photo/video"]',
            'div[aria-label*="Add photos"]',
            'div[aria-label*="Add photo"]',
            'div[aria-label*="Photo"]',
            'div[data-pagelet*="ComposerPhotoButton"]',
            'div[data-pagelet*="ComposerVideoButton"]'
        ];

        let buttonClicked = false;

        for (const selector of uploadButtonSelectors) {
            try {
                const uploadButton = await page.locator(selector).first();
                if (await uploadButton.count() > 0) {
                    const isVisible = await uploadButton.isVisible();
                    if (isVisible) {
                        debugLog(`✅ Found upload button: ${selector}`);

                        // Klik tombol upload
                        await uploadButton.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(1000);
                        await uploadButton.click({ delay: 200 });
                        debugLog('✅ Clicked upload button for single file');

                        buttonClicked = true;
                        break;
                    }
                }
            } catch (buttonError) {
                continue;
            }
        }

        if (!buttonClicked) {
            debugLog('⚠️ No upload button found, trying direct file input...');
        }

        // Tunggu dialog upload muncul atau input file tersedia
        await page.waitForTimeout(3000);

        // Sekarang cari input file yang muncul setelah klik
        for (let attempt = 1; attempt <= 5; attempt++) {
            debugLog(`🔍 Looking for file input (attempt ${attempt})...`);

            // Cari input file yang baru muncul
            const fileInputs = await page.locator('input[type="file"]').all();

            if (fileInputs.length > 0) {
                const fileInput = fileInputs[fileInputs.length - 1]; // Gunakan yang terakhir

                try {
                    // Upload file (harus dalam array)
                    await fileInput.setInputFiles(filePaths);
                    debugLog('✅ Single file uploaded via alternative method');

                    // Tunggu upload selesai
                    await page.waitForTimeout(8000);

                    return true;
                } catch (uploadError) {
                    console.error(`❌ Upload failed on attempt ${attempt}: ${uploadError.message}`);
                    await page.waitForTimeout(1000);
                    continue;
                }
            }

            await page.waitForTimeout(2000);
        }

        // Method 3: Gunakan JavaScript untuk trigger file input
        debugLog('⚡ Trying JavaScript method to upload single file...');
        const uploadedViaJS = await page.evaluate((filePaths) => {
            try {
                // Coba cari elemen upload button dan click untuk membuka dialog
                const buttons = document.querySelectorAll('div[role="button"], button');
                for (const button of buttons) {
                    const ariaLabel = button.getAttribute('aria-label') || '';
                    const text = button.textContent || '';

                    if (ariaLabel.toLowerCase().includes('photo') ||
                        ariaLabel.toLowerCase().includes('video') ||
                        text.toLowerCase().includes('photo') ||
                        text.toLowerCase().includes('video') ||
                        text.toLowerCase().includes('add media')) {

                        button.click();
                        return true;
                    }
                }

                return false;
            } catch (error) {
                console.error('JS upload error:', error);
                return false;
            }
        }, filePaths);

        if (uploadedViaJS) {
            debugLog('✅ JavaScript triggered upload dialog for single file');
            // Tunggu sebentar untuk upload
            await page.waitForTimeout(8000);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`❌ Alternative upload failed: ${error.message}`);
        return false;
    }
}

async function uploadFilesAlternativeMethod(page, filePaths) {
    debugLog(`🔄 Trying alternative upload method for ${filePaths.length} files...`);
    userLog(`📤 Uploading ${filePaths.length} file(s) at once...`);

    try {
        // Validate all files exist first
        const validFiles = filePaths.filter(filePath => {
            if (fs.existsSync(filePath)) {
                return true;
            }
            debugLog(`⚠️ File not found: ${filePath}`);
            return false;
        });

        if (validFiles.length === 0) {
            debugLog('❌ No valid files to upload');
            return false;
        }

        // Method: Cari dan klik tombol upload, lalu cari input file
        const uploadButtonSelectors = [
            'div[role="button"][aria-label*="Photo"]',
            'div[role="button"][aria-label*="Video"]',
            'div[role="button"][aria-label*="photo"]',
            'div[role="button"][aria-label*="video"]',
            'div[aria-label*="Photo/video"]',
            'div[aria-label*="Add photos"]',
            'div[aria-label*="Add photo"]',
            'div[aria-label*="Photo"]',
            'div[data-pagelet*="ComposerPhotoButton"]',
            'div[data-pagelet*="ComposerVideoButton"]'
        ];

        for (const selector of uploadButtonSelectors) {
            try {
                const uploadButton = await page.locator(selector).first();
                if (await uploadButton.count() > 0) {
                    const isVisible = await uploadButton.isVisible();
                    if (isVisible) {
                        debugLog(`✅ Found upload button: ${selector}`);

                        // Klik tombol upload
                        await uploadButton.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(1000);
                        debugLog('✅ Ready to upload');

                        // Tunggu dialog upload muncul
                        await page.waitForTimeout(2000);

                        // Sekarang cari input file yang muncul setelah klik
                        for (let attempt = 1; attempt <= 5; attempt++) {
                            debugLog(`🔍 Looking for file input (attempt ${attempt})...`);

                            // Cari input file yang baru muncul
                            const fileInputs = await page.locator('input[type="file"]').all();

                            if (fileInputs.length > 0) {
                                const fileInput = fileInputs[fileInputs.length - 1]; // Gunakan yang terakhir

                                try {
                                    // ✅ UPLOAD ALL FILES AT ONCE (bukan satu per satu!)
                                    await fileInput.setInputFiles(validFiles);
                                    userLog(`✅ ${validFiles.length} file(s) uploaded at once!`);

                                    // Tunggu upload selesai (faster)
                                    const waitTime = Math.min(3000 + (validFiles.length * 500), 10000);
                                    debugLog(`⏳ Waiting for upload (${waitTime / 1000} seconds)...`);
                                    await page.waitForTimeout(waitTime);

                                    return true;
                                } catch (uploadError) {
                                    console.error(`❌ Upload failed on attempt ${attempt}: ${uploadError.message}`);
                                    await page.waitForTimeout(1000);
                                    continue;
                                }
                            }

                            await page.waitForTimeout(1500);
                        }
                    }
                }
            } catch (buttonError) {
                continue;
            }
        }

        // Fallback: If button method fails, try direct file input
        debugLog('🔄 Trying direct file input method...');
        const fileInputs = await page.locator('input[type="file"]').all();
        if (fileInputs.length > 0) {
            try {
                const fileInput = fileInputs[0];
                await fileInput.setInputFiles(validFiles);
                userLog(`✅ ${validFiles.length} file(s) uploaded via direct input!`);
                await page.waitForTimeout(Math.min(3000 + (validFiles.length * 500), 10000));
                return true;
            } catch (directError) {
                debugLog(`❌ Direct input failed: ${directError.message}`);
            }
        }

        debugLog('❌ All upload methods failed');
        return false;

    } catch (error) {
        console.error(`❌ Alternative upload failed: ${error.message}`);
        return false;
    }
}

async function uploadSingleFileAlternative(page, filePath) {
    debugLog('🔄 Trying alternative upload method for single file...');

    try {
        // Method: Cari dan klik tombol upload, lalu cari input file
        const uploadButtonSelectors = [
            'div[role="button"][aria-label*="Photo"]',
            'div[role="button"][aria-label*="Video"]',
            'div[role="button"][aria-label*="photo"]',
            'div[role="button"][aria-label*="video"]',
            'div[aria-label*="Photo/video"]',
            'div[aria-label*="Add photos"]',
            'div[aria-label*="Add photo"]',
            'div[aria-label*="Photo"]',
            'div[data-pagelet*="ComposerPhotoButton"]',
            'div[data-pagelet*="ComposerVideoButton"]'
        ];

        for (const selector of uploadButtonSelectors) {
            try {
                const uploadButton = await page.locator(selector).first();
                if (await uploadButton.count() > 0) {
                    const isVisible = await uploadButton.isVisible();
                    if (isVisible) {
                        debugLog(`✅ Found upload button: ${selector}`);

                        // Klik tombol upload
                        await uploadButton.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(1000);
                        // await uploadButton.click({ delay: 200 });
                        debugLog('✅ Clicked upload button');

                        // Tunggu dialog upload muncul
                        await page.waitForTimeout(3000);

                        // Sekarang cari input file yang muncul setelah klik
                        for (let attempt = 1; attempt <= 5; attempt++) {
                            debugLog(`🔍 Looking for file input (attempt ${attempt})...`);

                            // Cari input file yang baru muncul
                            const fileInputs = await page.locator('input[type="file"]').all();

                            if (fileInputs.length > 0) {
                                const fileInput = fileInputs[fileInputs.length - 1]; // Gunakan yang terakhir

                                try {
                                    // Upload file (harus dalam array)
                                    await fileInput.setInputFiles([filePath]);
                                    debugLog('✅ File uploaded via alternative method');

                                    // Tunggu upload selesai
                                    await page.waitForTimeout(6000);

                                    return true;
                                } catch (uploadError) {
                                    console.error(`❌ Upload failed on attempt ${attempt}: ${uploadError.message}`);
                                    await page.waitForTimeout(1000);
                                    continue;
                                }
                            }

                            await page.waitForTimeout(2000);
                        }
                    }
                }
            } catch (buttonError) {
                continue;
            }
        }

        // Method 3: Gunakan JavaScript untuk trigger file input
        debugLog('⚡ Trying JavaScript method to upload file...');
        const uploadedViaJS = await page.evaluate((filePath) => {
            try {
                // Cari semua input file
                const fileInputs = document.querySelectorAll('input[type="file"]');

                if (fileInputs.length > 0) {
                    // Coba gunakan input file pertama
                    const fileInput = fileInputs[0];

                    // Trigger click pada file input
                    fileInput.click();

                    // Note: Kita tidak bisa langsung set value karena security restrictions
                    // Browser akan menampilkan file dialog
                    return true;
                }

                // Coba cari elemen upload button dan click
                const buttons = document.querySelectorAll('div[role="button"], button');
                for (const button of buttons) {
                    const ariaLabel = button.getAttribute('aria-label') || '';
                    const text = button.textContent || '';

                    if (ariaLabel.toLowerCase().includes('photo') ||
                        ariaLabel.toLowerCase().includes('video') ||
                        text.toLowerCase().includes('photo') ||
                        text.toLowerCase().includes('video') ||
                        text.toLowerCase().includes('add media')) {

                        button.click();
                        return true;
                    }
                }

                return false;
            } catch (error) {
                console.error('JS upload error:', error);
                return false;
            }
        }, filePath);

        if (uploadedViaJS) {
            debugLog('✅ JavaScript triggered upload dialog');
            // User perlu memilih file manual di dialog
            await page.waitForTimeout(5000);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`❌ Alternative upload failed: ${error.message}`);
        return false;
    }
}

// ========== FUNGSI VERIFIKASI STATUS POSTING ==========
// Verifikasi apakah posting benar-benar muncul di group setelah posting
async function verifyGroupPost(page, groupLink, postData) {
    debugLog(`🔍 [VERIFICATION START] === VERIFICATION FUNCTION CALLED ===`);
    debugLog(`🔍 [VERIFICATION START] Verifying group post for: ${groupLink}`);
    debugLog(`🔍 [VERIFICATION DATA] Post text: "${postData.text || 'NO TEXT'}"`);
    debugLog(`🔍 [VERIFICATION DATA] Has files: ${!!postData.filePaths && postData.filePaths.length > 0}`);
    debugLog(`🔍 [VERIFICATION START] === STARTING VERIFICATION PROCESS ===`);

    try {
        // Tunggu beberapa detik untuk memastikan posting diproses
        await page.waitForTimeout(3000);

        // Navigasi ke halaman group untuk verifikasi
        debugLog(`📍 Navigating to group page for verification...`);
        await page.goto(groupLink, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Tunggu group page load
        await page.waitForTimeout(5000);

        // Cari postingan yang baru saja dibuat
        const postFound = await page.evaluate((captionText) => {
            // Note: No debugLog/userLog here - they don't work in browser context

            // Cari semua postingan di group
            const posts = document.querySelectorAll('[data-pagelet="FeedUnit_0"], [data-pagelet*="FeedUnit"], [role="article"]');

            for (let i = 0; i < Math.min(posts.length, 5); i++) { // Cek 5 posting teratas saja
                const post = posts[i];

                try {
                    // Cari teks dalam postingan
                    const postText = post.textContent || '';
                    const postTextLower = postText.toLowerCase();
                    const captionLower = captionText.toLowerCase();

                    // Cek apakah caption ada dalam postingan (minimal 70% match untuk handle variasi)
                    const words = captionLower.split(' ');
                    let matchCount = 0;

                    for (const word of words) {
                        if (word.length > 2 && postTextLower.includes(word)) {
                            matchCount++;
                        }
                    }

                    const matchPercentage = words.length > 0 ? (matchCount / words.length) * 100 : 0;

                    if (matchPercentage >= 70) { // 70% match cukup untuk verifikasi
                        return { found: true, matchPercentage };
                    }

                    // Alternatif: Cek apakah ada gambar jika posting ada gambar
                    const hasImages = post.querySelectorAll('img[src*="blob"], img[src*="data"], img[alt*="photo"]').length > 0;
                    if (hasImages && captionText.trim() === '') {
                        return { found: true, hasImages: true };
                    }

                } catch (e) {
                    // Skip error, continue to next post
                }
            }

            return { found: false, postsChecked: Math.min(posts.length, 5) };

        }, postData.text || '');

        if (postFound && postFound.found) {
            if (postFound.matchPercentage) {
                userLog(`✅ VERIFICATION SUCCESS: Post confirmed in group feed (${postFound.matchPercentage.toFixed(1)}% match)`);
            } else if (postFound.hasImages) {
                userLog(`✅ VERIFICATION SUCCESS: Post with images confirmed in group feed`);
            } else {
                userLog(`✅ VERIFICATION SUCCESS: Post confirmed in group feed`);
            }
            return true;
        } else {
            debugLog(`❌ VERIFICATION FAILED: Post not found in group feed (checked ${postFound?.postsChecked || 0} posts)`);
            return false;
        }

    } catch (error) {
        console.error(`❌ Error during post verification: ${error.message}`);
        return false;
    }
}

// ========== FUNGSI BARU: Klik tombol Post ==========
async function clickPostButton(page) {
    debugLog('🔍 Looking for Post button...');

    // Try multiple methods to find and click the Post button
    const methods = [
        // Method 1: Text-based search
        async () => {
            const buttonTexts = ['Post', 'Kirim', 'Publikasikan', 'Share', 'Posting'];

            for (const text of buttonTexts) {
                try {
                    const elements = await page.locator(`*:has-text("${text}")`).all();

                    for (const element of elements) {
                        if (await element.count() > 0) {
                            const elementText = await element.textContent();
                            if (elementText.trim() === text) {
                                debugLog(`✅ Found exact match for "${text}"`);

                                await element.scrollIntoViewIfNeeded();
                                await page.waitForTimeout(500);

                                const box = await element.boundingBox();
                                if (box) {
                                    await page.mouse.move(
                                        box.x + box.width / 2,
                                        box.y + box.height / 2,
                                        { steps: 10 }
                                    );
                                    await page.waitForTimeout(200);
                                    await page.mouse.click(
                                        box.x + box.width / 2,
                                        box.y + box.height / 2,
                                        { delay: 150 }
                                    );
                                } else {
                                    await element.click({ delay: 150 });
                                }

                                userLog(`✅ Clicked "${text}" button`);
                                return true;
                            }
                        }
                    }
                } catch {
                    continue;
                }
            }
            return false;
        },

        // Method 2: Specific selectors
        async () => {
            const selectors = [
                'div[aria-label="Post"][role="button"]',
                'div[aria-label="Kirim"][role="button"]',
                'div[role="button"]:has(span:has-text("Post"))',
                'button:has(span:has-text("Post"))',
                'div[data-testid="post-button"]',
                'div[data-pagelet="ComposerPostButton"] button',
                'div[role="button"][tabindex="0"]:has(span:has-text("Post"))'
            ];

            for (const selector of selectors) {
                try {
                    const button = await page.locator(selector).first();

                    if (await button.count() > 0) {
                        const isVisible = await button.isVisible();
                        if (isVisible) {
                            debugLog(`✅ Found button: ${selector}`);

                            await button.scrollIntoViewIfNeeded();
                            await page.waitForTimeout(300);

                            // Check if button is enabled
                            const isDisabled = await button.getAttribute('aria-disabled');
                            if (isDisabled === 'true') {
                                debugLog('⚠️ Button is disabled');
                                continue;
                            }

                            await button.click({
                                delay: 180 + Math.random() * 120,
                                button: 'left'
                            });

                            debugLog('✅ Button clicked');
                            return true;
                        }
                    }
                } catch {
                    continue;
                }
            }
            return false;
        },

        // Method 3: JavaScript find and click
        async () => {
            debugLog('  Trying JavaScript method...');
            const clicked = await page.evaluate(() => {
                try {
                    // Function to simulate human click
                    function humanClick(element) {
                        if (!element) return false;

                        const rect = element.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return false;

                        const x = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
                        const y = rect.top + rect.height / 2 + (Math.random() * 10 - 5);

                        element.dispatchEvent(new MouseEvent('mousedown', {
                            bubbles: true,
                            clientX: x,
                            clientY: y,
                            view: window
                        }));

                        element.dispatchEvent(new MouseEvent('mouseup', {
                            bubbles: true,
                            clientX: x,
                            clientY: y,
                            view: window
                        }));

                        element.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            clientX: x,
                            clientY: y,
                            view: window
                        }));

                        element.click();

                        return true;
                    }

                    // Find Post button
                    const postTexts = ['Post', 'Kirim', 'Publikasikan', 'Share', 'Posting'];

                    // Search all elements
                    const allElements = document.querySelectorAll('*');

                    for (const element of allElements) {
                        const text = element.textContent || element.innerText || '';
                        const trimmed = text.trim();

                        if (postTexts.includes(trimmed)) {
                            // [browser] debugLog(`Found "${trimmed}" text`);

                            // Try to click this element
                            if (humanClick(element)) {
                                // [browser] debugLog(`Clicked "${trimmed}" element`);
                                return true;
                            }

                            // Try to find clickable parent
                            let parent = element.parentElement;
                            while (parent && parent !== document.body) {
                                const role = parent.getAttribute('role');
                                const tag = parent.tagName;
                                const ariaDisabled = parent.getAttribute('aria-disabled');

                                if ((role === 'button' || tag === 'BUTTON') &&
                                    ariaDisabled !== 'true' &&
                                    parent.offsetWidth > 0 &&
                                    parent.offsetHeight > 0) {

                                    if (humanClick(parent)) {
                                        // [browser] debugLog(`Clicked parent of "${trimmed}"`);
                                        return true;
                                    }
                                }
                                parent = parent.parentElement;
                            }
                        }
                    }

                    // Try specific selectors via JavaScript
                    const selectors = [
                        'div[aria-label="Post"][role="button"]',
                        'div[aria-label="Kirim"][role="button"]',
                        'div[data-testid="post-button"]'
                    ];

                    for (const selector of selectors) {
                        try {
                            const element = document.querySelector(selector);
                            if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
                                if (humanClick(element)) {
                                    // [browser] debugLog(`Clicked via selector: ${selector}`);
                                    return true;
                                }
                            }
                        } catch {
                            continue;
                        }
                    }

                    return false;
                } catch (error) {
                    console.error('JS error:', error);
                    return false;
                }
            });

            if (clicked) {
                debugLog('✅ JavaScript click successful');
                return true;
            }

            return false;
        }
    ];

    // Try each method
    for (let i = 0; i < methods.length; i++) {
        userLog(`🔄 Trying method ${i + 1}...`);
        try {
            const result = await methods[i]();
            if (result) {
                userLog(`✅ Method ${i + 1} succeeded`);

                // Wait for post to process
                await page.waitForTimeout(3000);

                // Verify post was submitted
                const composerGone = await page.locator('div[contenteditable="true"][role="textbox"]').first().count();
                if (composerGone === 0) {
                    debugLog('✅ Composer closed - post likely submitted');
                }

                return true;
            }
        } catch (error) {
            debugLog(`⚠️ Method ${i + 1} error: ${error.message}`);
        }
    }

    return false;
}

// ===== TEST FUNCTION FOR DEBUGGING =====
async function testGroupStatusUpdate() {
    debugLog('🧪 TESTING GROUP STATUS UPDATE...');

    // Simulate successful posting
    const groupId = '954213602436556';
    const groupNumber = 1;
    const totalGroups = 1;
    const groupLink = 'https://www.facebook.com/groups/954213602436556';

    userLog(`✅ [${ACCOUNT_ID}] SIMULATING Post button clicked successfully for group ${groupNumber}`);
    userLog(`🎉 [${ACCOUNT_ID}] SIMULATING POSTING SUCCESSFUL - Sending success status update...`);
    debugLog(`GROUP_SUCCESS:${groupNumber}/${totalGroups}:${groupLink}`);
    debugLog(`📡 [${ACCOUNT_ID}] SENDING SUCCESS STATUS UPDATE...`);
    userLog(`GROUP_STATUS_UPDATE:${groupId}:success:Posting to group ${groupId} successful`);
    process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${groupId}:success:Posting to group ${groupId} successful\n`);
    debugLog(`📡 [${ACCOUNT_ID}] SUCCESS STATUS UPDATE SENT`);
}

// Jalankan script
if (require.main === module) {
    // Ensure stdin is flowing to receive data from parent process
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Uncomment line below to test status update
    // testGroupStatusUpdate();
    runFacebookGroupsPoster();
}