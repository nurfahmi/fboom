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

// Dapatkan session directory dari environment variable
const ACCOUNT_SESSION_DIR = process.env.ACCOUNT_SESSION_DIR ||
    path.join(__dirname, 'sessions');
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || 'Default Account';

userLog(`🚀 FACEBOOK SHARE POSTER SCRIPT STARTED`);
debugLog(`👤 Account: ${ACCOUNT_NAME} (${ACCOUNT_ID})`);
debugLog(`📁 Session: ${ACCOUNT_SESSION_DIR}`);
debugLog(`🔧 Node version: ${process.version}`);
debugLog(`📂 Current directory: ${process.cwd()}`);

// Check if session directory exists and has content

if (fs.existsSync(ACCOUNT_SESSION_DIR)) {
    const sessionFiles = fs.readdirSync(ACCOUNT_SESSION_DIR);
    debugLog(`📁 Session directory exists with ${sessionFiles.length} files`);
    if (sessionFiles.length === 0) {
        debugLog(`⚠️ WARNING: Session directory is empty!`);
    } else {
        userLog(`📋 Session files: ${sessionFiles.slice(0, 5).join(', ')}${sessionFiles.length > 5 ? '...' : ''}`);
    }
} else {
    debugLog(`❌ Session directory does not exist: ${ACCOUNT_SESSION_DIR}`);
}

// ===== CLEANUP CHROME LOCKS =====
/**
 * Clean up Chrome lock files that can prevent browser from starting
 * @param {string} userDataDir - Path to Chrome user data directory
 */
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

    // Also check and clean locks in Default profile subdirectory
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

    // Small delay to ensure files are fully deleted
    await new Promise(resolve => setTimeout(resolve, 500));
}

// Global flag untuk mencegah proses ganda
let isProcessRunning = false;
let isCancelled = false;

async function runFacebookSharePoster() {
    let shareData = '';

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
                            if (global.refreshMode) {
                                // Handle refresh groups
                                await continueAfterLoginForRefresh();
                            } else if (global.shareData) {
                                // Handle share process - use global.shareData instead of local shareData
                                await continueAfterLogin(global.shareData);
                            } else {
                                console.error(`❌ [${ACCOUNT_ID}] No shareData or refreshMode found`);
                                process.exit(1);
                            }
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error continuing: ${error.message}`);
                            process.exit(1);
                        }
                    });
                } else {
                    debugLog(`❌ [${ACCOUNT_ID}] Process cancelled by user`);
                    delete global.refreshMode;
                    process.exit(0);
                }
            } else if (parsed.action === 'refresh-groups') {
                userLog(`🔄 [${ACCOUNT_ID}] Refresh groups requested - direct extraction`);
                shareData = parsed; // Set shareData for refresh process
                global.refreshMode = true;
                // Direct extraction without full browser process
                process.nextTick(async () => {
                    try {
                        if (!isProcessRunning) {
                            isProcessRunning = true;
                            await startShareProcess(shareData);
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error starting refresh process: ${error.message}`);
                        process.exit(1);
                    }
                });
            } else if (parsed.action === 'bring-browser-to-front') {
                const uniqueTitle = parsed.uniqueTitle || `FBOOM-ACCOUNT-${ACCOUNT_ID}`;
                userLog(`🔄 [${ACCOUNT_ID}] Bringing browser to front with unique title: ${uniqueTitle}...`);
                process.nextTick(async () => {
                    try {
                        if (global.browserInstance) {
                            // 🔧 FIX: Untuk launchPersistentContext, browserInstance IS a BrowserContext (bukan Browser)
                            // Kita bisa langsung ambil pages dari browserInstance
                            let pages = global.browserInstance.pages();
                            debugLog(`🔍 [${ACCOUNT_ID}] Found ${pages.length} pages in persistent context`);

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
            } else if (parsed.action === 'cancel-share') {
                userLog(`⏹️ [${ACCOUNT_ID}] Share process cancelled by user`);
                isCancelled = true;
                isProcessRunning = false;

                // Send status update to UI
                userLog(`SHARE_STATUS_UPDATE:cancelled:Proses share dibatalkan oleh user`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:SHARE_STATUS_UPDATE:cancelled:Proses share dibatalkan oleh user\n`);

                debugLog(`SHARE_CANCELLED:${ACCOUNT_ID}:User cancelled share process`);
                process.exit(0);
            } else if (parsed.action === 'close-browser') {
                userLog(`🔄 [${ACCOUNT_ID}] Closing browser as requested...`);
                process.exit(0);
            } else if (parsed.action === 'refresh-groups') {
                userLog(`🔄 [${ACCOUNT_ID}] Refresh groups requested`);
                global.refreshMode = true;
                // Continue with normal login process
            } else {
                shareData = parsed;
                global.shareData = parsed; // Store in global for login confirmation
                userLog(`✅ [${ACCOUNT_ID}] Share data received for auto sharing`);

                process.nextTick(async () => {
                    try {
                        if (!isProcessRunning) {
                            isProcessRunning = true;
                            await startShareProcess(shareData);
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error starting share process: ${error.message}`);
                        process.exit(1);
                    }
                });
            }
        } catch (error) {
            userLog(`📝 [${ACCOUNT_ID}] Raw input: ${data.substring(0, 100)}`);
        }
    });
}

async function startShareProcess(shareData) {
    userLog(`🚀 [${ACCOUNT_ID}] Starting Facebook Auto Share process for ${ACCOUNT_NAME}...`);

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
        debugLog(`🔧 Using executable: ${executablePath || 'Playwright default'}`);

        // Function to delete corrupt profile
        const deleteCorruptProfile = async () => {
            debugLog(`🗑️ [${ACCOUNT_ID}] Deleting potentially corrupt profile: ${USER_DATA_DIR}`);
            try {
                if (fs.existsSync(USER_DATA_DIR)) {
                    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
                    userLog(`✅ [${ACCOUNT_ID}] Profile deleted successfully`);
                    // Wait a bit for file system
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (e) {
                debugLog(`⚠️ [${ACCOUNT_ID}] Could not delete profile: ${e.message}`);
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
                executablePath: executablePath, // Gunakan Chromium Playwright, BUKAN Chrome sistem
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                slowMo: 0,
                timeout: 120000,  // Increase timeout to 120 seconds
                ignoreDefaultArgs: ['--enable-automation'],  // 🔒 Hide automation banner
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

            // Fallback: gunakan chromium default tanpa executablePath
            browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
                headless: false,
                viewport: viewport,
                args: launchArgs,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                slowMo: 0,
                timeout: 120000,
                ignoreDefaultArgs: ['--enable-automation'],  // 🔒 Hide automation banner
            });
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

        page.setDefaultTimeout(60000);

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

        // Login confirmation process
        let checkInterval;
        let loginConfirmedManually = false;

        userLog(`⏰ [${ACCOUNT_ID}] Waiting for user to login (will show popup in 10 seconds if not logged in)...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            debugLog(`❓ [${ACCOUNT_ID}] Please check browser and login if needed`);
            userLog(`✅ [${ACCOUNT_ID}] If already logged in, click YES in the app popup`);
            debugLog(`❌ [${ACCOUNT_ID}] If not logged in, click NO to cancel`);

            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.shareData = shareData;

            // Send browser instance info to main process
            // For launchPersistentContext, browser IS a BrowserContext (not Browser)
            // We can directly get pages from browser.pages()
            const pageCount = browser.pages().length;
            process.stdout.write(`BROWSER_CREATED:${ACCOUNT_ID}:${pageCount}\n`);

        }, 10000); // 10 seconds instead of 120000 (2 minutes)

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

                    loginConfirmedManually = true;

                    // Check if this is extract groups or share process
                    debugLog(`🔍 [${ACCOUNT_ID}] Checking action: shareData.action = "${shareData?.action}", global.refreshMode = ${global.refreshMode}`);

                    if (shareData.action === 'extract-groups') {
                        userLog(`📋 [${ACCOUNT_ID}] Executing extractGroupsProcess`);
                        await extractGroupsProcess(page, browser);
                    } else if (shareData.action === 'refresh-groups' || global.refreshMode) {
                        userLog(`🔄 [${ACCOUNT_ID}] Executing performGroupExtractionForRefresh`);
                        await performGroupExtractionForRefresh(page, browser);
                    } else if (shareData.action === 'share-to-groups') {
                        userLog(`🔗 [${ACCOUNT_ID}] Executing shareToGroupsProcess`);
                        await shareToGroupsProcess(page, browser, shareData);
                    } else {
                        debugLog(`❓ [${ACCOUNT_ID}] Unknown action: "${shareData?.action}"`);
                    }
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
        console.error(`[${ACCOUNT_ID}] Error stack: ${error.stack}`);
        console.error(`[${ACCOUNT_ID}] ShareData at error:`, shareData);
        console.error(`[${ACCOUNT_ID}] Global refreshMode:`, global.refreshMode);
        isProcessRunning = false;
        // Biarkan browser tetap terbuka untuk mempertahankan session
        throw error;
    }
}

async function checkIfLoggedInSimple(page) {
    try {
        debugLog('🔍 Checking login status...');

        const url = await page.url();
        debugLog(`📍 Current URL: ${url}`);

        if (url.includes('login') || url.includes('checkpoint')) {
            debugLog('❌ Login/checkpoint page detected');
            return false;
        }

        // Check for email input field
        try {
            const emailField = await page.locator('#email, input[name="email"]').first();
            const emailCount = await emailField.count();
            debugLog(`📧 Email fields found: ${emailCount}`);
            if (emailCount > 0) {
                debugLog('❌ Email field detected - not logged in');
                return false;
            }
        } catch (e) {
            debugLog('⚠️ Error checking email field:', e.message);
        }

        // Check for login button
        try {
            const loginBtn = await page.locator('button:has-text("Log In"), button:has-text("Masuk")').first();
            const loginCount = await loginBtn.count();
            debugLog(`🔐 Login buttons found: ${loginCount}`);
            if (loginCount > 0) {
                debugLog('❌ Login button detected - not logged in');
                return false;
            }
        } catch (e) {
            debugLog('⚠️ Error checking login button:', e.message);
        }

        // Check for Facebook home elements that indicate logged in
        try {
            const homeIndicators = [
                '[data-testid="left_nav_menu"]',
                '[data-testid="left_nav"]',
                'div[role="navigation"]',
                'div[aria-label*="menu"]'
            ];

            for (const indicator of homeIndicators) {
                const element = await page.locator(indicator).first();
                const count = await element.count();
                if (count > 0) {
                    debugLog(`✅ Found home indicator: ${indicator} (${count})`);
                    return true;
                }
            }
        } catch (e) {
            debugLog('⚠️ Error checking home indicators:', e.message);
        }

        debugLog('✅ No login indicators found - assuming logged in');
        return true;

    } catch (error) {
        console.error('💥 Error in checkIfLoggedInSimple:', error.message);
        return false;
    }
}

async function continueAfterLogin(shareData) {
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

        // Check if this is extract groups or share process
        if (shareData.action === 'extract-groups') {
            await extractGroupsProcess(global.loginPage, global.browserInstance);
        } else if (shareData.action === 'share-to-groups') {
            await shareToGroupsProcess(global.loginPage, global.browserInstance, shareData);
        }
    } finally {
        delete global.loginPage;
        delete global.browserInstance;
        delete global.shareData;
    }
}

// ===== EXTRACT GROUPS PROCESS =====
async function extractGroupsProcess(page, browser) {
    userLog(`\n📋 [${ACCOUNT_ID}] ==========================================`);
    debugLog(`🔍 [${ACCOUNT_ID}] STARTING EXTRACT GROUPS PROCESS`);
    debugLog(`==========================================\n`);

    try {
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
            userLog(`GROUPS_EXTRACTED:0`);
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
        // Use a simpler format to avoid parsing issues with colons in JSON
        const groupsData = {
            count: groups.length,
            groups: groups,
            accountId: ACCOUNT_ID
        };
        const groupsMessage = `GROUPS_EXTRACTED:${JSON.stringify(groupsData)}`;

        // Send GROUPS_EXTRACTED message via multiple channels to ensure delivery
        process.stdout.write(groupsMessage + '\n');
        debugLog(`[EXTRACT] Sent GROUPS_EXTRACTED message with ${groups.length} groups`);

        // Also save to a temporary file as backup in userData directory (works in production)
        const tempFile = `groups_extracted_${ACCOUNT_ID}_${Date.now()}.json`;
        const fs = require('fs');
        const path = require('path');
        // Use USER_DATA_DIR env var (passed from main.js) for production compatibility
        const backupDir = process.env.USER_DATA_DIR || __dirname;
        const tempPath = path.join(backupDir, tempFile);

        try {
            fs.writeFileSync(tempPath, JSON.stringify({
                accountId: ACCOUNT_ID,
                groups: groups,
                timestamp: new Date().toISOString()
            }, null, 2));
            debugLog(`[EXTRACT] Backup saved to: ${tempPath}`);
        } catch (error) {
            debugLog(`[EXTRACT] Failed to save backup file: ${error.message}`);
        }

        // Force flush stdout to ensure message is sent
        process.stdout._handle?.flush?.();
        process.stdout.flush?.();

        userLog(`✅ [${ACCOUNT_ID}] Groups extraction completed successfully`);

        // Add small delay to ensure message is processed before exit
        await page.waitForTimeout(500);

        debugLog(`[EXTRACT] Exiting process...`);
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Groups extraction error: ${error.message}`);
        userLog(`GROUPS_EXTRACTED:0`);
        isProcessRunning = false;
        throw error;
    }
}

// ===== REFRESH GROUPS PROCESS =====


// ===== PERFORM GROUP EXTRACTION FOR REFRESH =====
async function performGroupExtractionForRefresh(page, browser) {
    userLog(`🔄 [${ACCOUNT_ID}] performGroupExtractionForRefresh STARTED`);
    try {
        // STEP 1: Kunjungi halaman groups joins SEKALI
        debugLog(`📍 [${ACCOUNT_ID}] Step 1: Navigating to Facebook Groups joins page...`);
        await page.goto('https://www.facebook.com/groups/joins', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        userLog(`✅ [${ACCOUNT_ID}] Navigation to groups/joins successful`);
        await page.waitForTimeout(5000);

        // STEP 2: Scroll sampai bawah SEKALI
        debugLog(`📜 [${ACCOUNT_ID}] Step 2: Scrolling to load all groups...`);
        await scrollToBottom(page);
        userLog(`✅ [${ACCOUNT_ID}] Scroll to bottom completed`);

        // STEP 3: Extract groups data SEKALI
        debugLog(`🔍 [${ACCOUNT_ID}] Step 3: Extracting group data...`);
        debugLog(`📍 [${ACCOUNT_ID}] Current page URL before extraction: ${await page.url()}`);
        const groups = await extractGroupsData(page);
        userLog(`📊 [${ACCOUNT_ID}] extractGroupsData returned ${groups.length} groups`);
        debugLog(`✅ [${ACCOUNT_ID}] Groups extraction completed, found ${groups.length} groups`);

        if (groups.length === 0) {
            debugLog(`❌ [${ACCOUNT_ID}] No groups found`);
            debugLog(`GROUPS_REFRESH_COMPLETED`);
            isProcessRunning = false;
            delete global.refreshMode;
            process.exit(0);
        }

        // TAMPILKAN DATA GROUP YANG DI-EXTRACT
        userLog(`\n📋 [${ACCOUNT_ID}] REFRESHED GROUPS (${groups.length} groups):`);
        debugLog('══════════════════════════════════════════════════════════');
        groups.forEach((group, index) => {
            debugLog(`${index + 1}. ${group.name} (${group.id})`);
        });
        debugLog('══════════════════════════════════════════════════════════\n');

        // Kirim list group ke main process untuk ditampilkan di UI
        userLog(`GROUPS_EXTRACTED:${groups.length}:${JSON.stringify(groups)}`);

        userLog(`✅ [${ACCOUNT_ID}] Groups refresh completed successfully`);
        debugLog(`GROUPS_REFRESH_COMPLETED`);

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Groups refresh error: ${error.message}`);
        debugLog(`GROUPS_REFRESH_COMPLETED`);
        isProcessRunning = false;
        delete global.refreshMode;
        throw error;
    }
}

// ===== SCROLL TO BOTTOM FUNCTION =====
/**
 * Scroll to bottom dan berhenti jika tidak ada group ID baru yang muncul
 * Logic: Extract group ID setiap scroll, bandingkan dengan sebelumnya
 * Berhenti jika tidak ada group ID baru setelah scroll
 *
 * TAMBAHAN: Multiple check untuk memastikan tidak ada group yang terlewat
 */
async function scrollToBottom(page) {
    debugLog('⬇️ Scrolling to load ALL groups (will scroll until no new groups found)...');
    debugLog('🔄 Will perform multiple checks to ensure all groups are captured');

    let previousGroupIds = new Set();
    let scrollCount = 0;
    let noNewGroupsCount = 0; // Counter untuk berapa kali tidak ada group baru
    const maxNoNewGroups = 5; // Berhenti setelah N kali tidak ada group baru (safety)
    const maxScrolls = 100; // Safety limit untuk mencegah infinite loop

    // Untuk tracking - simpan semua unique IDs yang pernah ditemukan
    let allUniqueIds = new Set();

    // Initial extract untuk mendapatkan group IDs awal
    const initialIdsArray = await page.evaluate(() => {
        const groupIds = [];
        const groupLinks = document.querySelectorAll('[role="main"] [role="list"] a[href*="/groups/"]');
        groupLinks.forEach(a => {
            const link = a.href.split('?')[0];
            const match = link.match(/\/groups\/(\d+)/);
            if (match) {
                groupIds.push(match[1]);
            }
        });
        return groupIds;
    });
    previousGroupIds = new Set(initialIdsArray);
    initialIdsArray.forEach(id => allUniqueIds.add(id));

    debugLog(`  📊 Initial groups found: ${previousGroupIds.size} groups`);

    // Cek duplikasi di initial
    if (initialIdsArray.length !== allUniqueIds.size) {
        debugLog(`  ⚠️ Found ${initialIdsArray.length - allUniqueIds.size} duplicates in initial scan`);
    }

    let shouldContinue = true;

    while (shouldContinue && scrollCount < maxScrolls) {
        scrollCount++;
        noNewGroupsCount++;

        // Scroll ke bawah
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Delay random untuk menunggu konten load (3-6 detik)
        const delay = 3000 + Math.random() * 3000;
        await page.waitForTimeout(delay);

        // Extract group IDs setelah scroll (return as Array, bukan Set)
        const currentIdsArray = await page.evaluate(() => {
            const groupIds = [];
            const groupLinks = document.querySelectorAll('[role="main"] [role="list"] a[href*="/groups/"]');
            groupLinks.forEach(a => {
                const link = a.href.split('?')[0];
                const match = link.match(/\/groups\/(\d+)/);
                if (match) {
                    groupIds.push(match[1]);
                }
            });
            return groupIds;
        });
        const currentGroupIds = new Set(currentIdsArray);

        // Tambahkan ke allUniqueIds
        let newToAllUnique = 0;
        for (const id of currentIdsArray) {
            if (!allUniqueIds.has(id)) {
                allUniqueIds.add(id);
                newToAllUnique++;
            }
        }

        // Cek duplikasi dalam batch ini
        const hasDuplicates = currentIdsArray.length !== currentGroupIds.size;

        // Cari group ID baru (dibanding previous)
        const newGroupIds = [];
        for (const id of currentIdsArray) {
            if (!previousGroupIds.has(id)) {
                newGroupIds.push(id);
            }
        }

        debugLog(`  📏 Scroll ${scrollCount}: Total=${currentGroupIds.size}, +${newGroupIds.length} new, AllUnique=${allUniqueIds.size}${hasDuplicates ? ' ⚠️dup' : ''}`);

        // Jika ada group baru, reset counter dan update previousGroupIds
        if (newGroupIds.length > 0) {
            noNewGroupsCount = 0;
            previousGroupIds = currentGroupIds;
            debugLog(`  ✨ Found ${newGroupIds.length} new group(s), continuing...`);
        } else {
            debugLog(`  ⏸️ No new groups found (count: ${noNewGroupsCount}/${maxNoNewGroups})`);

            // Berhenti jika tidak ada group baru sebanyak maxNoNewGroups kali berturut-turut
            if (noNewGroupsCount >= maxNoNewGroups) {
                userLog(`  ✅ No new groups for ${maxNoNewGroups} consecutive scrolls, stopping...`);
                shouldContinue = false;
            }
        }
    }

    if (scrollCount >= maxScrolls) {
        debugLog(`  ⚠️ Reached safety limit of ${maxScrolls} scrolls`);
    }

    // Final verification - lakukan extra check di akhir
    debugLog(`  🔍 Performing final verification check...`);
    await page.waitForTimeout(2000);

    const finalIdsArray = await page.evaluate(() => {
        const groupIds = [];
        const groupLinks = document.querySelectorAll('[role="main"] [role="list"] a[href*="/groups/"]');
        groupLinks.forEach(a => {
            const link = a.href.split('?')[0];
            const match = link.match(/\/groups\/(\d+)/);
            if (match) {
                groupIds.push(match[1]);
            }
        });
        return groupIds;
    });

    // Cek apakah ada group baru di final check
    let finalNewGroups = 0;
    for (const id of finalIdsArray) {
        if (!allUniqueIds.has(id)) {
            allUniqueIds.add(id);
            finalNewGroups++;
        }
    }

    if (finalNewGroups > 0) {
        debugLog(`  🎉 Final check found ${finalNewGroups} additional group(s)!`);
    }

    userLog(`✅ Finished scrolling after ${scrollCount} scrolls`);
    userLog(`📊 Final count: ${allUniqueIds.size} unique groups`);

    // Update previousGroupIds dengan final result
    previousGroupIds = allUniqueIds;
}

// ===== EXTRACT GROUPS DATA FUNCTION =====
async function extractGroupsData(page) {
    debugLog('🔗 Extracting groups data...');

    const groups = await page.evaluate(() => {
        const groupsObj = {};

        // Cari semua link yang mengandung /groups/
        const groupLinks = document.querySelectorAll('[role="main"] [role="list"] a[href*="/groups/"]');

        groupLinks.forEach(a => {
            let name = a.textContent.trim();

            // Clean up the name - remove status text and extra whitespace
            // Remove common Facebook status patterns
            name = name.replace(/\s*Last active[^\n]*/gi, '').trim();
            name = name.replace(/\s*Active[^\n]*/gi, '').trim();
            name = name.replace(/\s*about an hour ago[^\n]*/gi, '').trim();
            name = name.replace(/\s*ago[^\n]*/gi, '').trim();
            name = name.replace(/\s*\d+\s*(minutes?|hours?|days?)\s*ago/gi, '').trim();
            name = name.replace(/\s*\d+\s*(mins?|hrs?|dys?)\s*ago/gi, '').trim();

            // Remove extra whitespace and line breaks
            name = name.replace(/\s+/g, ' ').trim();

            const link = a.href.split('?')[0]; // hapus parameter

            // Ambil ID group: angka setelah /groups/
            const match = link.match(/\/groups\/(\d+)/);
            if (name && name.length > 0 && match && !groupsObj[match[1]]) {
                groupsObj[match[1]] = name;
                console.log(`📝 Extracted group: "${name}" (ID: ${match[1]})`);
            }
        });

        // Ubah object jadi array
        const uniqueGroups = Object.entries(groupsObj).map(([id, name]) => ({
            id: id,
            name: name
        }));

        return uniqueGroups;
    });

    debugLog(`📊 Found ${groups.length} unique groups`);
    return groups;
}

// ===== SHARE TO GROUPS PROCESS =====
async function shareToGroupsProcess(page, browser, shareData) {
    userLog(`\n🔗 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🚀 [${ACCOUNT_ID}] STARTING SHARE TO GROUPS PROCESS`);
    userLog(`📋 [${ACCOUNT_ID}] MODE: SEQUENTIAL (One group at a time)`);
    debugLog(`⏳ [${ACCOUNT_ID}] Each share waits for previous to complete`);
    debugLog(`==========================================\n`);

    try {
        debugLog(`📥 [${ACCOUNT_ID}] shareToGroupsProcess received shareData:`, JSON.stringify(shareData, null, 2));

        const postLink = shareData.postLink;
        const hasSpintax = shareData.hasSpintax || false;
        const caption = shareData.caption || '';
        const groups = shareData.groups || [];
        const delayMin = shareData.delayMin || 10; // Min delay in seconds from UI
        const delayMax = shareData.delayMax || 120; // Max delay in seconds from UI
        const maxShares = shareData.maxShares || 1;

        const totalGroups = groups.length;

        debugLog(`🔍 [${ACCOUNT_ID}] Parsed data:`);
        debugLog(`   📎 Post link: ${postLink}`);
        userLog(`   💬 Caption: "${caption}"${hasSpintax ? ' [HAS SPINTAX]' : ''}`);
        debugLog(`   👥 Groups count: ${totalGroups}`);
        debugLog(`   ⏱️ Delay range: ${delayMin}-${delayMax}s`);
        debugLog(`   🔢 Max shares per group: ${maxShares}`);

        if (groups.length > 0) {
            userLog(`📋 [${ACCOUNT_ID}] Groups to process:`);
            groups.forEach((group, index) => {
                debugLog(`   ${index + 1}. ${group.name} (ID: ${group.id})`);
            });
        }

        debugLog(`📦 [${ACCOUNT_ID}] Found ${totalGroups} groups to share to`);
        userLog(`🔗 [${ACCOUNT_ID}] Post link: ${postLink}`);
        userLog(`💬 [${ACCOUNT_ID}] Caption: "${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}"`);
        debugLog(`⏱️ [${ACCOUNT_ID}] Random delay between shares: ${delayMin}-${delayMax} seconds`);
        debugLog(`🔢 [${ACCOUNT_ID}] Max shares per group: ${maxShares}`);
        debugLog('');

        let successCount = 0;
        let failCount = 0;
        const maxSharesPerSession = 25; // Limit to avoid detection

        userLog(`🚀 [${ACCOUNT_ID}] STARTING SHARE LOOP - Processing ${totalGroups} groups...`);

        for (let i = 0; i < totalGroups; i++) {
            // Check if cancelled
            if (isCancelled) {
                userLog(`⏹️ [${ACCOUNT_ID}] Share process cancelled by user at group ${i + 1}/${totalGroups}`);
                break;
            }

            userLog(`\n🎯 [${ACCOUNT_ID}] ========== STARTING GROUP ${i + 1}/${totalGroups} ==========`);
            const group = groups[i];
            const groupNumber = i + 1;

            debugLog(`👥 [${ACCOUNT_ID}] Processing group ${groupNumber}: ${group.name} (ID: ${group.id})`);

            // Check if we've reached the session limit
            if (successCount >= maxSharesPerSession) {
                userLog(`🎯 [${ACCOUNT_ID}] Reached session limit of ${maxSharesPerSession} successful shares`);
                userLog(`🎯 [${ACCOUNT_ID}] Stopping to avoid Facebook detection`);
                break;
            }

            debugLog(`\n📌 [${ACCOUNT_ID}] ================= GROUP ${groupNumber}/${totalGroups} =================`);
            debugLog(`👥 [${ACCOUNT_ID}] ${group.name} (${group.id})`);
            debugLog(`SHARE_START:${groupNumber}/${totalGroups}:${group.name}`);

            // Update status to sharing
            userLog(`GROUP_STATUS_UPDATE:${group.id}:posting:Memulai share ke group ${group.name}...`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${group.id}:posting:Memulai share ke group ${group.name}...\n`);

            // Update status to sharing (only once per group)
            userLog(`GROUP_STATUS_UPDATE:${group.id}:posting:Memulai share ke ${group.name}...`);

            let groupStatusSent = false; // Flag to prevent duplicate status updates

            try {
                userLog(`🔄 [${ACCOUNT_ID}] STARTING SHARE PROCESS FOR GROUP ${groupNumber}/${totalGroups}`);

                let groupShareSuccess = false; // Track if at least one share succeeded

                // Share to this group multiple times if requested
                for (let shareIndex = 0; shareIndex < maxShares; shareIndex++) {
                    userLog(`🔗 [${ACCOUNT_ID}] Share attempt ${shareIndex + 1}/${maxShares} to group ${groupNumber}`);

                    // Apply spin text if hasSpintax flag is true (different for each share)
                    let shareCaption = caption;
                    if (hasSpintax) {
                        shareCaption = spinText(caption);
                        debugLog(`🎲 [${ACCOUNT_ID}] Spin text applied for group ${groupNumber}, share ${shareIndex + 1}: "${caption}" → "${shareCaption}"`);
                    }

                    const shareSuccess = await shareToGroup(page, postLink, group, shareCaption);
                    if (shareSuccess) {
                        userLog(`✅ [${ACCOUNT_ID}] Share ${shareIndex + 1} successful to group ${groupNumber}`);
                        groupShareSuccess = true; // Mark as successful if at least one share worked
                    } else {
                        debugLog(`❌ [${ACCOUNT_ID}] Share ${shareIndex + 1} failed to group ${groupNumber}`);
                    }

                    // Small delay between shares on same group
                    if (shareIndex < maxShares - 1) {
                        await page.waitForTimeout(2000);
                    }
                }

                userLog(`🎉 [${ACCOUNT_ID}] FINISHED ALL SHARES TO GROUP ${groupNumber}/${totalGroups}!`);

                // Determine final status based on actual share success (send only once)
                if (!groupStatusSent) {
                    if (groupShareSuccess) {
                        // SUCCESS: Share berhasil diklik tanpa perlu verifikasi
                        userLog(`✅ [${ACCOUNT_ID}] SUCCESS: Share successful to group ${groupNumber} (no verification needed)`);
                        debugLog(`SHARE_SUCCESS:${groupNumber}/${totalGroups}:${group.name}`);
                        userLog(`GROUP_STATUS_UPDATE:${group.id}:success:Share berhasil ke ${group.name}`);
                        process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${group.id}:success:Share berhasil ke ${group.name}\n`);
                        successCount++;
                    } else {
                        debugLog(`SHARE_FAILED:${groupNumber}/${totalGroups}:${group.name}`);
                        userLog(`GROUP_STATUS_UPDATE:${group.id}:error:Share gagal - Group tidak dapat ditemukan atau dipilih`);
                        process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUP_STATUS_UPDATE:${group.id}:error:Share gagal - Group tidak dapat ditemukan atau dipilih\n`);
                        failCount++;
                    }
                    groupStatusSent = true; // Mark as sent
                }

                userLog(`✅ [${ACCOUNT_ID}] GROUP ${groupNumber} FULLY PROCESSED\n`);

            } catch (error) {
                console.error(`❌ [${ACCOUNT_ID}] CRITICAL FAILURE - SHARE TO GROUP ${groupNumber} NOT COMPLETED`);
                console.error(`   [${ACCOUNT_ID}] Group: ${group.name}`);
                console.error(`   [${ACCOUNT_ID}] Error: ${error.message}`);
                userLog(`SHARE_ERROR:${groupNumber}/${totalGroups}:${error.message}`);

                // Send error status only if not already sent
                if (!groupStatusSent) {
                    userLog(`GROUP_STATUS_UPDATE:${group.id}:error:Share gagal - ${error.message}`);
                    groupStatusSent = true;
                }

                failCount++;
            }

            // Wait before next group (except for last group)
            if (i < totalGroups - 1) {
                // Random delay between delayMin and delayMax seconds
                const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
                const totalWait = randomDelay * 1000; // Convert to milliseconds

                debugLog(`⏳ [${ACCOUNT_ID}] WAITING ${Math.round(randomDelay)} SECONDS BEFORE NEXT GROUP...`);
                debugLog(`   [${ACCOUNT_ID}] (Random delay range: ${delayMin}-${delayMax}s, selected: ${Math.round(randomDelay)}s)`);

                await page.waitForTimeout(totalWait);

                // Additional check: make sure page is ready
                try {
                    await page.waitForLoadState('networkidle', { timeout: 10000 });
                } catch (e) {
                    debugLog('⚠️ [${ACCOUNT_ID}] Page still loading, continuing anyway...');
                }

                // Check login status before next group (lighter approach)
                debugLog('🔐 Checking login status before next group...');
                const stillLoggedIn = await checkIfLoggedInSimple(page);
                if (!stillLoggedIn) {
                    debugLog('⚠️ [${ACCOUNT_ID}] Login session may have expired, stopping...');
                    break;
                }
            } else {
                userLog(`🎯 [${ACCOUNT_ID}] LAST GROUP PROCESSED`);
            }

            // Rest Time: Setiap N share, rest untuk X detik
            const restCount = shareData.restCount || 5;  // default: setiap 5 share
            const restDelay = shareData.restDelay || 300;  // default: rest 300 detik (5 menit)

            // Cek apakah sudah mencapai restCount (hanya hitung successful shares)
            if ((successCount % restCount === 0) && (successCount > 0) && (i < totalGroups - 1)) {
                userLog(`💤 [${ACCOUNT_ID}] REST TIME: ${successCount} shares completed. Taking a break for ${restDelay} seconds (${Math.round(restDelay / 60)} minutes)...`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:REST_TIME:Started - resting for ${restDelay} seconds after ${successCount} shares\n`);

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

                userLog(`✅ [${ACCOUNT_ID}] Rest time completed! Resuming sharing...`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:REST_TIME:Completed - resuming sharing\n`);
            }
        }

        // Final summary
        userLog(`\n🎯 [${ACCOUNT_ID}] ==========================================`);
        userLog(`📊 [${ACCOUNT_ID}] SHARE TO GROUPS SUMMARY`);
        debugLog('══════════════════════════════════════════');
        debugLog(`📦 [${ACCOUNT_ID}] Total groups processed: ${totalGroups}`);
        userLog(`✅ [${ACCOUNT_ID}] Successful shares: ${successCount}`);
        debugLog(`❌ [${ACCOUNT_ID}] Failed shares: ${failCount}`);
        userLog(`📊 [${ACCOUNT_ID}] Success rate: ${Math.round((successCount / totalGroups) * 100)}%`);
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] Process was cancelled by user`);
        }
        debugLog('══════════════════════════════════════════');
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] SHARE PROCESS CANCELLED`);
        } else {
            userLog(`✅ [${ACCOUNT_ID}] ALL GROUPS PROCESSED SEQUENTIALLY`);
            userLog(`🎉 [${ACCOUNT_ID}] SHARE_PROCESS_COMPLETED`);
        }
        debugLog('==========================================\n');

        isProcessRunning = false;

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Share to groups error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    } finally {
        // Biarkan browser tetap terbuka untuk mempertahankan session
        // User dapat menutup browser secara manual
        process.exit(0);
    }
}

// ===== HELPER FUNCTIONS =====

async function extractGroupsData(page) {
    debugLog('🔗 Extracting groups data...');

    const groups = await page.evaluate(() => {
        const groupsObj = {};

        // Cari semua link yang mengandung /groups/
        const groupLinks = document.querySelectorAll('[role="main"] [role="list"] a[href*="/groups/"]');

        // [browser] debugLog(`🔍 Found ${groupLinks.length} group links on page`);

        groupLinks.forEach((a, index) => {
            let name = a.textContent.trim();
            const href = a.href;

            // Debug: log first few links
            if (index < 3) {
                console.log(`🔗 Link ${index + 1}: "${name}" -> ${href}`);
            }

            // Clean up the name - remove status text and extra whitespace
            // Remove common Facebook status patterns
            name = name.replace(/\s*Last active[^\n]*/gi, '').trim();
            name = name.replace(/\s*Active[^\n]*/gi, '').trim();
            name = name.replace(/\s*about an hour ago[^\n]*/gi, '').trim();
            name = name.replace(/\s*ago[^\n]*/gi, '').trim();
            name = name.replace(/\s*\d+\s*(minutes?|hours?|days?)\s*ago/gi, '').trim();
            name = name.replace(/\s*\d+\s*(mins?|hrs?|dys?)\s*ago/gi, '').trim();

            // Remove extra whitespace and line breaks
            name = name.replace(/\s+/g, ' ').trim();

            // Skip if name is too short or contains only numbers/symbols
            if (name.length < 3 || !/[a-zA-Z]/.test(name)) {
                return;
            }

            const link = href.split('?')[0]; // hapus parameter

            // Ambil ID group: angka setelah /groups/
            const match = link.match(/\/groups\/(\d+)/);
            if (name && name.length > 0 && match && !groupsObj[match[1]]) {
                groupsObj[match[1]] = name;
                console.log(`📝 Extracted group: "${name}" (ID: ${match[1]})`);
            }
        });

        // Ubah object jadi array
        const uniqueGroups = Object.entries(groupsObj).map(([id, name]) => ({
            id: id,
            name: name
        }));

        console.log(`📊 Processed ${uniqueGroups.length} unique groups from ${groupLinks.length} links`);
        return uniqueGroups;
    });

    debugLog(`📊 Final result: Found ${groups.length} unique groups`);
    return groups;
}

async function shareToGroup(page, postLink, group, caption) {
    try {
        userLog(`🔗 [${ACCOUNT_ID}] Starting share process for group: ${group.name} (ID: ${group.id})`);

        // STEP 1: Check login status before navigating
        debugLog(`🔐 [${ACCOUNT_ID}] STEP 1: Checking login status...`);
        const isLoggedIn = await checkIfLoggedInSimple(page);
        if (!isLoggedIn) {
            throw new Error('Not logged in - login session may have expired');
        }
        userLog(`✅ [${ACCOUNT_ID}] Login status OK, proceeding...`);

        // STEP 2: Navigate to the post
        debugLog(`🌐 [${ACCOUNT_ID}] STEP 2: Navigating to post: ${postLink}`);
        await page.goto(postLink, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(5000);
        userLog(`✅ [${ACCOUNT_ID}] Post page loaded successfully`);

        // Check if we're on the correct post page
        const currentUrl = await page.url();
        debugLog(`📍 Post page URL: ${currentUrl}`);

        if (!currentUrl.includes('facebook.com')) {
            throw new Error(`Not on Facebook. Current URL: ${currentUrl}`);
        }

        if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
            throw new Error(`Redirected to login/checkpoint page. Session expired. Current URL: ${currentUrl}`);
        }

        userLog(`✅ [${ACCOUNT_ID}] Post page loaded successfully`);

        // STEP 3: Find and click share button
        debugLog(`🔍 [${ACCOUNT_ID}] STEP 3: Looking for share button...`);

        const shareButton = await page.evaluate(() => {
            // Use specific selector for share button in dialog
            const shareButton = document.querySelector('[role="dialog"] [aria-label="Send this to friends or post it on your profile."]');

            if (shareButton) {
                // [browser] debugLog('✅ Found share button in dialog with aria-label selector');
                shareButton.click();
                return true;
            } else {
                // [browser] debugLog('❌ Share button not found in dialog with aria-label selector');

                // Fallback: try other selectors
                const fallbackSelectors = [
                    '[data-ad-rendering-role="share_button"]',
                    'div[aria-label*="Send this to friends"]',
                    'div[aria-label="Share"][role="button"][tabindex="0"]',
                    'div[aria-label*="Kirim ini ke teman"]'
                ];

                for (const selector of fallbackSelectors) {
                    try {
                        const fallbackButton = document.querySelector(selector);
                        if (fallbackButton) {
                            // [browser] debugLog(`✅ Found share button with fallback selector: ${selector}`);
                            fallbackButton.click();
                            return true;
                        }
                    } catch (e) {
                        // [browser] debugLog(`⚠️ Error with fallback selector ${selector}:`, e.message);
                    }
                }

                // [browser] debugLog('❌ Share button not found with any selector');
                return false;
            }
        });

        if (!shareButton) {
            throw new Error('Share button not found');
        }

        // Wait for share dialog to open
        debugLog(`⏳ [${ACCOUNT_ID}] Waiting for share dialog to open...`);
        await page.waitForTimeout(5000);

        // STEP 4: Click "Group" option
        debugLog(`🔍 [${ACCOUNT_ID}] STEP 4: Looking for Group option...`);

        const groupOptionClicked = await page.evaluate(() => {
            // Cari span dengan teks 'Group'
            const groupSpan = [...document.querySelectorAll('span')]
                .find(s => s.textContent.trim() === 'Group');

            if (groupSpan) {
                // Ambil parent yang bisa diklik (dua tingkat ke atas)
                const groupButton = groupSpan?.parentElement?.parentElement;

                if (groupButton) {
                    groupButton.click();
                    // [browser] debugLog('✅ Group option found and clicked');
                    return true;
                }
            }

            // [browser] debugLog('❌ Group option not found');
            return false;
        });

        if (!groupOptionClicked) {
            throw new Error('Group option not found');
        }

        // Wait for group search to appear
        debugLog(`⏳ [${ACCOUNT_ID}] Waiting for group search to appear...`);
        await page.waitForTimeout(3000);

        // STEP 5: Search and select the group
        debugLog(`🔍 [${ACCOUNT_ID}] STEP 5: Searching for group: ${group.name}`);

        const groupSelected = await searchAndSelectGroup(page, group.name);
        if (!groupSelected) {
            throw new Error(`Could not find or select group: ${group.name}`);
        }

        // Wait for group selection to complete
        debugLog('⏳ Waiting for group selection to complete...');
        await page.waitForTimeout(2000);

        // STEP 6: Fill caption if provided
        if (caption && caption.trim()) {
            debugLog(`✏️ [${ACCOUNT_ID}] STEP 6: Filling caption: "${caption}"`);

            const captionFilled = await page.evaluate((captionText) => {
                // Try multiple selectors for caption text area
                const selectors = [
                    '[aria-placeholder="Create a public post…"]',
                    '[aria-placeholder*="Create a public post"]',
                    '[aria-placeholder*="Buat postingan publik"]',
                    'div[contenteditable="true"][role="textbox"]',
                    'div[contenteditable="true"]',
                    'textarea[aria-label*="caption"]',
                    'textarea[placeholder*="post"]'
                ];

                for (const selector of selectors) {
                    try {
                        const postBox = document.querySelector(selector);
                        if (postBox) {
                            // [browser] debugLog(`✅ Found caption text area with selector: ${selector}`);
                            // Focus on the text area
                            postBox.focus();
                            return true;
                        }
                    } catch (e) {
                        // [browser] debugLog(`⚠️ Error with selector ${selector}:`, e.message);
                    }
                }

                // [browser] debugLog('❌ Caption text area not found with any selector');
                return false;
            }, caption);

            if (captionFilled) {
                // Clear any existing text first
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.waitForTimeout(300);
                await page.keyboard.press('Delete');
                await page.waitForTimeout(500);

                // Type caption using human-like typing (from marketplace pattern)
                debugLog(`⌨️ Typing caption: "${caption}"`);
                for (const char of caption) {
                    await page.keyboard.type(char);
                    const delay = 50 + Math.random() * 150; // 50–200 ms delay between characters
                    await page.waitForTimeout(delay);
                }

                debugLog('✅ Caption typed successfully');
                await page.waitForTimeout(1000);
            } else {
                debugLog('⚠️ Could not fill caption, continuing without caption');
            }
        } else {
            debugLog('📝 No caption to fill');
        }

        // STEP 7: Click post button
        debugLog(`🔍 [${ACCOUNT_ID}] STEP 7: Looking for post button...`);

        // Wait longer for the post button to appear after filling caption
        await page.waitForTimeout(5000);

        // Try to scroll a bit to ensure dialog is fully visible
        await page.evaluate(() => {
            window.scrollBy(0, 100);
        });
        await page.waitForTimeout(1000);

        const postClicked = await page.evaluate(() => {
            // Ambil tombol berdasarkan aria-label (seperti yang diminta user)
            const postButton = document.querySelector('div[aria-label="Post"][role="button"]');

            if (postButton) {
                postButton.click();  // Klik tombol
                // [browser] debugLog('Tombol Post diklik!');
                return true;
            } else {
                // [browser] debugLog('Tombol Post tidak ditemukan.');
                return false;
            }
        });

        if (!postClicked) {
            // Try alternative approach - press Enter key
            debugLog('🔄 Trying alternative: pressing Enter key...');
            await page.keyboard.press('Enter');
            debugLog('✅ Enter key pressed as alternative');
            await page.waitForTimeout(2000);
        }

        // Wait for share to complete
        debugLog(`⏳ [${ACCOUNT_ID}] Waiting for share to complete...`);
        await page.waitForTimeout(5000);

        userLog(`✅ [${ACCOUNT_ID}] Share process completed successfully for group: ${group.name}`);
        return true;

    } catch (error) {
        console.error(`❌ [${ACCOUNT_ID}] Error sharing to group ${group.name}: ${error.message}`);
        console.error(`   [${ACCOUNT_ID}] Error details:`, error.stack);
        return false;
    }
}

async function searchAndSelectGroup(page, groupName) {
    try {
        // Clean group name first - remove any extra text after actual name
        let cleanGroupName = groupName;
        // Remove common Facebook status texts
        cleanGroupName = cleanGroupName.replace(/Last active.*/i, '').trim();
        cleanGroupName = cleanGroupName.replace(/Active.*/i, '').trim();
        cleanGroupName = cleanGroupName.replace(/about an hour ago.*/i, '').trim();
        cleanGroupName = cleanGroupName.replace(/ago.*/i, '').trim();

        debugLog(`🔍 Searching for group: "${groupName}"`);
        debugLog(`🧹 Cleaned group name: "${cleanGroupName}"`);

        // STEP 1: Find and prepare group search input
        debugLog('🔍 Looking for group search input...');
        const searchInputReady = await page.evaluate(() => {
            const groupSearchInput = document.querySelector('input[aria-label="Search for groups"]');

            if (groupSearchInput) {
                // [browser] debugLog('✅ Group search input found');
                // Clear input first
                groupSearchInput.value = '';
                groupSearchInput.focus();
                // Trigger input event to ensure Facebook recognizes the clear
                groupSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                // [browser] debugLog('✅ Group search input cleared and focused');
                return true;
            } else {
                // [browser] debugLog('❌ Group search input not found');
                return false;
            }
        });

        if (!searchInputReady) {
            return false;
        }

        // STEP 2: ⚡ FAST TYPING group name
        debugLog(`⌨️ Fast typing group name: "${cleanGroupName}"`);

        // ⚡ Type the entire group name at once with fast delay
        await page.keyboard.type(cleanGroupName, {
            delay: 10 + Math.random() * 20 // 10-30ms per karakter (CEPAT)
        });

        // Wait for search results to appear
        debugLog('⏳ Waiting for search results...');
        await page.waitForTimeout(2500);

        // STEP 3: Check if group appears in results and click it
        const groupFound = await page.evaluate((searchText) => {
            // Try multiple search strategies
            const strategies = [
                // Strategy 1: Exact XPath match
                () => {
                    const xpath = `//span[text()="${searchText}"]/ancestor::div[@role="button"]`;
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    return result.singleNodeValue;
                },
                // Strategy 2: Partial text match
                () => {
                    const spans = document.querySelectorAll('span');
                    for (const span of spans) {
                        if (span.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
                            // Find closest button ancestor
                            let element = span;
                            while (element && element !== document.body) {
                                if (element.getAttribute('role') === 'button') {
                                    return element;
                                }
                                element = element.parentElement;
                            }
                        }
                    }
                    return null;
                },
                // Strategy 3: Contains text anywhere in button
                () => {
                    const buttons = document.querySelectorAll('div[role="button"]');
                    for (const button of buttons) {
                        if (button.textContent.toLowerCase().includes(searchText.toLowerCase())) {
                            return button;
                        }
                    }
                    return null;
                }
            ];

            for (const strategy of strategies) {
                try {
                    const foundElement = strategy();
                    if (foundElement) {
                        // [browser] debugLog(`✅ Found group with strategy, clicking...`);
                        foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        foundElement.click();
                        return true;
                    }
                } catch (e) {
                    // [browser] debugLog(`⚠️ Strategy failed:`, e.message);
                }
            }

            // [browser] debugLog(`❌ No group found for "${searchText}" with any strategy`);
            return false;
        }, cleanGroupName);

        if (groupFound) {
            debugLog(`🎯 Group found and selected: "${cleanGroupName}"`);
            // Wait a bit after clicking
            await page.waitForTimeout(2000);
            return true;
        }

        debugLog(`❌ Group "${cleanGroupName}" not found after searching`);
        return false;

    } catch (error) {
        console.error(`❌ Error searching for group: ${error.message}`);
        return false;
    }
}

// ========== FUNGSI VERIFIKASI STATUS SHARE ==========
// Verifikasi apakah share benar-benar muncul di group setelah sharing

// Jalankan script
if (require.main === module) {
    // Ensure stdin is flowing to receive data from parent process
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    runFacebookSharePoster();
}
