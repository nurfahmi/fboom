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
async function getBrowserExecutablePath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    debugLog(`🔍 getBrowserExecutablePath() called`);
    debugLog(`🔍 PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'not set'}`);

    // Check if custom PLAYWRIGHT_BROWSERS_PATH is set
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

    // Fallback: check common locations (prioritize global ms-playwright for production)
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

// Dapatkan session directory dari environment variable
const ACCOUNT_SESSION_DIR = process.env.ACCOUNT_SESSION_DIR ||
    path.join(__dirname, 'sessions');
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || 'Default Account';

debugLog(`👤 Account: ${ACCOUNT_NAME} (${ACCOUNT_ID})`);
debugLog(`📁 Session: ${ACCOUNT_SESSION_DIR}`);

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

async function runFacebookCommentPoster() {
    let commentData = '';

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
                            if (global.commentData) {
                                // Use global.commentData instead of local commentData
                                await continueAfterLogin(global.commentData);
                            } else {
                                console.error(`❌ [${ACCOUNT_ID}] No commentData found`);
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
            } else if (parsed.action === 'bring-browser-to-front') {
                const uniqueTitle = parsed.uniqueTitle || `FBOOM-ACCOUNT-${ACCOUNT_ID}`;
                userLog(`🔄 [${ACCOUNT_ID}] Bringing browser to front with unique title: ${uniqueTitle}...`);
                process.nextTick(async () => {
                    try {
                        if (global.browserInstance) {
                            // For launchPersistentContext, browserInstance IS the BrowserContext
                            const pages = global.browserInstance.pages() || [];
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

                                // AGGRESSIVE METHOD: Multiple techniques to show browser window
                                try {
                                    debugLog(`🔄 [${ACCOUNT_ID}] Using AGGRESSIVE method to show browser...`);

                                    // TECHNIQUE 1: Use CDPSession to send Window commands
                                    try {
                                        const client = await page.context().newCDPSession(page);
                                        await client.send('Page.enable');
                                        await client.send('Page.bringToFront');
                                        userLog(`✅ [${ACCOUNT_ID}] CDPSession bringToFront executed`);
                                    } catch (cdpError) {
                                        debugLog(`⚠️ [${ACCOUNT_ID}] CDPSession method failed: ${cdpError.message}`);
                                    }

                                    // TECHNIQUE 2: Use Page.bringToFront() (Playwright API)
                                    await page.bringToFront();

                                    // TECHNIQUE 3: Aggressive JavaScript execution
                                    // 🔧 FIX: Untuk launchPersistentContext, page.context() tidak diperlukan lagi
                                    await page.evaluate(() => {
                                        // 2. Move window to position 0,0 and resize to full screen
                                        if (window.moveTo && window.resizeTo) {
                                            window.moveTo(0, 0);
                                            window.resizeTo(screen.width, screen.height);
                                        }

                                        // 3. Force focus with multiple approaches
                                        window.focus();
                                        if (document.body) {
                                            document.body.focus();
                                        }
                                        if (document.activeElement) {
                                            document.activeElement.blur();
                                        }

                                        // 4. Create a modal overlay that must be clicked
                                        const overlay = document.createElement('div');
                                        overlay.style.cssText = `
                                            position: fixed !important;
                                            top: 0 !important;
                                            left: 0 !important;
                                            width: 100vw !important;
                                            height: 100vh !important;
                                            background: rgba(102, 126, 234, 0.95) !important;
                                            z-index: 999999999 !important;
                                            display: flex !important;
                                            align-items: center !important;
                                            justify-content: center !important;
                                            cursor: pointer !important;
                                        `;

                                        const modalContent = document.createElement('div');
                                        modalContent.style.cssText = `
                                            background: white !important;
                                            padding: 40px 60px !important;
                                            border-radius: 20px !important;
                                            text-align: center !important;
                                            font-family: Arial, sans-serif !important;
                                            box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
                                            animation: modalPop 0.3s ease-out !important;
                                        `;

                                        modalContent.innerHTML = `
                                            <div style="font-size: 48px; margin-bottom: 20px;">🌐</div>
                                            <h2 style="margin: 0 0 10px 0; color: #667eea; font-size: 24px;">
                                                BROWSER DIAKTIFKAN
                                            </h2>
                                            <p style="margin: 10px 0 0 0; color: #666; font-size: 16px;">
                                                Klik di mana saja untuk melanjutkan
                                            </p>
                                            <p style="margin: 5px 0 0 0; color: #999; font-size: 14px;">
                                                Proses auto comment sedang berjalan...
                                            </p>
                                        `;

                                        overlay.appendChild(modalContent);
                                        document.body.appendChild(overlay);

                                        const style = document.createElement('style');
                                        style.textContent = `
                                            @keyframes modalPop {
                                                0% { transform: scale(0.8); opacity: 0; }
                                                100% { transform: scale(1); opacity: 1; }
                                            }
                                        `;
                                        document.head.appendChild(style);

                                        const removeOverlay = () => {
                                            try {
                                                if (overlay.parentNode) {
                                                    overlay.style.animation = 'modalPop 0.3s ease-out reverse';
                                                    setTimeout(() => {
                                                        if (overlay.parentNode) {
                                                            overlay.parentNode.removeChild(overlay);
                                                        }
                                                    }, 300);
                                                }
                                            } catch (e) { }
                                        };

                                        overlay.onclick = removeOverlay;
                                        setTimeout(removeOverlay, 10000);

                                        // 5. Flash the title bar aggressively
                                        const originalTitle = document.title;
                                        let flashCount = 0;
                                        const flashMessages = [
                                            '🔔 BROWSER AKTIF',
                                            '⚠️ PERHATIAN!',
                                            '💬 AUTO COMMENT',
                                            '✅ AKUN DIAKTIFKAN'
                                        ];

                                        const flashInterval = setInterval(() => {
                                            document.title = flashMessages[flashCount % flashMessages.length] + ' - ' + originalTitle;
                                            flashCount++;
                                            if (flashCount > 10) {
                                                clearInterval(flashInterval);
                                                document.title = originalTitle;
                                            }
                                        }, 300);

                                        // 6. Try to open a new popup window
                                        try {
                                            const popup = window.open('', '_blank', 'width=1,height=1');
                                            if (popup) {
                                                popup.focus();
                                                setTimeout(() => popup.close(), 100);
                                            }
                                        } catch (e) { }

                                        // 7. Play a sound
                                        try {
                                            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                                            const oscillator = audioCtx.createOscillator();
                                            const gainNode = audioCtx.createGain();

                                            oscillator.connect(gainNode);
                                            gainNode.connect(audioCtx.destination);

                                            oscillator.frequency.value = 800;
                                            oscillator.type = 'sine';

                                            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
                                            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

                                            oscillator.start(audioCtx.currentTime);
                                            oscillator.stop(audioCtx.currentTime + 0.5);
                                        } catch (e) { }

                                        // 8. Scroll to top
                                        window.scrollTo(0, 0);
                                    });

                                    // TECHNIQUE 4: Wait and try again
                                    await page.waitForTimeout(500);

                                    // TECHNIQUE 5: Send keyboard events
                                    try {
                                        await page.keyboard.press('Control');
                                        await page.waitForTimeout(100);
                                    } catch (e) { }

                                    userLog(`✅ [${ACCOUNT_ID}] Aggressive browser show executed!`);

                                } catch (error) {
                                    console.error(`❌ [${ACCOUNT_ID}] Error in aggressive browser show: ${error.message}`);
                                }
                            } else {
                                debugLog(`⚠️ [${ACCOUNT_ID}] No pages found in browser`);
                            }
                        } else {
                            debugLog(`⚠️ [${ACCOUNT_ID}] No browser instance available`);
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error in bring-browser-to-front: ${error.message}`);
                    }
                });
            } else if (parsed.action === 'cancel-posting') {
                userLog(`⏹️ [${ACCOUNT_ID}] Comment posting cancelled by user`);
                isCancelled = true;
                isProcessRunning = false;

                // Send status update to UI
                userLog(`COMMENT_STATUS_UPDATE:cancelled:Proses comment dibatalkan oleh user`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:COMMENT_STATUS_UPDATE:cancelled:Proses comment dibatalkan oleh user\n`);
                // Biarkan browser tetap terbuka untuk mempertahankan session
                process.exit(0);
            } else {
                commentData = parsed;
                global.commentData = parsed; // Store in global for login confirmation
                userLog(`✅ [${ACCOUNT_ID}] Comment data received for auto commenting`);

                process.nextTick(async () => {
                    try {
                        if (!isProcessRunning) {
                            isProcessRunning = true;
                            await startCommentProcess(commentData);
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error starting comment process: ${error.message}`);
                        process.exit(1);
                    }
                });
            }
        } catch (error) {
            userLog(`📝 [${ACCOUNT_ID}] Raw input: ${data.substring(0, 100)}`);
        }
    });
}

async function startCommentProcess(commentData) {
    userLog(`💬 [${ACCOUNT_ID}] Starting Facebook Auto Comment process for ${ACCOUNT_NAME}...`);

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
                executablePath: executablePath,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                slowMo: 0,
                timeout: 120000,
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
            const accountTitle = `[${ACCOUNT_NAME}] - Facebook Auto Comment`;
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
                        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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

        userLog(`⏰ [${ACCOUNT_ID}] Waiting 10 seconds for user to login...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            debugLog(`❓ [${ACCOUNT_ID}] Please check browser and login if needed`);
            userLog(`✅ [${ACCOUNT_ID}] If already logged in, click YES in the app popup`);
            debugLog(`❌ [${ACCOUNT_ID}] If not logged in, click NO to cancel`);

            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.commentData = commentData;

        }, 10000);

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
                    await continueCommentProcess(page, browser, commentData);
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

async function continueAfterLogin(commentData) {
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

        await continueCommentProcess(global.loginPage, global.browserInstance, commentData);
    } finally {
        delete global.loginPage;
        delete global.browserInstance;
        delete global.commentData;
    }
}

async function continueCommentProcess(page, browser, commentData) {
    userLog(`\n💬 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🚀 [${ACCOUNT_ID}] STARTING AUTO COMMENT PROCESS`);
    userLog(`📋 [${ACCOUNT_ID}] MODE: SEQUENTIAL (One post at a time)`);
    debugLog(`⏳ [${ACCOUNT_ID}] Processing each post with delay`);
    debugLog(`==========================================\n`);

    try {
        const links = commentData.links || [];
        const hasSpintax = commentData.hasSpintax || false;
        let text = commentData.commentText || '';
        const filePath = commentData.filePath;
        const delayMin = commentData.delayMin || 10;
        const delayMax = commentData.delayMax || 30;

        const totalPosts = links.length;

        debugLog(`📦 [${ACCOUNT_ID}] Found ${totalPosts} posts to comment on`);
        userLog(`💬 [${ACCOUNT_ID}] Comment text (${text.length} chars): "${text}"${hasSpintax ? ' [HAS SPINTAX]' : ''}`);
        userLog(`📋 [${ACCOUNT_ID}] Comment data received:`, {
            textLength: text.length,
            linksCount: links.length,
            filePath: filePath,
            delayMin: delayMin,
            delayMax: delayMax,
            hasSpintax: hasSpintax
        });
        debugLog(`⏱️ [${ACCOUNT_ID}] Delay between posts: ${delayMin}-${delayMax} seconds (random)`);
        debugLog('');

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < totalPosts; i++) {
            // Check if cancelled
            if (isCancelled) {
                userLog(`⏹️ [${ACCOUNT_ID}] Commenting cancelled by user at post ${i + 1}/${totalPosts}`);
                break;
            }

            const postLink = links[i];
            const postNumber = i + 1;

            debugLog(`\n📌 [${ACCOUNT_ID}] ================= POST ${postNumber}/${totalPosts} =================`);
            userLog(`🔗 [${ACCOUNT_ID}] Processing: ${postLink}`);
            debugLog(`COMMENT_START:${postNumber}/${totalPosts}:${postLink}`);
            process.stdout.write(`COMMENT_STATUS_UPDATE:${postNumber - 1}:processing:Sedang memproses postingan...\n`);

            let postSuccess = false;

            try {
                userLog(`🔄 [${ACCOUNT_ID}] STARTING COMMENT PROCESS FOR POST ${postNumber}/${totalPosts}`);

                // Navigate to the post
                debugLog(`🌐 [${ACCOUNT_ID}] Navigating to post...`);
                await page.goto(postLink, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                // Wait for page to load
                await page.waitForTimeout(5000);

                // Check if we're on the correct post page
                const currentUrl = await page.url();
                if (!currentUrl.includes('facebook.com') || currentUrl.includes('login')) {
                    throw new Error(`Failed to load post page or not logged in. Current URL: ${currentUrl}`);
                }

                userLog(`✅ [${ACCOUNT_ID}] Successfully loaded post page`);

                // Comment on the post
                userLog(`💬 [${ACCOUNT_ID}] Commenting on post ${postNumber}`);

                // Apply spin text if hasSpintax flag is true (different for each comment)
                let commentText = text;
                if (hasSpintax) {
                    commentText = spinText(text);
                    debugLog(`🎲 [${ACCOUNT_ID}] Spin text applied for post ${postNumber}: "${text}" → "${commentText}"`);
                }

                const commentSuccess = await commentOnPost(page, commentText, filePath);
                if (commentSuccess) {
                    // SKIP VERIFICATION: Assume comment is successful to speed up process
                    userLog(`✅ [${ACCOUNT_ID}] Comment posted successfully on post ${postNumber} (verification skipped)`);
                    debugLog(`COMMENT_SUCCESS:${postNumber}/${totalPosts}:${postLink}`);
                    process.stdout.write(`COMMENT_STATUS_UPDATE:${postNumber - 1}:success:Comment berhasil dikirim (verifikasi dilewati)\n`);
                    successCount++;
                    postSuccess = true;
                } else {
                    debugLog(`❌ [${ACCOUNT_ID}] Comment failed on post ${postNumber}`);
                    userLog(`COMMENT_ERROR:${postNumber}/${totalPosts}:Comment gagal - tidak dapat mengakses comment box`);
                    process.stdout.write(`COMMENT_STATUS_UPDATE:${postNumber - 1}:error:Gagal mengakses comment box\n`);
                    failCount++;
                    postSuccess = false;
                }

                userLog(`🎉 [${ACCOUNT_ID}] FINISHED ALL COMMENTS ON POST ${postNumber}/${totalPosts}!`);

                userLog(`✅ [${ACCOUNT_ID}] POST ${postNumber} FULLY PROCESSED\n`);

            } catch (error) {
                console.error(`❌ [${ACCOUNT_ID}] CRITICAL FAILURE - POST ${postNumber} NOT COMMENTED`);
                console.error(`   [${ACCOUNT_ID}] Post: ${postLink}`);
                console.error(`   [${ACCOUNT_ID}] Error: ${error.message}`);
                userLog(`COMMENT_ERROR:${postNumber}/${totalPosts}:${error.message}`);
                process.stdout.write(`COMMENT_STATUS_UPDATE:${postNumber - 1}:error:${error.message}\n`);
                failCount++;
                postSuccess = false;

                debugLog(`⏭️ [${ACCOUNT_ID}] CONTINUING TO NEXT POST...\n`);
            }

            // Wait before next post (except for last post)
            if (i < totalPosts - 1) {
                // Use delay range from commentData or default values
                const minDelay = delayMin;
                const maxDelay = delayMax;

                // Random delay antara delayMin sampai delayMax detik
                const randomDelay = minDelay + Math.random() * (maxDelay - minDelay);
                const waitTime = randomDelay * 1000; // Convert to milliseconds

                debugLog(`⏳ [${ACCOUNT_ID}] WAITING ${Math.round(randomDelay)} SECONDS BEFORE NEXT POST...`);
                debugLog(`   [${ACCOUNT_ID}] (Delay range: ${minDelay}-${maxDelay}s, previous post ${postSuccess ? 'succeeded' : 'failed'})`);
                await page.waitForTimeout(waitTime);

                // Additional check: make sure page is ready
                try {
                    await page.waitForLoadState('networkidle', { timeout: 5000 });
                } catch (e) {
                    debugLog('⚠️ [${ACCOUNT_ID}] Page still loading, continuing anyway...');
                }
            } else {
                // LAST POST: Tunggu extra time untuk memastikan comment terakhir benar-benar terposting
                userLog(`🎯 [${ACCOUNT_ID}] LAST POST PROCESSED - Waiting to ensure comment is posted...`);
                await page.waitForTimeout(5000); // Tunggu 5 detik extra
            }

            // Rest Time: Setiap N comment, rest untuk X detik
            const restCount = commentData.restCount || 5;  // default: setiap 5 comment
            const restDelay = commentData.restDelay || 300;  // default: rest 300 detik (5 menit)

            // Cek apakah sudah mencapai restCount (hanya hitung successful comments)
            if ((successCount % restCount === 0) && (successCount > 0) && (i < totalPosts - 1)) {
                userLog(`💤 [${ACCOUNT_ID}] REST TIME: ${successCount} comments completed. Taking a break for ${restDelay} seconds (${Math.round(restDelay / 60)} minutes)...`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:REST_TIME:Started - resting for ${restDelay} seconds after ${successCount} comments\n`);

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

                userLog(`✅ [${ACCOUNT_ID}] Rest time completed! Resuming commenting...`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:REST_TIME:Completed - resuming commenting\n`);
            }
        }

        // Final summary
        userLog(`\n🎯 [${ACCOUNT_ID}] ==========================================`);
        userLog(`📊 [${ACCOUNT_ID}] AUTO COMMENT SUMMARY`);
        debugLog('══════════════════════════════════════════');
        debugLog(`📦 [${ACCOUNT_ID}] Total posts processed: ${totalPosts}`);
        userLog(`✅ [${ACCOUNT_ID}] Successful comments: ${successCount}`);
        debugLog(`❌ [${ACCOUNT_ID}] Failed comments: ${failCount}`);
        userLog(`📊 [${ACCOUNT_ID}] Success rate: ${Math.round((successCount / totalPosts) * 100)}%`);
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] Process was cancelled by user`);
        }
        debugLog('══════════════════════════════════════════');
        if (isCancelled) {
            debugLog(`⏹️ [${ACCOUNT_ID}] AUTO COMMENT SESSION CANCELLED`);
        } else {
            userLog(`✅ [${ACCOUNT_ID}] ALL POSTS PROCESSED SEQUENTIALLY`);
            userLog(`🎉 [${ACCOUNT_ID}] AUTO_COMMENT_COMPLETED`);
        }
        debugLog('==========================================\n');

        isProcessRunning = false;

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Auto comment error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    }
}

async function commentOnPost(page, commentText, filePath) {
    try {
        debugLog('🔍 Starting comment process...');

        // Wait for page to stabilize
        await page.waitForTimeout(2000);

        // STEP 1: CLICK COMMENT BUTTON TO OPEN COMMENT BOX
        debugLog('🎯 Step 1: Looking for Comment button...');

        const commentButtonSelectors = [
            '[aria-label="Comment"]',
            '[role="button"][aria-label="Comment"]',
            '[aria-expanded="false"][aria-label="Comment"]',
            'div[aria-label="Comment"]',
            'div[role="textbox"][data-lexical-editor="true"]',
            'div[role="textbox"][aria-label^="Comment as"]',
            'div[role="textbox"][aria-label*="comment" i]',
            'div[role="textbox"][placeholder*="Write" i]',
        ];

        let commentButtonClicked = false;

        for (const selector of commentButtonSelectors) {
            try {
                debugLog(`🔍 Trying Comment button selector: ${selector}`);
                const buttons = await page.locator(selector).all();

                if (buttons.length > 0) {
                    debugLog(`📊 Found ${buttons.length} Comment buttons`);

                    // Try to find a clickable button
                    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
                        const button = buttons[i];
                        try {
                            const isVisible = await button.isVisible({ timeout: 1000 });
                            if (isVisible) {
                                userLog(`🎯 Clicking Comment button ${i + 1}...`);
                                await button.click({ timeout: 5000 });
                                userLog(`✅ Comment button clicked successfully`);
                                commentButtonClicked = true;

                                // Wait for comment box to appear after clicking button
                                await page.waitForTimeout(1500);
                                break;
                            }
                        } catch (err) {
                            debugLog(`⚠️ Button ${i} not clickable: ${err.message}`);
                            continue;
                        }
                    }

                    if (commentButtonClicked) break;
                }
            } catch (e) {
                debugLog(`⚠️ Selector failed: ${selector} - ${e.message}`);
                continue;
            }
        }

        if (!commentButtonClicked) {
            debugLog('❌ Comment button not found - cannot proceed');
            return false;
        }

        debugLog('✅ Comment button clicked, proceeding to find comment box...');

        // STEP 2: FIND COMMENT BOX
        debugLog('🔍 Step 2: Looking for comment box...');

        // Wait for comment box to be available - increased wait time
        await page.waitForTimeout(2000);

        // Wait specifically for comment box to appear
        try {
            await page.waitForSelector('div[role="textbox"][contenteditable="true"]', { timeout: 5000 });
        } catch (e) {
            debugLog('⚠️ Comment box selector not found within timeout, continuing anyway...');
        }

        // Find comment box using the selectors provided by user
        const commentBoxSelectors = [
            'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
            'div[role="textbox"][contenteditable="true"][aria-label^="Comment as"]',
            'div[role="textbox"][contenteditable="true"][aria-label*="comment" i]',
            'div[role="textbox"][contenteditable="true"][placeholder*="Write" i]',
            'div[role="textbox"][contenteditable="true"]',
            '[role="textbox"][contenteditable="true"]'
        ];

        let commentBox = null;
        let selectorIndex = 0;

        for (const selector of commentBoxSelectors) {
            try {
                debugLog(`🔍 Trying selector ${selectorIndex + 1}/${commentBoxSelectors.length}: ${selector}`);
                const elements = await page.locator(selector).all();
                debugLog(`📊 Found ${elements.length} elements with this selector`);

                if (elements.length > 0) {
                    // Try to find the most visible and interactable comment box
                    for (let i = 0; i < Math.min(elements.length, 5); i++) {
                        const element = elements[i];
                        try {
                            const isVisible = await element.isVisible({ timeout: 1000 });
                            const isEditable = await element.isEditable({ timeout: 1000 });

                            debugLog(`   Element ${i}: visible=${isVisible}, editable=${isEditable}`);

                            if (isVisible && isEditable) {
                                commentBox = element;
                                debugLog(`✅ Found suitable comment box (element ${i}) with selector: ${selector}`);
                                break;
                            }
                        } catch (err) {
                            debugLog(`   Element ${i}: Error checking - ${err.message}`);
                            continue;
                        }
                    }

                    if (commentBox) break;
                }
                selectorIndex++;
            } catch (e) {
                debugLog(`⚠️ Selector failed: ${e.message}`);
                selectorIndex++;
                continue;
            }
        }

        if (!commentBox) {
            debugLog('❌ Comment box not found after trying all selectors');
            debugLog('💡 Trying alternative: scroll to bottom and retry...');

            // Alternative: Scroll to bottom to ensure comment section is loaded
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);

            // Retry with first selector
            try {
                const elements = await page.locator('div[role="textbox"][contenteditable="true"]').all();
                if (elements.length > 0) {
                    commentBox = elements[0];
                    // [browser] debugLog('✅ Found comment box after scrolling');
                }
            } catch (e) {
                // [browser] debugLog('❌ Still cannot find comment box after scrolling');
            }

            if (!commentBox) {
                return false;
            }
        }

        // Click and fill the comment box
        // [browser] debugLog('🎯 Clicking on comment box...');
        await commentBox.click();

        // Wait a bit for comment box to be ready
        await page.waitForTimeout(500);

        // Verify comment box is focused and ready
        const isVisible = await commentBox.isVisible();
        const isEditable = await commentBox.isEditable();
        console.log(`📊 Comment box visible: ${isVisible}, editable: ${isEditable}`);

        if (!isVisible || !isEditable) {
            debugLog('⚠️ Comment box not ready, trying alternative approach...');
            // Try clicking again and waiting longer
            await commentBox.click();
            await page.waitForTimeout(1000);
        }

        // Clear any existing text first
        await commentBox.fill('');

        // Fill the comment text (removed logging to avoid encoding issues)
        await commentBox.fill(commentText);

        // Wait for text to be filled
        await page.waitForTimeout(1000);

        // Verify text was filled (removed logging to avoid encoding issues)
        const filledText = await commentBox.textContent();

        // Upload file if provided
        if (filePath && fs.existsSync(filePath)) {
            debugLog('📎 Uploading file...');

            // Look for file input
            const fileInputs = await page.locator('input[type="file"]').all();

            if (fileInputs.length > 0) {
                // Use the appropriate file input (usually for attachments)
                const fileInput = fileInputs.length > 1 ? fileInputs[1] : fileInputs[0]; // Try second input for attachments
                await fileInput.setInputFiles(filePath);
                debugLog('✅ File uploaded');

                // Wait for upload to complete
                await page.waitForTimeout(3000);
            } else {
                debugLog('⚠️ No file input found for attachments');
            }
        }

        // Find and click the post button
        debugLog('🔍 Looking for post button...');

        const postButtonSelectors = [
            '#focused-state-composer-submit [role="button"]',
            '[aria-label="Comment"]',
            '[aria-label="Post"]',
            'button[type="submit"]',
            '[role="button"]:has-text("Comment")',
            '[role="button"]:has-text("Post")'
        ];

        let postButton = null;
        for (const selector of postButtonSelectors) {
            try {
                const button = await page.locator(selector).first();
                if (await button.count() > 0) {
                    const isVisible = await button.isVisible();
                    const isDisabled = await button.getAttribute('aria-disabled');

                    if (isVisible && isDisabled !== 'true') {
                        postButton = button;
                        debugLog(`✅ Found post button with selector: ${selector}`);
                        break;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        if (!postButton) {
            debugLog('❌ Post button not found or not clickable');
            return false;
        }

        // Click the post button
        debugLog('📤 Clicking post button...');
        await postButton.click({ delay: 200 });

        // Wait for comment to be posted
        debugLog('⏳ Waiting for comment to be posted...');
        await page.waitForTimeout(3000);

        // Check if comment was posted successfully
        const currentUrl = await page.url();
        if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
            debugLog('✅ Comment posted successfully');
            return true;
        } else {
            debugLog('⚠️ Comment may not have been posted (URL changed unexpectedly)');
            return false;
        }

    } catch (error) {
        console.error(`❌ Error commenting on post: ${error.message}`);
        return false;
    }
}

// ========== FUNGSI VERIFIKASI STATUS COMMENT ==========
// Verifikasi apakah comment benar-benar muncul di post setelah commenting
async function verifyCommentOnPost(page, postLink, commentText) {
    debugLog(`🔍 Verifying comment on post: ${postLink}`);

    try {
        // Tunggu beberapa detik untuk memastikan comment diproses
        await page.waitForTimeout(3000);

        // Refresh halaman untuk memastikan comment terbaru muncul
        userLog(`🔄 Refreshing page to check for new comments...`);
        await page.reload({
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Tunggu lagi setelah reload
        await page.waitForTimeout(3000);

        // Cari comment yang baru saja dibuat
        const commentFound = await page.evaluate((comment) => {
            // [browser] debugLog(`🔍 Looking for comment with text: "${comment}"`);

            // Cari semua comment di post
            const comments = document.querySelectorAll('[data-pagelet*="Comment"], [role="article"] [data-visualcompletion], div[data-signature]');

            // [browser] debugLog(`📊 Found ${comments.length} comment elements on page`);

            for (let i = 0; i < Math.min(comments.length, 10); i++) { // Cek 10 comment teratas
                const commentEl = comments[i];

                try {
                    // Cari teks dalam comment
                    const commentText = commentEl.textContent || '';
                    const commentTextLower = commentText.toLowerCase();
                    const searchTextLower = comment.toLowerCase();

                    // Cek apakah comment text ada dalam comment element
                    const words = searchTextLower.split(' ');
                    let matchCount = 0;

                    for (const word of words) {
                        if (word.length > 2 && commentTextLower.includes(word)) {
                            matchCount++;
                        }
                    }

                    const matchPercentage = words.length > 0 ? (matchCount / words.length) * 100 : 0;

                    console.log(`💬 Comment ${i + 1}: ${matchCount}/${words.length} words matched (${matchPercentage.toFixed(1)}%)`);

                    if (matchPercentage >= 70) { // 70% match cukup untuk verifikasi
                        // [browser] debugLog(`✅ Comment found with sufficient text match (${matchPercentage.toFixed(1)}%)`);
                        return true;
                    }

                } catch (e) {
                    // [browser] debugLog(`⚠️ Error checking comment ${i + 1}:`, e.message);
                }
            }

            // [browser] debugLog(`❌ No matching comment found in recent comments`);
            return false;

        }, commentText);

        if (commentFound) {
            userLog(`✅ VERIFICATION SUCCESS: Comment confirmed on post`);
            return true;
        } else {
            debugLog(`❌ VERIFICATION FAILED: Comment not found on post`);
            return false;
        }

    } catch (error) {
        console.error(`❌ Error during comment verification: ${error.message}`);
        return false;
    }
}

// Jalankan script
if (require.main === module) {
    // Ensure stdin is flowing to receive data from parent process
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    runFacebookCommentPoster();
}
