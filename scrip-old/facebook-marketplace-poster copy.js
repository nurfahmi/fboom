const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== DEBUG MODE - Set to true to see internal debug logs =====
const DEBUG_MODE = false;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => { };

// ===== USER LOG - Always shown to user in UI =====
const userLog = (message) => console.log(message);

// Debug: Show Node version and current directory (internal debug)
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

// Get session directory from environment variable
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

// Global flag to prevent duplicate processes
let isProcessRunning = false;
let isCancelled = false;

async function runFacebookMarketplacePoster() {
    let productsData = '';
    let buffer = '';

    process.stdin.on('data', (chunk) => {
        const data = chunk.toString();
        buffer += data;

        debugLog(`📥 [${ACCOUNT_ID}] Received chunk (${data.length} chars), total buffer: ${buffer.length} chars`);
        debugLog(`📥 [${ACCOUNT_ID}] Chunk preview: ${data.substring(0, 200)}...`);

        // Try to parse complete JSON messages
        try {
            // Check if we have a complete JSON message
            if (buffer.trim()) {
                const parsed = JSON.parse(buffer.trim());
                userLog(`✅ [${ACCOUNT_ID}] Successfully parsed complete JSON message`);

                if (parsed.action === 'login-confirmation') {
                    userLog(`✅ [${ACCOUNT_ID}] Login confirmation: ${parsed.confirmed ? 'CONTINUE' : 'CANCEL'}`);

                    if (parsed.confirmed) {
                        process.nextTick(async () => {
                            try {
                                if (global.productsData) {
                                    // Use global.productsData instead of local productsData
                                    await continueAfterLogin(global.productsData);
                                } else {
                                    console.error(`❌ [${ACCOUNT_ID}] No productsData found`);
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
                    userLog(`⏹️ [${ACCOUNT_ID}] Marketplace posting cancelled by user`);

                    // Update status for currently processing product if any
                    if (global.currentProduct) {
                        userLog(`MARKETPLACE_STATUS_UPDATE:${global.currentProduct.id}:error:Posting cancelled by user`);
                        process.stdout.write(`LOG:${ACCOUNT_ID}:info:MARKETPLACE_STATUS_UPDATE:${global.currentProduct.id}:error:Posting cancelled by user\n`);
                    }

                    // Update status for all products in the current batch that are still posting
                    if (productsData && productsData.products) {
                        productsData.products.forEach(product => {
                            // Send error status for all products (the UI will handle which ones to update)
                            userLog(`MARKETPLACE_STATUS_UPDATE:${product.id}:error:Posting cancelled by user`);
                            process.stdout.write(`LOG:${ACCOUNT_ID}:info:MARKETPLACE_STATUS_UPDATE:${product.id}:error:Posting cancelled by user\n`);
                        });
                    }

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
                                                Proses marketplace posting sedang berjalan...
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
                                                '🛒 MARKETPLACE POSTING',
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
                } else {
                    productsData = parsed;
                    global.productsData = parsed; // Store in global for login confirmation
                    userLog(`✅ [${ACCOUNT_ID}] Products data received for Marketplace posting`);
                    userLog(`📊 [${ACCOUNT_ID}] Products to post: ${parsed.products?.length || 0}`);

                    // Clear buffer after successful parsing
                    buffer = '';

                    process.nextTick(async () => {
                        try {
                            if (!isProcessRunning) {
                                isProcessRunning = true;
                                await startMarketplaceProcess(productsData);
                            }
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error starting marketplace posting: ${error.message}`);
                            process.exit(1);
                        }
                    });
                }
            } // Close buffer.trim() if statement
        } catch (error) {
            debugLog(`⚠️ [${ACCOUNT_ID}] JSON parse failed, waiting for more data...`);
            userLog(`📝 [${ACCOUNT_ID}] Current buffer length: ${buffer.length}`);
            userLog(`📝 [${ACCOUNT_ID}] Buffer preview: ${buffer.substring(0, 300)}...`);
            debugLog(`❌ [${ACCOUNT_ID}] Parse error: ${error.message}`);

            // Don't clear buffer, wait for more data
            // Buffer will be accumulated until complete JSON is received
        }
    });

    // Handle stdin end
    process.stdin.on('end', () => {
        debugLog(`🔚 [${ACCOUNT_ID}] Stdin ended, buffer length: ${buffer.length}`);
        if (buffer.trim()) {
            debugLog(`⚠️ [${ACCOUNT_ID}] Unprocessed data in buffer: ${buffer.substring(0, 200)}...`);
        }
    });

    // Timeout to prevent hanging if no complete data received
    setTimeout(() => {
        if (!isProcessRunning && buffer.trim()) {
            userLog(`⏰ [${ACCOUNT_ID}] Timeout waiting for complete data, attempting to parse anyway...`);
            try {
                const parsed = JSON.parse(buffer.trim());
                debugLog(`✅ [${ACCOUNT_ID}] Successfully parsed with timeout fallback`);
                productsData = parsed;
                global.productsData = parsed; // Store in global for login confirmation
                if (!isProcessRunning) {
                    isProcessRunning = true;
                    startMarketplaceProcess(productsData);
                }
            } catch (error) {
                console.error(`❌ [${ACCOUNT_ID}] Failed to parse even with timeout: ${error.message}`);
                userLog(`📝 [${ACCOUNT_ID}] Final buffer: ${buffer}`);
                process.exit(1);
            }
        }
    }, 30000); // 30 second timeout
}

async function startMarketplaceProcess(productsData) {
    userLog(`🚀 [${ACCOUNT_ID}] Starting Facebook Marketplace posting process for ${ACCOUNT_NAME}...`);
    userLog(`📊 [${ACCOUNT_ID}] Products data: ${JSON.stringify(productsData, null, 2).substring(0, 500)}...`);

    // Use account-specific session directory
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

        // Initialize page (following facebook-groups-poster.js pattern)
        debugLog(`📄 [${ACCOUNT_ID}] Initializing browser page...`);

        const pages = browser.pages();
        debugLog(`📊 [${ACCOUNT_ID}] Found ${pages.length} existing pages`);

        page = pages[0] || await browser.newPage();
        userLog(`✅ [${ACCOUNT_ID}] Page initialized successfully`);

        page.setDefaultTimeout(60000);
        debugLog(`⚙️ [${ACCOUNT_ID}] Page timeout set to 60 seconds`);

        // IMPORTANT: Set global browserInstance IMMEDIATELY after browser is created
        // This ensures the "Open Browser" button works even before login confirmation
        global.browserInstance = browser;
        userLog(`✅ [${ACCOUNT_ID}] Global browser instance set for bring-to-front command`);

        debugLog(`🌐 [${ACCOUNT_ID}] Opening Facebook...`);
        debugLog(`🌐 [${ACCOUNT_ID}] Target URL: https://www.facebook.com/`);

        try {
            await page.goto('https://www.facebook.com/', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            const currentUrl = await page.url();
            debugLog(`🌐 [${ACCOUNT_ID}] Navigation completed. Current URL: ${currentUrl}`);

            // Set browser window title with account name for easy identification
            try {
                const accountTitle = `[${ACCOUNT_NAME}] - Facebook Marketplace`;
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

            if (currentUrl === 'about:blank') {
                console.error(`❌ [${ACCOUNT_ID}] CRITICAL ERROR: Browser navigated to about:blank instead of Facebook!`);
                debugLog(`🔍 [${ACCOUNT_ID}] Browser page info:`, {
                    url: currentUrl,
                    title: await page.title().catch(() => 'unknown'),
                    isClosed: page.isClosed()
                });

                // Try to reload the page
                userLog(`🔄 [${ACCOUNT_ID}] Attempting to reload the page...`);
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                const reloadUrl = await page.url();
                userLog(`🔄 [${ACCOUNT_ID}] After reload - Current URL: ${reloadUrl}`);

                if (reloadUrl === 'about:blank') {
                    throw new Error('Browser stuck on about:blank after reload - session may be corrupted');
                }
            }

            userLog(`✅ [${ACCOUNT_ID}] Facebook page loaded successfully`);

        } catch (navError) {
            console.error(`❌ [${ACCOUNT_ID}] Facebook navigation failed: ${navError.message}`);
            throw new Error(`Failed to navigate to Facebook: ${navError.message}`);
        }

        await page.waitForTimeout(3000);

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
            global.productsData = productsData;

            // Send browser instance info to main process
            const pageCount = browser.pages ? browser.pages().length : 0;
            process.stdout.write(`BROWSER_CREATED:${ACCOUNT_ID}:${pageCount}\n`);

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

                    // Set flag to prevent duplicate processes
                    loginConfirmedManually = true;
                    await continueMarketplacePosting(page, browser, productsData);
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

async function continueAfterLogin(productsData) {
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

        await continueMarketplacePosting(global.loginPage, global.browserInstance, productsData);
    } finally {
        delete global.loginPage;
        delete global.browserInstance;
        delete global.productsData;
    }
}

async function continueMarketplacePosting(page, browser, productsData) {
    userLog(`\n🛒 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🚀 [${ACCOUNT_ID}] STARTING MARKETPLACE POSTING PROCESS`);
    userLog(`📋 [${ACCOUNT_ID}] MODE: SEQUENTIAL (One product at a time)`);
    debugLog(`⏳ [${ACCOUNT_ID}] Each product waits for previous to complete`);
    debugLog(`==========================================\n`);

    try {
        const products = productsData.products;
        const totalProducts = products.length;

        debugLog(`📦 [${ACCOUNT_ID}] Found ${totalProducts} products to post`);
        userLog(`📋 [${ACCOUNT_ID}] Processing products SEQUENTIALLY (one by one)`);
        userLog(`🔄 [${ACCOUNT_ID}] Product 1 → wait → Product 2 → wait → Product 3 → ...`);
        debugLog('');

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < totalProducts; i++) {
            // Check if cancelled
            if (isCancelled) {
                userLog(`⏹️ [${ACCOUNT_ID}] Posting cancelled by user at product ${i + 1}/${totalProducts}`);
                break;
            }

            const product = products[i];
            const productNumber = i + 1;

            // Track current product for cancellation status
            global.currentProduct = product;

            debugLog(`\n📌 [${ACCOUNT_ID}] ================= PRODUCT ${productNumber}/${totalProducts} =================`);
            userLog(`📝 [${ACCOUNT_ID}] ${product.name}`);
            debugLog(`💰 [${ACCOUNT_ID}] ${product.price.toLocaleString()}`);

            // Update product status to posting
            userLog(`MARKETPLACE_STATUS_UPDATE:${product.id}:posting:Starting product post ${product.name}...`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:MARKETPLACE_STATUS_UPDATE:${product.id}:posting:Starting product post ${product.name}...\n`);

            userLog(`MARKETPLACE_POSTING:${productNumber}/${totalProducts}:${product.name}`);

            let productSuccess = false;

            try {
                userLog(`🔄 [${ACCOUNT_ID}] STARTING PRODUCT ${productNumber}/${totalProducts} PROCESSING`);
                debugLog(`   [${ACCOUNT_ID}] Previous products: ${productNumber - 1} completed`);
                debugLog(`   [${ACCOUNT_ID}] Listing Type: ${product.listingType || 'item'}`);
                debugLog('');

                // ===== STEP 1: Navigate to marketplace create page =====
                // Determine URL based on listing type
                const listingType = product.listingType || 'item';
                const marketplaceUrls = {
                    'item': 'https://www.facebook.com/marketplace/create/item',
                    'vehicle': 'https://www.facebook.com/marketplace/create/vehicle',
                    'property': 'https://www.facebook.com/marketplace/create/rental'
                };
                const targetUrl = marketplaceUrls[listingType] || marketplaceUrls['item'];

                debugLog(`🌐 [${ACCOUNT_ID}] STEP 1: Navigating to marketplace create page...`);
                debugLog(`🌐 [${ACCOUNT_ID}] Listing Type: ${listingType}`);
                debugLog(`🌐 [${ACCOUNT_ID}] Target URL: ${targetUrl}`);

                try {
                    await page.goto(targetUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: 60000
                    });

                    // Wait for page to fully load
                    await page.waitForTimeout(8000);

                    // Verify we're on the right page
                    const url = await page.url();
                    debugLog(`🌐 [${ACCOUNT_ID}] Marketplace create page navigation completed. Current URL: ${url}`);

                    if (!url.includes('marketplace/create')) {
                        console.error(`❌ [${ACCOUNT_ID}] CRITICAL: Not on marketplace create page. Current URL: ${url}`);

                        if (url === 'about:blank') {
                            console.error(`❌ [${ACCOUNT_ID}] Browser is stuck on about:blank - this indicates a browser initialization problem`);
                            debugLog(`🔍 [${ACCOUNT_ID}] Browser page info:`, {
                                url: url,
                                title: await page.title().catch(() => 'unknown'),
                                isClosed: page.isClosed()
                            });

                            // Try alternative navigation method
                            userLog(`🔄 [${ACCOUNT_ID}] Trying alternative navigation method...`);
                            await page.evaluate(() => {
                                window.location.href = 'https://www.facebook.com/marketplace/create/item';
                            });
                            await page.waitForTimeout(5000);

                            const altUrl = await page.url();
                            userLog(`🔄 [${ACCOUNT_ID}] Alternative navigation result - Current URL: ${altUrl}`);

                            if (!altUrl.includes('marketplace/create') && altUrl !== 'about:blank') {
                                userLog(`✅ [${ACCOUNT_ID}] Alternative navigation successful`);
                            } else if (altUrl === 'about:blank') {
                                throw new Error('Browser stuck on about:blank - session may be corrupted');
                            } else {
                                throw new Error(`Still not on marketplace create page after alternative navigation. Current URL: ${altUrl}`);
                            }
                        } else {
                            throw new Error(`CRITICAL: Not on marketplace create page. Current URL: ${url}`);
                        }
                    }

                    userLog(`✅ [${ACCOUNT_ID}] On correct marketplace create page`);

                } catch (navError) {
                    console.error(`❌ [${ACCOUNT_ID}] Marketplace create page navigation failed: ${navError.message}`);

                    // Try to get more diagnostic information
                    try {
                        const currentUrl = await page.url();
                        const pageTitle = await page.title();
                        debugLog(`🔍 [${ACCOUNT_ID}] Diagnostic info:`, {
                            currentUrl: currentUrl,
                            pageTitle: pageTitle,
                            isClosed: page.isClosed(),
                            browserType: 'persistent-context'
                        });
                    } catch (diagError) {
                        console.error(`❌ [${ACCOUNT_ID}] Could not get diagnostic info: ${diagError.message}`);
                    }

                    throw navError;
                }

                // ===== STEP 2: Check marketplace access =====
                debugLog(`🔍 [${ACCOUNT_ID}] STEP 2: Checking marketplace access...`);
                const canAccess = await canAccessMarketplace(page);
                if (!canAccess) {
                    throw new Error('CRITICAL: Cannot access marketplace - page not loaded properly or marketplace unavailable');
                }
                userLog(`✅ [${ACCOUNT_ID}] Marketplace access confirmed`);

                // ===== STEP 3: Upload images =====
                debugLog(`🖼️ [${ACCOUNT_ID}] STEP 3: Uploading ${product.images.length} images...`);
                const imagesUploaded = await uploadProductImages(page, product.images);

                if (!imagesUploaded) {
                    debugLog(`⚠️ [${ACCOUNT_ID}] Primary upload failed, trying alternative method...`);
                    const altUpload = await uploadImagesAlternative(page, product.images);
                    if (!altUpload) {
                        throw new Error('CRITICAL: Failed to upload images using both primary and alternative methods');
                    }
                }

                // Verify images are uploaded by checking previews
                const imagePreviews = await page.locator('img[src*="blob:"], img[src*="data:"], div[data-testid*="media-attachment"]').all();
                if (imagePreviews.length === 0) {
                    debugLog(`⚠️ [${ACCOUNT_ID}] WARNING: No image previews found, but continuing...`);
                } else {
                    debugLog(`✅ [${ACCOUNT_ID}] VERIFIED: Found ${imagePreviews.length} image preview(s)`);
                }

                // ===== STEP 4: Fill product details =====
                userLog(`📝 [${ACCOUNT_ID}] STEP 4: Filling product details...`);
                const detailsFilled = await fillProductDetails(page, product);

                if (!detailsFilled) {
                    throw new Error('CRITICAL: Failed to fill all required product details');
                }
                userLog(`✅ [${ACCOUNT_ID}] VERIFIED: All product details filled successfully`);

                // ===== STEP 5: Click Next button =====
                debugLog(`➡️ [${ACCOUNT_ID}] STEP 5: Clicking Next button...`);

                const nextClicked = await clickNextButton(page, product.location);

                if (!nextClicked) {
                    throw new Error('CRITICAL: Next button not found, not clickable, or form is incomplete');
                }
                userLog(`✅ [${ACCOUNT_ID}] VERIFIED: Next button clicked successfully, moved to next step`);

                // Wait for next page to load completely
                await page.waitForTimeout(5000);

                // ===== STEP 6: Click Publish button =====
                userLog(`📤 [${ACCOUNT_ID}] STEP 6: Clicking Publish button...`);
                const published = await clickPublishButton(page);

                if (!published) {
                    throw new Error('CRITICAL: Failed to publish product - publish button not found or publishing failed');
                }

                // SUCCESS: Publish button clicked successfully, product is considered successfully posted
                userLog(`🎉 [${ACCOUNT_ID}] SUCCESS: Product posted successfully ${productNumber}/${totalProducts}!`);
                debugLog(`   [${ACCOUNT_ID}] Product: ${product.name}`);
                userLog(`   [${ACCOUNT_ID}] Status: ✅ PUBLISH BUTTON CLICKED SUCCESSFULLY`);

                // Update product status in UI - langsung success tanpa verifikasi marketplace
                userLog(`MARKETPLACE_STATUS_UPDATE:${product.id}:success:Product post ${product.name} successful`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:MARKETPLACE_STATUS_UPDATE:${product.id}:success:Product post ${product.name} successful\n`);

                debugLog(`MARKETPLACE_SUCCESS:${productNumber}/${totalProducts}:${product.name}`);
                successCount++;
                productSuccess = true;

                userLog(`✅ [${ACCOUNT_ID}] PRODUCT ${productNumber} FULLY PROCESSED AND POSTED\n`);

            } catch (error) {
                console.error(`❌ [${ACCOUNT_ID}] CRITICAL FAILURE - PRODUCT ${productNumber} NOT POSTED`);
                console.error(`   [${ACCOUNT_ID}] Product: ${product.name}`);
                console.error(`   [${ACCOUNT_ID}] Error: ${error.message}`);

                // Update product status to error
                userLog(`MARKETPLACE_STATUS_UPDATE:${product.id}:error:Product post ${product.name} failed: ${error.message}`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:MARKETPLACE_STATUS_UPDATE:${product.id}:error:Product post ${product.name} failed: ${error.message}\n`);

                userLog(`MARKETPLACE_ERROR:${productNumber}/${totalProducts}:${error.message}`);
                failCount++;
                productSuccess = false;

                debugLog(`⏭️ [${ACCOUNT_ID}] CONTINUING TO NEXT PRODUCT...\n`);
            }

            // ===== WAIT BEFORE NEXT PRODUCT =====
            if (i < totalProducts - 1) { // Not the last product
                // Use delay range from postData or default values
                const delayMin = productsData.delayMin || 15;
                const delayMax = productsData.delayMax || 60;

                // Random delay antara delayMin sampai delayMax detik
                const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
                const waitTime = randomDelay * 1000; // Convert to milliseconds

                debugLog(`⏳ [${ACCOUNT_ID}] WAITING ${Math.round(randomDelay)} SECONDS BEFORE NEXT PRODUCT...`);
                debugLog(`   [${ACCOUNT_ID}] (Delay range: ${delayMin}-${delayMax}s, previous product ${productSuccess ? 'succeeded' : 'failed'})`);
                await page.waitForTimeout(waitTime);

                // Additional check: make sure page is ready for next product
                try {
                    await page.waitForLoadState('networkidle', { timeout: 5000 });
                } catch (e) {
                    debugLog('⚠️ [${ACCOUNT_ID}] Page still loading, continuing anyway...');
                }
            } else {
                userLog(`🎯 [${ACCOUNT_ID}] LAST PRODUCT PROCESSED`);
            }

            // Rest Time: Setiap N post, rest untuk X detik
            const restCount = productsData.restCount || 5;  // default: setiap 5 post
            const restDelay = productsData.restDelay || 300;  // default: rest 300 detik (5 menit)

            // Cek apakah sudah mencapai restCount (hanya hitung successful posts)
            if ((successCount % restCount === 0) && (successCount > 0) && (i < totalProducts - 1)) {
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

            // Clear current product tracking after processing
            global.currentProduct = null;
        }

        // ===== FINAL SUMMARY =====
        userLog(`\n🎯 [${ACCOUNT_ID}] ==========================================`);
        userLog(`📊 [${ACCOUNT_ID}] MARKETPLACE POSTING SUMMARY`);
        debugLog('══════════════════════════════════════════');
        debugLog(`📦 [${ACCOUNT_ID}] Total products processed: ${totalProducts}`);
        userLog(`✅ [${ACCOUNT_ID}] Successful posts: ${successCount}`);
        debugLog(`❌ [${ACCOUNT_ID}] Failed posts: ${failCount}`);
        userLog(`📊 [${ACCOUNT_ID}] Success rate: ${Math.round((successCount / totalProducts) * 100)}%`);
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] Posting was cancelled by user`);
        }
        debugLog('══════════════════════════════════════════');
        if (isCancelled) {
            userLog(`⏹️ [${ACCOUNT_ID}] MARKETPLACE_PROCESS_CANCELLED`);
        } else {
            userLog(`✅ [${ACCOUNT_ID}] ALL PRODUCTS PROCESSED SEQUENTIALLY`);
            userLog(`🎉 [${ACCOUNT_ID}] MARKETPLACE_PROCESS_COMPLETED`);
        }
        debugLog('==========================================\n');

        isProcessRunning = false;

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Marketplace posting error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    }
}

async function canAccessMarketplace(page) {
    try {
        // Check if we're on marketplace create page
        const url = await page.url();
        if (!url.includes('marketplace/create')) {
            return false;
        }

        // Check for photo upload section
        const photoSection = await page.locator('span:has-text("Photos")').first();
        if (await photoSection.count() > 0) {
            return true;
        }

        // Check for file input
        const fileInput = await page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
            return true;
        }

        return false;

    } catch {
        return false;
    }
}

async function uploadProductImages(page, images) {
    userLog(`📤 Uploading ${images.length} images...`);

    try {
        // Wait for page to fully load
        await page.waitForTimeout(3000);

        // Find file input
        const fileInputs = await page.locator('input[type="file"]').all();

        if (fileInputs.length === 0) {
            debugLog('❌ No file input found');
            return false;
        }

        // Use the first file input (for images)
        const imageFileInput = fileInputs[0];
        debugLog('✅ Found file input element');

        // Upload all images at once (Facebook allows multiple)
        await imageFileInput.setInputFiles(images);
        userLog(`✅ ${images.length} images set to input`);

        // Wait for upload to start
        await page.waitForTimeout(2000);

        // Wait for upload to complete - check for upload progress indicators
        debugLog('⏳ Waiting for upload to complete...');

        // Monitor upload progress
        let uploadComplete = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max wait

        while (!uploadComplete && attempts < maxAttempts) {
            attempts++;

            try {
                // Check for upload completion indicators
                const uploadIndicators = [
                    'div[data-testid*="media-attachment"]',
                    'img[src*="blob:"]',
                    'img[src*="data:"]',
                    'div[aria-label*="Remove photo"]',
                    'button[aria-label*="Remove"]'
                ];

                let foundIndicators = 0;
                for (const selector of uploadIndicators) {
                    const elements = await page.locator(selector).all();
                    if (elements.length > 0) {
                        foundIndicators += elements.length;
                    }
                }

                if (foundIndicators >= Math.min(images.length, 3)) { // At least 3 previews or all images
                    uploadComplete = true;
                    debugLog(`✅ Upload complete! Found ${foundIndicators} image indicators`);
                    break;
                }

                // Check if there's still an upload spinner or progress
                const uploadSpinners = await page.locator('div[role="progressbar"], [data-testid*="loading"]').all();
                if (uploadSpinners.length > 0) {
                    debugLog(`⏳ Upload still in progress... (${attempts}/${maxAttempts})`);
                }

            } catch (e) {
                // Continue checking
            }

            await page.waitForTimeout(1000);
        }

        if (!uploadComplete) {
            debugLog('⚠️ Upload timeout, but continuing...');
        }

        // Final verification
        const finalPreviews = await page.locator('img[src*="blob:"], img[src*="data:"], div[data-testid*="media-attachment"]').all();
        debugLog(`📊 Final check: ${finalPreviews.length} image elements found`);

        return true;

    } catch (error) {
        console.error(`❌ Error uploading images: ${error.message}`);
        return false;
    }
}

async function uploadImagesAlternative(page, images) {
    debugLog('🔄 Trying alternative image upload...');

    try {
        // Try to find upload button
        const uploadButtons = await page.locator('div[role="button"][aria-label*="photo"], div[role="button"][aria-label*="image"]').all();

        for (const button of uploadButtons) {
            try {
                await button.click();
                await page.waitForTimeout(2000);

                // Now look for file input
                const fileInputs = await page.locator('input[type="file"]').all();
                if (fileInputs.length > 0) {
                    await fileInputs[0].setInputFiles(images);
                    userLog(`✅ Uploaded via alternative method`);
                    await page.waitForTimeout(5000);
                    return true;
                }
            } catch {
                continue;
            }
        }

        return false;

    } catch (error) {
        console.error(`❌ Alternative upload failed: ${error.message}`);
        return false;
    }
}

async function fillProductDetails(page, product) {
    const listingType = product.listingType || 'item';
    userLog(`📝 Filling ${listingType.toUpperCase()} listing details SEQUENTIALLY...`);

    try {
        // Wait for form to be ready
        await page.waitForTimeout(3000);

        // Call appropriate fill function based on listing type
        if (listingType === 'item') {
            return await fillItemDetails(page, product);
        } else if (listingType === 'vehicle') {
            return await fillVehicleDetails(page, product);
        } else if (listingType === 'property') {
            return await fillPropertyDetails(page, product);
        } else {
            debugLog(`⚠️ Unknown listing type: ${listingType}, defaulting to item`);
            return await fillItemDetails(page, product);
        }

    } catch (error) {
        console.error(`❌ Error filling product details: ${error.message}`);
        return false;
    }
}

// ===== ITEM LISTING FORM FILL =====
async function fillItemDetails(page, product) {
    try {
        // ===== 1. Fill Title =====
        debugLog('  1️⃣ STEP 1: Filling title...');
        const titleFilled = await fillTitle(page, product.name);
        if (!titleFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill title');
            return false;
        }
        debugLog('  ✅ Title filled successfully');
        await page.waitForTimeout(2000);

        // ===== 2. Fill Price =====
        debugLog('  2️⃣ STEP 2: Filling price...');
        const priceFilled = await fillPrice(page, product.price);
        if (!priceFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill price');
            return false;
        }
        debugLog('  ✅ Price filled successfully');
        await page.waitForTimeout(2000);

        // ===== 3. Select Category =====
        debugLog('  3️⃣ STEP 3: Selecting category...');
        const categorySelected = await selectCategory(page, product.category);
        if (!categorySelected) {
            debugLog('  ❌ CRITICAL: Failed to select category');
            return false;
        }
        debugLog('  ✅ Category selected successfully');
        await page.waitForTimeout(1500);

        // ===== 4. Select Condition =====
        debugLog('  4️⃣ STEP 4: Selecting condition...');
        const conditionSelected = await selectCondition(page, product.condition);
        if (!conditionSelected) {
            debugLog('  ❌ CRITICAL: Failed to select condition');
            return false;
        }
        debugLog('  ✅ Condition selected successfully');
        await page.waitForTimeout(1500);

        // ===== 5. Fill Description =====
        debugLog('  5️⃣ STEP 5: Filling description...');
        const descriptionFilled = await fillDescription(page, product.description);
        if (!descriptionFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill description');
            return false;
        }
        debugLog('  ✅ Description filled successfully');
        await page.waitForTimeout(1000);

        // ===== 6. Fill Location =====
        debugLog('  6️⃣ STEP 6: Filling location...');
        const locationFilled = await fillLocation(page, product.location);
        if (!locationFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill location');
            return false;
        }
        debugLog('  ✅ Location filled successfully');
        await page.waitForTimeout(2000);

        debugLog('✅ ALL ITEM DETAILS FILLED SUCCESSFULLY');
        return true;

    } catch (error) {
        console.error(`❌ Error filling item details: ${error.message}`);
        return false;
    }
}

// ===== VEHICLE LISTING FORM FILL =====
async function fillVehicleDetails(page, product) {
    debugLog('🚗 Filling VEHICLE listing form...');
    try {
        // Vehicle form flow (based on user's specification):
        // 1. Navigate to vehicle page (handled before this function)
        // 2. Select Vehicle Type (dropdown) - default "Other" if not specified
        // 3. Upload images (handled before this function)
        // 4. Fill Location (like item form)
        // 5. Select Year (dropdown)
        // 6. Fill Make (INPUT field, not dropdown - type like human)
        // 7. Fill Model (input field - type like human)
        // 8. Fill Price (input field - type like human)
        // 9. Fill Description (textarea - type like human)
        // 10. Click Next (handled after this function)
        // 11. Click Publish (handled after this function)
        // 12. Success status (handled after this function)

        // Wait for form to be interactive
        await page.waitForTimeout(3000);

        // ===== STEP 1: Select Vehicle Type (dropdown) =====
        debugLog('  1️⃣ STEP 1: Selecting vehicle type...');
        // Default to "Other" if not specified, or use user's value
        const vehicleTypeValue = product.vehicleType || 'Other';
        debugLog(`     Target vehicle type: ${vehicleTypeValue}`);

        const vehicleTypeSelected = await selectVehicleTypeDropdown(page, vehicleTypeValue);
        if (!vehicleTypeSelected) {
            debugLog('  ⚠️ Vehicle type selection failed, trying "Other"...');
            await selectVehicleTypeDropdown(page, 'Other');
        } else {
            debugLog('  ✅ Vehicle type selected');
        }
        await page.waitForTimeout(1500);

        // ===== STEP 2: Fill Location =====
        debugLog('  2️⃣ STEP 2: Filling location...');
        debugLog(`     Value: ${product.location}`);

        const locationFilled = await fillLocation(page, product.location);
        if (!locationFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill location');
            return false;
        }
        debugLog('  ✅ Location filled successfully');
        await page.waitForTimeout(2000);

        // ===== STEP 3: Select Year (dropdown) =====
        debugLog('  3️⃣ STEP 3: Selecting year...');
        debugLog(`     Value: ${product.year}`);

        const yearSelected = await selectVehicleYearDropdown(page, product.year);
        if (!yearSelected) {
            debugLog('  ❌ CRITICAL: Failed to select year');
            return false;
        }
        debugLog('  ✅ Year selected successfully');
        await page.waitForTimeout(1500);

        // ===== STEP 4: Fill Make (INPUT field, not dropdown) =====
        debugLog('  4️⃣ STEP 4: Filling make (input field)...');
        debugLog(`     Value: ${product.make}`);

        const makeFilled = await fillVehicleMakeInput(page, product.make);
        if (!makeFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill make');
            return false;
        }
        debugLog('  ✅ Make filled successfully');
        await page.waitForTimeout(1500);

        // ===== STEP 5: Fill Model (input field) =====
        debugLog('  5️⃣ STEP 5: Filling model...');
        debugLog(`     Value: ${product.model}`);

        const modelFilled = await fillVehicleModelInput(page, product.model);
        if (!modelFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill model');
            return false;
        }
        debugLog('  ✅ Model filled successfully');
        // Press Tab to move focus away from Model field
        await page.keyboard.press('Tab');
        await page.waitForTimeout(1500);

        // ===== STEP 6: Fill Price =====
        debugLog('  6️⃣ STEP 6: Filling price...');
        debugLog(`     Value: ${product.price}`);

        const priceFilled = await fillVehiclePriceInput(page, product.price);
        if (!priceFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill price');
            return false;
        }
        debugLog('  ✅ Price filled successfully');
        await page.waitForTimeout(1500);

        // ===== STEP 7: Fill Description =====
        debugLog('  7️⃣ STEP 7: Filling description...');
        debugLog(`     Value length: ${product.description?.length || 0} chars`);

        const descriptionFilled = await fillVehicleDescriptionTextarea(page, product.description);
        if (!descriptionFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill description');
            return false;
        }
        debugLog('  ✅ Description filled successfully');
        await page.waitForTimeout(1000);

        debugLog('✅ ALL VEHICLE DETAILS FILLED SUCCESSFULLY');
        debugLog('   (Next and Publish buttons will be clicked by main flow)');
        return true;

    } catch (error) {
        console.error(`❌ Error filling vehicle details: ${error.message}`);
        return false;
    }
}

// ===== VEHICLE HELPER FUNCTIONS =====

/**
 * Select Vehicle Type from dropdown
 * Step: Find "Vehicle type" span → Click parent [role="combobox"] → Select option
 */
async function selectVehicleTypeDropdown(page, vehicleType) {
    debugLog(`     🚗 Selecting vehicle type: ${vehicleType}`);

    try {
        // Step 1: Click the Vehicle Type dropdown
        const dropdownClicked = await page.evaluate(() => {
            const allSpans = document.querySelectorAll('span');
            let vehicleTypeSpan = null;

            for (const span of allSpans) {
                if (span.textContent.trim() === 'Vehicle type') {
                    vehicleTypeSpan = span;
                    break;
                }
            }

            if (vehicleTypeSpan) {
                const combobox = vehicleTypeSpan.closest('[role="combobox"]');
                if (combobox) {
                    combobox.click();
                    // [browser] debugLog('     ✅ Dropdown Vehicle type clicked');
                    return true;
                }
            }

            // [browser] debugLog('     ❌ Vehicle type dropdown not found');
            return false;
        });

        if (!dropdownClicked) return false;

        await page.waitForTimeout(1000);

        // Step 2: Select the option
        const optionClicked = await page.evaluate((targetType) => {
            const allSpans = document.querySelectorAll('span');
            let targetSpan = null;

            for (const span of allSpans) {
                if (span.textContent.trim() === targetType) {
                    targetSpan = span;
                    break;
                }
            }

            if (targetSpan) {
                const option = targetSpan.closest('[role="option"]');
                if (option) {
                    option.click();
                    console.log(`     ✅ ${targetType} selected`);
                    return true;
                }
            }

            // [browser] debugLog(`     ❌ Option "${targetType}" not found`);
            return false;
        }, vehicleType);

        if (optionClicked) {
            await page.waitForTimeout(500);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`     ❌ Error in selectVehicleTypeDropdown: ${error.message}`);
        return false;
    }
}

/**
 * Select Year from dropdown
 * Step: Find "Year" span → Click parent [role="combobox"] → Select option
 */
async function selectVehicleYearDropdown(page, year) {
    debugLog(`     📅 Selecting year: ${year}`);

    try {
        // Step 1: Click the Year dropdown
        const dropdownClicked = await page.evaluate(() => {
            const allSpans = document.querySelectorAll('span');
            let yearSpan = null;

            for (const span of allSpans) {
                if (span.textContent.trim() === 'Year') {
                    yearSpan = span;
                    break;
                }
            }

            if (yearSpan) {
                const combobox = yearSpan.closest('[role="combobox"]');
                if (combobox) {
                    combobox.click();
                    // [browser] debugLog('     ✅ Dropdown Year clicked');
                    return true;
                }
            }

            // [browser] debugLog('     ❌ Year dropdown not found');
            return false;
        });

        if (!dropdownClicked) return false;

        await page.waitForTimeout(1000);

        // Step 2: Select the year option
        const yearStr = year.toString();
        const optionClicked = await page.evaluate((targetYear) => {
            const allSpans = document.querySelectorAll('span');
            let targetSpan = null;

            for (const span of allSpans) {
                if (span.textContent.trim() === targetYear) {
                    targetSpan = span;
                    break;
                }
            }

            if (targetSpan) {
                const option = targetSpan.closest('[role="option"]');
                if (option) {
                    option.click();
                    console.log(`     ✅ Year ${targetYear} selected`);
                    return true;
                }
            }

            // [browser] debugLog(`     ❌ Year "${targetYear}" not found`);
            return false;
        }, yearStr);

        if (optionClicked) {
            await page.waitForTimeout(500);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`     ❌ Error in selectVehicleYearDropdown: ${error.message}`);
        return false;
    }
}

/**
 * Fill Make as INPUT field (not dropdown)
 * Step: Find "Make" span → Click parent [role="combobox"] → Type like human
 */
async function fillVehicleMakeInput(page, make) {
    debugLog(`     🏭 Filling make: ${make}`);

    try {
        // Step 1: Click the Make field
        const fieldClicked = await page.evaluate(() => {
            const allSpans = document.querySelectorAll('span');
            let makeSpan = null;

            for (const span of allSpans) {
                if (span.textContent.trim() === 'Make') {
                    makeSpan = span;
                    break;
                }
            }

            if (makeSpan) {
                const combobox = makeSpan.closest('[role="combobox"]');
                if (combobox) {
                    combobox.click();
                    // [browser] debugLog('     ✅ Make field clicked');
                    return true;
                }

                // Fallback: try to find input in parent
                let element = makeSpan.parentElement;
                while (element) {
                    const input = element.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        // [browser] debugLog('     ✅ Make input field clicked');
                        return true;
                    }
                    element = element.parentElement;
                }
            }

            // [browser] debugLog('     ❌ Make field not found');
            return false;
        });

        if (!fieldClicked) return false;

        await page.waitForTimeout(500);

        // Step 2: Type the make value like human
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        // Type with human-like delays
        for (const char of make) {
            await page.keyboard.type(char);
            const delay = 50 + Math.random() * 100;
            await page.waitForTimeout(delay);
        }

        userLog(`     ✅ Make "${make}" typed successfully`);
        return true;

    } catch (error) {
        console.error(`     ❌ Error in fillVehicleMakeInput: ${error.message}`);
        return false;
    }
}

/**
 * Fill Model as INPUT field (Vehicle)
 * Using same approach as fillPrice for Item - find label with 'Model' text, then use Playwright locator
 */
async function fillVehicleModelInput(page, model) {
    debugLog(`     🚙 Filling model: ${model}`);

    try {
        // Method 1: Use same approach as Item's fillPrice - find label with 'Model' text
        debugLog('     🎯 Trying label selector for Model field...');

        const modelInputInfo = await page.evaluate(() => {
            // Find all labels and look for one containing "Model"
            const labels = [...document.querySelectorAll('label')];

            for (const label of labels) {
                const labelText = label.textContent.trim();
                if (labelText === 'Model' || labelText.includes('Model')) {
                    const input = label.querySelector('input');
                    if (input) {
                        // Return info to create locator
                        return {
                            found: true,
                            id: input.id,
                            className: input.className,
                            ariaLabel: input.getAttribute('aria-label'),
                            labelId: label.id || null
                        };
                    }
                }
            }
            return { found: false };
        });

        if (modelInputInfo.found) {
            debugLog('     ✅ Found Model input via label selector');

            // Create Playwright locator based on the found info
            let modelLocator;
            if (modelInputInfo.id) {
                modelLocator = page.locator(`input[id="${modelInputInfo.id}"]`);
            } else if (modelInputInfo.ariaLabel) {
                modelLocator = page.locator(`input[aria-label="${modelInputInfo.ariaLabel}"]`);
            } else {
                // Use label contains Model approach
                modelLocator = page.locator('label:has-text("Model") input').first();
            }

            // Click to focus
            await modelLocator.click({ delay: 200 });
            await page.waitForTimeout(300);

            // Clear existing value
            await modelLocator.fill('');
            await page.waitForTimeout(200);

            // Type model with human-like delays
            for (const char of model) {
                await page.keyboard.type(char);
                const delay = 50 + Math.random() * 100;
                await page.waitForTimeout(delay);
            }

            userLog(`     ✅ Model "${model}" typed successfully via label`);
            return true;
        }

        // Method 2: Fallback - use XPath with span
        debugLog('     🔄 Trying XPath fallback for Model...');

        const fieldClicked = await page.evaluate(() => {
            const xpath = "//span[text()='Model']";
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            let modelSpan = result.singleNodeValue;

            if (!modelSpan) {
                const xpathContains = "//span[contains(text(), 'Model')]";
                const resultContains = document.evaluate(xpathContains, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                modelSpan = resultContains.singleNodeValue;
            }

            if (modelSpan) {
                const label = modelSpan.closest('label');
                if (label) {
                    const input = label.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        return true;
                    }
                }

                // Traverse up
                let parent = modelSpan.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                    const input = parent.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        return true;
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            }
            return false;
        });

        if (fieldClicked) {
            await page.waitForTimeout(500);
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(100);
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(100);

            for (const char of model) {
                await page.keyboard.type(char);
                const delay = 50 + Math.random() * 100;
                await page.waitForTimeout(delay);
            }

            debugLog(`     ✅ Model "${model}" typed successfully via XPath`);
            return true;
        }

        debugLog('     ❌ All Model selectors failed');
        return false;

    } catch (error) {
        console.error(`     ❌ Error in fillVehicleModelInput: ${error.message}`);
        return false;
    }
}

/**
 * Fill Price as INPUT field (Vehicle)
 * Using same approach as fillPrice for Item - find label with 'Price' text, then use Playwright locator
 */
async function fillVehiclePriceInput(page, price) {
    debugLog(`     💰 Filling price: ${price}`);

    try {
        // Format price as string
        const priceStr = price.toString();

        // First blur any currently focused element
        await page.evaluate(() => {
            if (document.activeElement) {
                document.activeElement.blur();
            }
        });
        await page.waitForTimeout(500);

        // Method 1: Use same approach as Item's fillPrice - find label with 'Price' text
        debugLog('     🎯 Trying label selector for Price field...');

        const priceInputInfo = await page.evaluate(() => {
            // Find all labels and look for one containing "Price"
            const labels = [...document.querySelectorAll('label')];

            for (const label of labels) {
                const labelText = label.textContent.trim();
                if (labelText === 'Price' || labelText.includes('Price')) {
                    const input = label.querySelector('input');
                    if (input) {
                        // Return info to create locator
                        return {
                            found: true,
                            id: input.id,
                            className: input.className,
                            ariaLabel: input.getAttribute('aria-label'),
                            labelId: label.id || null
                        };
                    }
                }
            }
            return { found: false };
        });

        if (priceInputInfo.found) {
            debugLog('     ✅ Found Price input via label selector');

            // Create Playwright locator based on the found info
            let priceLocator;
            if (priceInputInfo.id) {
                priceLocator = page.locator(`input[id="${priceInputInfo.id}"]`);
            } else if (priceInputInfo.ariaLabel) {
                priceLocator = page.locator(`input[aria-label="${priceInputInfo.ariaLabel}"]`);
            } else {
                // Use label contains Price approach
                priceLocator = page.locator('label:has-text("Price") input').first();
            }

            // Click to focus
            await priceLocator.click({ delay: 200 });
            await page.waitForTimeout(300);

            // Clear existing value
            await priceLocator.fill('');
            await page.waitForTimeout(200);

            // Type price with human-like delays
            for (const char of priceStr) {
                await page.keyboard.type(char);
                const delay = 50 + Math.random() * 100;
                await page.waitForTimeout(delay);
            }

            userLog(`     ✅ Price "${price}" typed successfully via label`);
            return true;
        }

        // Method 2: Fallback - use XPath with span
        debugLog('     🔄 Trying XPath fallback for Price...');

        const fieldClicked = await page.evaluate(() => {
            const xpath = "//span[text()='Price']";
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            let priceSpan = result.singleNodeValue;

            if (!priceSpan) {
                const xpathContains = "//span[contains(text(), 'Price')]";
                const resultContains = document.evaluate(xpathContains, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                priceSpan = resultContains.singleNodeValue;
            }

            if (priceSpan) {
                const label = priceSpan.closest('label');
                if (label) {
                    const input = label.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        return true;
                    }
                }

                // Traverse up
                let parent = priceSpan.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                    const input = parent.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        return true;
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            }
            return false;
        });

        if (fieldClicked) {
            await page.waitForTimeout(500);
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(100);
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(100);

            for (const char of priceStr) {
                await page.keyboard.type(char);
                const delay = 50 + Math.random() * 100;
                await page.waitForTimeout(delay);
            }

            debugLog(`     ✅ Price "${price}" typed successfully via XPath`);
            return true;
        }

        debugLog('     ❌ All Price selectors failed');
        return false;

    } catch (error) {
        console.error(`     ❌ Error in fillVehiclePriceInput: ${error.message}`);
        return false;
    }
}

/**
 * Fill Description as TEXTAREA
 * Step: Find "Description" span using XPath → Find textarea in parent → Click → Type like human
 */
async function fillVehicleDescriptionTextarea(page, description) {
    userLog(`     📝 Filling description...`);

    try {
        // Step 1: Click the Description textarea
        const fieldClicked = await page.evaluate(() => {
            // Use XPath to find Description span
            const descriptionXPath = "//span[contains(text(), 'Description')]";
            const result = document.evaluate(
                descriptionXPath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );

            const descriptionSpan = result.singleNodeValue;

            if (descriptionSpan) {
                // Find textarea in parent structure
                let parent = descriptionSpan.parentElement;
                let textarea = null;

                while (parent && !textarea) {
                    textarea = parent.querySelector('textarea');
                    if (!textarea) {
                        parent = parent.parentElement;
                    }
                }

                if (textarea) {
                    textarea.click();
                    textarea.focus();
                    // [browser] debugLog('     ✅ Description textarea clicked');
                    return true;
                }
            }

            // Fallback: try to find any textarea
            const textareas = document.querySelectorAll('textarea');
            if (textareas.length > 0) {
                const lastTextarea = textareas[textareas.length - 1];
                lastTextarea.click();
                lastTextarea.focus();
                // [browser] debugLog('     ✅ Description textarea clicked (fallback)');
                return true;
            }

            // [browser] debugLog('     ❌ Description textarea not found');
            return false;
        });

        if (!fieldClicked) return false;

        await page.waitForTimeout(500);

        // Step 2: Type the description like human
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        // Type with human-like delays (faster for description)
        for (const char of description) {
            await page.keyboard.type(char);
            const delay = 30 + Math.random() * 70; // 30-100ms
            await page.waitForTimeout(delay);
        }

        userLog(`     ✅ Description typed (${description.length} chars)`);
        return true;

    } catch (error) {
        console.error(`     ❌ Error in fillVehicleDescriptionTextarea: ${error.message}`);
        return false;
    }
}

// ===== PROPERTY LISTING FORM FILL =====
async function fillPropertyDetails(page, product) {
    debugLog('🏠 Filling PROPERTY listing form...');
    try {
        // Property form flow (based on user's 12-step specification):
        // 1. File upload (handled before this function)
        // 2. Select Sale/Rent Type (dropdown)
        // 3. Select Property Type (dropdown)
        // 4. Fill Number of bedrooms (input)
        // 5. Fill Number of bathrooms (input)
        // 6. Fill Price (input)
        // 7. Fill Square Meters (input)
        // 8. Fill Location (complex dropdown - reuse existing)
        // 9. Fill Property description (textarea)
        // 10. Click Next (handled after this function)
        // 11. Click Publish (handled after this function)
        // 12. Success status (handled after this function)

        // Wait for form to be interactive
        await page.waitForTimeout(3000);

        // ===== STEP 1: Select Sale/Rent Type (dropdown) =====
        debugLog('  1️⃣ STEP 1: Selecting sale/rent type...');
        // Determine the type text - handle multiple formats
        // product.saleType can be: 'sale', 'Sale', 'For Sale', 'rent', 'Rent', 'For Rent'
        const rawSaleType = (product.saleType || 'rent').toLowerCase();
        const isSale = rawSaleType.includes('sale');
        const saleTypeText = isSale ? 'Sale' : 'Rent';
        debugLog(`     Raw saleType: "${product.saleType}" → Detected: ${isSale ? 'SALE' : 'RENT'}`);
        debugLog(`     Target type: ${saleTypeText}`);

        const saleTypeSuccess = await selectPropertySaleType(page, saleTypeText);
        if (!saleTypeSuccess) {
            debugLog('  ⚠️ Sale/Rent type selection failed, trying alternatives...');
            // Try alternative text formats
            const altTexts = ['For Sale', 'For Rent', 'Property for sale', 'Property for rent'];
            const altTarget = isSale ? altTexts[0] : altTexts[1];
            await selectPropertySaleType(page, altTarget);
        } else {
            debugLog('  ✅ Sale/Rent type selected successfully');
        }
        await page.waitForTimeout(1500);

        // ===== STEP 2: Select Property Type (dropdown) =====
        debugLog('  2️⃣ STEP 2: Selecting property type...');
        debugLog(`     Target property type: ${product.propertyType}`);

        const propertyTypeSuccess = await selectPropertyType(page, product.propertyType);
        if (!propertyTypeSuccess) {
            debugLog('  ⚠️ Property type selection failed');
        } else {
            debugLog('  ✅ Property type selected successfully');
        }
        await page.waitForTimeout(1500);

        // ===== STEP 3: Fill Number of Bedrooms =====
        debugLog('  3️⃣ STEP 3: Filling number of bedrooms...');
        debugLog(`     Value: ${product.bedrooms}`);

        const bedroomsSuccess = await fillPropertyInputField(page, 'Number of bedrooms', product.bedrooms);
        if (!bedroomsSuccess) {
            debugLog('  ⚠️ Bedrooms fill failed');
        } else {
            debugLog('  ✅ Bedrooms filled successfully');
        }
        await page.waitForTimeout(1500);

        // ===== STEP 4: Fill Number of Bathrooms =====
        debugLog('  4️⃣ STEP 4: Filling number of bathrooms...');
        debugLog(`     Value: ${product.bathrooms}`);

        const bathroomsSuccess = await fillPropertyInputField(page, 'Number of bathrooms', product.bathrooms);
        if (!bathroomsSuccess) {
            debugLog('  ⚠️ Bathrooms fill failed');
        } else {
            debugLog('  ✅ Bathrooms filled successfully');
        }
        await page.waitForTimeout(1500);

        // ===== STEP 5: Fill Price =====
        debugLog('  5️⃣ STEP 5: Filling price...');
        debugLog(`     Value: ${product.price}`);

        const priceSuccess = await fillPropertyInputField(page, 'Price', product.price);
        if (!priceSuccess) {
            debugLog('  ❌ CRITICAL: Price fill failed');
            return false;
        }
        debugLog('  ✅ Price filled successfully');
        await page.waitForTimeout(1500);

        // ===== STEP 6: Fill Square Meters =====
        debugLog('  6️⃣ STEP 6: Filling square meters...');
        debugLog(`     Value: ${product.squareMeters}`);

        const sqmSuccess = await fillPropertyInputField(page, 'Square meters', product.squareMeters);
        if (!sqmSuccess) {
            debugLog('  ⚠️ Square meters fill failed');
        } else {
            debugLog('  ✅ Square meters filled successfully');
        }
        await page.waitForTimeout(1500);

        // ===== STEP 7: Fill Location =====
        debugLog('  7️⃣ STEP 7: Filling location...');
        debugLog(`     Value: ${product.location}`);

        // Reuse existing fillLocation function (complex dropdown handling)
        const locationFilled = await fillLocation(page, product.location);
        if (!locationFilled) {
            debugLog('  ❌ CRITICAL: Failed to fill location');
            return false;
        }
        debugLog('  ✅ Location filled successfully');
        await page.waitForTimeout(2000);

        // ===== STEP 8: Fill Property Description =====
        debugLog('  8️⃣ STEP 8: Filling property description...');
        debugLog(`     Value length: ${product.description?.length || 0} chars`);

        // Pass saleType to determine correct selector (Rental description vs Property description)
        const descSuccess = await fillPropertyDescriptionField(page, product.description, product.saleType);
        if (!descSuccess) {
            debugLog('  ❌ CRITICAL: Description fill failed');
            return false;
        }
        debugLog('  ✅ Property description filled successfully');
        await page.waitForTimeout(1000);

        debugLog('✅ ALL PROPERTY DETAILS FILLED SUCCESSFULLY');
        debugLog('   (Next and Publish buttons will be clicked by main flow)');
        return true;

    } catch (error) {
        console.error(`❌ Error filling property details: ${error.message}`);
        return false;
    }
}

// ===== PROPERTY HELPER FUNCTIONS (Based on User's Exact Selectors) =====

/**
 * Select Sale/Rent type from dropdown
 * Step: Find "Home for Sale or Rent" span → Click parent label[role="combobox"] → Select option
 */
async function selectPropertySaleType(page, saleType) {
    debugLog(`     🔽 Selecting sale/rent type: ${saleType}`);

    try {
        // Step 1: Click the "Home for Sale or Rent" combobox to open dropdown
        debugLog('     📍 Step 1: Clicking "Home for Sale or Rent" combobox...');

        const comboboxClicked = await page.evaluate(() => {
            // Method 1: Use XPath to find "Home for Sale or Rent" span
            const homeXPath = "//span[contains(text(), 'Home for Sale or Rent')]";
            const result = document.evaluate(
                homeXPath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );

            const homeSpan = result.singleNodeValue;

            if (homeSpan) {
                // Find parent label with role="combobox"
                const label = homeSpan.closest('label[role="combobox"]');
                if (label) {
                    label.click();
                    // [browser] debugLog('     ✅ Home for Sale or Rent combobox clicked');
                    return true;
                }
            }

            // Fallback Method 2: Try generic combobox selector
            const combobox = document.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
            if (combobox) {
                combobox.click();
                // [browser] debugLog('     ✅ Fallback combobox clicked');
                return true;
            }

            // Fallback Method 3: Try just [role="combobox"]
            const fallbackCombobox = document.querySelector('[role="combobox"]');
            if (fallbackCombobox) {
                fallbackCombobox.click();
                // [browser] debugLog('     ✅ Fallback2 combobox clicked');
                return true;
            }

            // [browser] debugLog('     ❌ Combobox not found');
            return false;
        });

        if (!comboboxClicked) {
            debugLog('     ❌ Failed to click combobox');
            return false;
        }

        // Wait for dropdown to appear
        await page.waitForTimeout(1000);

        // Step 2: Find and click the option with matching text (Rent or Sale)
        debugLog(`     📍 Step 2: Finding and clicking option "${saleType}"...`);

        const optionClicked = await page.evaluate((targetText) => {
            // Find span with exact text, then click parent [role="option"]
            const spans = Array.from(document.querySelectorAll('span'));
            const targetSpan = spans.find(span => span.textContent.trim() === targetText);

            if (targetSpan) {
                const optionElement = targetSpan.closest('[role="option"]');
                if (optionElement) {
                    optionElement.click();
                    console.log(`     ✅ Option "${targetText}" clicked`);
                    return true;
                } else {
                    // Fallback: click the span directly
                    targetSpan.click();
                    console.log(`     ✅ Span "${targetText}" clicked directly`);
                    return true;
                }
            }

            // [browser] debugLog(`     ❌ Option "${targetText}" not found`);
            return false;
        }, saleType);

        if (optionClicked) {
            userLog(`     ✅ Sale/Rent type "${saleType}" selected successfully`);
            await page.waitForTimeout(500);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`     ❌ Error in selectPropertySaleType: ${error.message}`);
        return false;
    }
}

/**
 * Select Property Type from dropdown
 * Step: Find "Property type" span using XPath → Click parent combobox → Find option → Click
 */
async function selectPropertyType(page, propertyType) {
    debugLog(`     🏠 Selecting property type: ${propertyType}`);

    try {
        // Step 1: Click the Property Type field to open dropdown
        debugLog('     📍 Step 1: Clicking Property Type field...');

        const fieldClicked = await page.evaluate(() => {
            // Method 1: Use XPath to find "Property type" span (case-insensitive contains)
            const xpathVariants = [
                "//span[contains(text(), 'Property type')]",
                "//span[contains(text(), 'property type')]",
                "//span[contains(text(), 'Tipe properti')]",
                "//span[contains(text(), 'Home type')]",
                "//span[contains(text(), 'Type of property')]"
            ];

            for (const xpath of xpathVariants) {
                const result = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );

                const labelSpan = result.singleNodeValue;

                if (labelSpan) {
                    // Try to find parent label with role="combobox" or just label
                    let parent = labelSpan.parentElement;
                    while (parent) {
                        if (parent.tagName === 'LABEL' || parent.getAttribute('role') === 'combobox') {
                            parent.click();
                            // [browser] debugLog('     ✅ Property type field clicked (XPath method)');
                            return true;
                        }
                        parent = parent.parentElement;
                    }

                    // Fallback: just click the closest label
                    const label = labelSpan.closest('label');
                    if (label) {
                        label.click();
                        // [browser] debugLog('     ✅ Property type field clicked (closest label)');
                        return true;
                    }
                }
            }

            // Fallback Method 2: Try exact match span
            const spans = Array.from(document.querySelectorAll('span'));
            const labelSpan = spans.find(span => span.textContent.trim() === 'Property type');

            if (labelSpan) {
                const label = labelSpan.closest('label');
                if (label) {
                    label.click();
                    // [browser] debugLog('     ✅ Property type field clicked (exact match)');
                    return true;
                }
            }

            // Fallback Method 3: Find second combobox on the page (first is Sale/Rent)
            const comboboxes = document.querySelectorAll('label[role="combobox"]');
            if (comboboxes.length >= 2) {
                comboboxes[1].click();
                // [browser] debugLog('     ✅ Property type field clicked (second combobox)');
                return true;
            }

            // [browser] debugLog('     ❌ Property type field not found');
            return false;
        });

        if (!fieldClicked) {
            debugLog('     ❌ Failed to click Property type field');
            return false;
        }

        // Wait for dropdown to appear
        await page.waitForTimeout(1000);

        // Step 2: Find and click the option with matching text
        debugLog(`     📍 Step 2: Finding and clicking option "${propertyType}"...`);

        const optionClicked = await page.evaluate((targetType) => {
            // Find span with text then click parent [role="option"]
            const spans = Array.from(document.querySelectorAll('span'));
            const targetSpan = spans.find(span => span.textContent.trim() === targetType);

            if (targetSpan) {
                const optionElement = targetSpan.closest('[role="option"]');
                if (optionElement) {
                    optionElement.click();
                    console.log(`     ✅ Property type "${targetType}" clicked`);
                    return true;
                } else {
                    // Fallback: click the span directly
                    targetSpan.click();
                    console.log(`     ✅ Span "${targetType}" clicked directly`);
                    return true;
                }
            }

            // [browser] debugLog(`     ❌ Property type option "${targetType}" not found`);
            return false;
        }, propertyType);

        if (optionClicked) {
            userLog(`     ✅ Property type "${propertyType}" selected successfully`);
            await page.waitForTimeout(500);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`     ❌ Error in selectPropertyType: ${error.message}`);
        return false;
    }
}

/**
 * Fill a Property form input field (bedrooms, bathrooms, price, square meters)
 * Step: Find span with labelText using XPath → Traverse up to find input → Click → Focus → Type human-like
 */
async function fillPropertyInputField(page, labelText, value) {
    userLog(`     📝 Filling input field "${labelText}" with value: ${value}`);

    try {
        // Step 1: Find and click the input field using XPath for flexible matching
        const inputClicked = await page.evaluate((text) => {
            // Special handling for "Price" - look for "Price per month" first
            let searchText = text;
            if (text === 'Price') {
                searchText = 'Price per month';
            }

            // Method 1: Use XPath to find span containing the text
            const xpath = `//span[contains(text(), '${searchText}')]`;
            const result = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );

            const targetSpan = result.singleNodeValue;

            if (targetSpan) {
                // Traverse up to find input field in the same structure
                let parent = targetSpan.parentElement;
                while (parent) {
                    const input = parent.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        // [browser] debugLog(`     ✅ Input "${searchText}" clicked and focused (XPath method)`);
                        return true;
                    }
                    parent = parent.parentElement;
                }
            }

            // Fallback Method 2: Try original exact match with closest label
            const spans = Array.from(document.querySelectorAll('span'));
            const labelSpan = spans.find(span => span.textContent.trim() === text);

            if (labelSpan) {
                const label = labelSpan.closest('label');
                if (label) {
                    const input = label.querySelector('input');
                    if (input) {
                        input.click();
                        input.focus();
                        console.log(`     ✅ Input "${text}" clicked and focused (exact match)`);
                        return true;
                    }
                }
            }

            // [browser] debugLog(`     ❌ Input "${text}" not found`);
            return false;
        }, labelText);

        if (!inputClicked) {
            debugLog(`     ❌ Failed to click input field "${labelText}"`);
            return false;
        }

        // Wait a bit for focus
        await page.waitForTimeout(300);

        // Step 2: Type the value using human-like typing
        // Clear existing value first
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        // Type with human-like delays
        const valueStr = value.toString();
        for (const char of valueStr) {
            await page.keyboard.type(char);
            const delay = 50 + Math.random() * 100; // 50-150ms delay between characters
            await page.waitForTimeout(delay);
        }

        userLog(`     ✅ Input "${labelText}" filled with value: ${value}`);
        return true;

    } catch (error) {
        console.error(`     ❌ Error in fillPropertyInputField (${labelText}): ${error.message}`);
        return false;
    }
}

/**
 * Fill Property Description textarea
 * Step: Find "Rental description" or "Property description" span → Get parent label → Find textarea → Click → Focus → Type human-like
 * @param {Page} page - Playwright page object
 * @param {string} value - Description text
 * @param {string} saleType - 'rent' or 'sale' to determine correct selector
 */
async function fillPropertyDescriptionField(page, value, saleType = 'rent') {
    userLog(`     📝 Filling property description (type: ${saleType})...`);

    try {
        // Step 1: Find and click the textarea
        // Use "Rental description" for rent, "Property description" for sale
        const textareaClicked = await page.evaluate((type) => {
            // Determine which selector to use based on saleType
            const descriptionLabels = type === 'rent'
                ? ['Rental description', 'Property description', 'Description']
                : ['Property description', 'Rental description', 'Description'];

            // Try each label variant
            for (const labelText of descriptionLabels) {
                // Method 1: Use XPath with contains
                const xpath = `//span[contains(text(), '${labelText}')]`;
                const result = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );

                const labelSpan = result.singleNodeValue;

                if (labelSpan) {
                    // Traverse up to find textarea
                    let parent = labelSpan.parentElement;
                    while (parent) {
                        const textarea = parent.querySelector('textarea');
                        if (textarea) {
                            textarea.click();
                            textarea.focus();
                            // [browser] debugLog(`     ✅ ${labelText} textarea clicked and focused (XPath method)`);
                            return true;
                        }
                        parent = parent.parentElement;
                    }

                    // Fallback: try closest label
                    const label = labelSpan.closest('label');
                    if (label) {
                        const textarea = label.querySelector('textarea');
                        if (textarea) {
                            textarea.click();
                            textarea.focus();
                            console.log(`     ✅ ${labelText} textarea clicked and focused (closest label)`);
                            return true;
                        }
                    }
                }
            }

            // Fallback Method 2: Try exact match span
            const spans = Array.from(document.querySelectorAll('span'));
            for (const labelText of descriptionLabels) {
                const labelSpan = spans.find(span => span.textContent.trim() === labelText);
                if (labelSpan) {
                    const label = labelSpan.closest('label');
                    if (label) {
                        const textarea = label.querySelector('textarea');
                        if (textarea) {
                            textarea.click();
                            textarea.focus();
                            console.log(`     ✅ ${labelText} textarea clicked and focused (exact match)`);
                            return true;
                        }
                    }
                }
            }

            // Fallback Method 3: Just find any textarea on the page
            const textareas = document.querySelectorAll('textarea');
            if (textareas.length > 0) {
                const lastTextarea = textareas[textareas.length - 1]; // Usually description is last
                lastTextarea.click();
                lastTextarea.focus();
                // [browser] debugLog('     ✅ Fallback: Found textarea element');
                return true;
            }

            // [browser] debugLog('     ❌ Property description textarea not found');
            return false;
        }, saleType);

        if (!textareaClicked) {
            debugLog('     ❌ Failed to click property description textarea');
            return false;
        }

        // Wait a bit for focus
        await page.waitForTimeout(300);

        // Step 2: Type the description using human-like typing
        // Clear existing value first
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);

        // Type with human-like delays (slightly faster for description)
        for (const char of value) {
            await page.keyboard.type(char);
            const delay = 30 + Math.random() * 70; // 30-100ms delay (faster for longer text)
            await page.waitForTimeout(delay);
        }

        userLog(`     ✅ Property description filled (${value.length} chars)`);
        return true;

    } catch (error) {
        console.error(`     ❌ Error in fillPropertyDescriptionField: ${error.message}`);
        return false;
    }
}

// Keep old functions for backward compatibility (deprecated)
async function fillPropertyInput(page, labelText, value) {
    return await fillPropertyInputField(page, labelText, value);
}

async function fillPropertyDescription(page, value) {
    return await fillPropertyDescriptionField(page, value);
}


async function humanType(page, inputLocator, text) {
    // Focus on the input element
    await inputLocator.focus();

    // Type each character with human-like delays
    for (const char of text) {
        await page.keyboard.type(char);
        const delay = 50 + Math.random() * 150; // 50–200 ms delay between characters
        await page.waitForTimeout(delay);
    }
}

async function humanTypeSlow(page, inputLocator, text) {
    // Focus on the input element
    await inputLocator.focus();
    await page.waitForTimeout(100 + Math.random() * 100); // Initial pause before typing

    // Type each character with SLOWER human-like delays (for location)
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Random delay between characters - vary based on character type
        let delay;
        if (char === ' ') {
            delay = 200 + Math.random() * 200; // Longer pause after space (thinking)
        } else if (char === char.toUpperCase() && char !== char.toLowerCase()) {
            delay = 150 + Math.random() * 200; // Pause for uppercase (shift key)
        } else {
            delay = 80 + Math.random() * 180; // Normal typing: 80-260 ms
        }

        // Occasional "thinking" pause (humans sometimes pause while typing)
        if (Math.random() < 0.1 && i > 2 && i < text.length - 2) {
            delay += 300 + Math.random() * 400; // Add extra pause 10% of the time
            debugLog(`       💭 Typing pause at position ${i}...`);
        }

        await page.keyboard.type(char);
        await page.waitForTimeout(delay);
    }

    // Final pause after typing complete
    await page.waitForTimeout(150 + Math.random() * 150);
}

async function humanClick(page, selector) {
    const el = await page.locator(selector).first();
    const box = await el.boundingBox();

    if (!box) return;

    // random point inside element
    const x = box.x + box.width * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);

    // move mouse gradually
    await page.mouse.move(x, y, { steps: 15 + Math.floor(Math.random() * 10) });
    await page.waitForTimeout(80 + Math.random() * 120);

    // mouse down & up like human
    await page.mouse.down();
    await page.waitForTimeout(40 + Math.random() * 80);
    await page.mouse.up();
}

// ============================================================
// ROBUST LOCATION DROPDOWN CLICK HELPER
// ============================================================

/**
 * Tunggu dropdown location muncul dan klik opsi pertama
 * Fungsi ini menangani multiple selectors dan multiple click methods
 * @param {Page} page - Playwright page object
 * @param {number} maxWait - Maximum waktu tunggu dalam ms (default 10000)
 * @returns {Promise<boolean>} - true jika berhasil klik, false jika gagal
 */
async function waitForAndClickFirstLocationOption(page, maxWait = 10000) {
    const startTime = Date.now();
    let lastFoundSelector = null;
    let lastFoundText = null;

    debugLog(`    🔍 Starting dropdown detection (max ${maxWait}ms)...`);

    // Polling loop untuk menunggu dropdown muncul
    while (Date.now() - startTime < maxWait) {
        const result = await page.evaluate(() => {
            // Multiple possible selectors untuk Facebook location dropdown
            const selectors = [
                'ul[role="listbox"] li[role="option"]:first-child',
                '[role="listbox"] [role="option"]:first-of-type',
                'li[role="option"]:first-child',
                '[role="option"]:first-of-type',
                'div[role="option"]:first-child',
                'ul[role="listbox"] > li:first-child',
                '[role="listbox"] [role="option"]'
            ];

            for (const selector of selectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        // Cek apakah element visible
                        const rect = element.getBoundingClientRect();
                        const computedStyle = window.getComputedStyle(element);
                        const isVisible = rect.width > 0 && rect.height > 0
                            && element.offsetParent !== null
                            && computedStyle.visibility !== 'hidden'
                            && computedStyle.display !== 'none'
                            && computedStyle.opacity !== '0';

                        if (isVisible) {
                            // Cek apakah element benar-benar di viewport
                            const isInViewport = rect.top >= 0 && rect.left >= 0
                                && rect.bottom <= window.innerHeight
                                && rect.right <= window.innerWidth;

                            return {
                                found: true,
                                selector: selector,
                                text: element.textContent?.trim().substring(0, 50),
                                id: element.id,
                                className: element.className,
                                isInViewport: isInViewport,
                                rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                            };
                        }
                    }
                } catch (e) {
                    // Continue ke selector berikutnya
                }
            }
            return { found: false };
        });

        if (result.found) {
            lastFoundSelector = result.selector;
            lastFoundText = result.text;
            userLog(`    ✅ Dropdown option FOUND!`);
            debugLog(`       Selector: ${result.selector}`);
            debugLog(`       Text: ${result.text}`);
            debugLog(`       ID: ${result.id || 'none'}`);
            debugLog(`       In Viewport: ${result.isInViewport}`);

            // Tambahkan small delay sebelum klik untuk lebih human-like
            await page.waitForTimeout(300);

            // Coba klik dengan multiple methods
            const clickResult = await clickDropdownOptionMultipleMethods(page, result.selector);

            if (clickResult) {
                userLog(`    ✅ Location dropdown option clicked successfully!`);
                return true;
            }
        }

        // Tunggu sebentar sebelum cek lagi (progressive wait)
        const elapsed = Date.now() - startTime;
        const waitTime = elapsed < 3000 ? 200 : 300; // More frequent at start
        await page.waitForTimeout(waitTime);

        if (elapsed % 1000 < 300) {
            debugLog(`    ⏳ Still waiting... (${Math.round(elapsed / 1000)}s/${Math.round(maxWait / 1000)}s)`);
        }
    }

    debugLog(`    ❌ Timeout: Dropdown tidak muncul dalam ${maxWait}ms`);
    if (lastFoundSelector) {
        debugLog(`       Last found: ${lastFoundSelector} - "${lastFoundText}"`);
    }
    return false;
}

/**
 * Klik dropdown option dengan multiple fallback methods
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector untuk element
 * @returns {Promise<boolean>} - true jika berhasil, false jika gagal
 */
async function clickDropdownOptionMultipleMethods(page, selector) {

    // ============================================
    // METHOD 1: Keyboard (Arrow Down + Enter)
    // ============================================
    // Ini PALING human-like dan sering works di Facebook
    try {
        debugLog('    ⌨️ Method 1: Keyboard navigation (Arrow Down + Enter)...');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200 + Math.random() * 200); // Random delay
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // Verify: cek apakah dropdown sudah closed
        const dropdownClosed1 = await page.evaluate(() => {
            const listbox = document.querySelector('ul[role="listbox"], [role="listbox"]');
            if (!listbox) return true; // No listbox = closed
            return listbox.offsetParent === null || listbox.getAttribute('aria-hidden') === 'true';
        });

        if (dropdownClosed1) {
            debugLog('    ✅ Method 1 (Keyboard) SUCCESS!');
            return true;
        }
        debugLog('    ⚠️ Method 1: Dropdown still open, trying next method...');
    } catch (e) {
        debugLog('    ⚠️ Method 1 failed:', e.message);
    }

    // ============================================
    // METHOD 2: JavaScript click dengan full event dispatch
    // ============================================
    // Mirip dengan script user yang berhasil
    try {
        debugLog('    🖱️ Method 2: JS click with full event dispatch...');
        const result = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return false;

            // Scroll ke element dulu
            element.scrollIntoView({ block: 'center' });
            element.focus();

            // Dispatch semua mouse events secara berurunan (human-like)
            const events = [
                new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }),
                new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }),
                new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window }),
                new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
                new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }),
                new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
            ];

            events.forEach(evt => element.dispatchEvent(evt));

            return true;
        }, selector);

        if (result) {
            await page.waitForTimeout(800);

            // Verify
            const dropdownClosed2 = await page.evaluate(() => {
                const listbox = document.querySelector('ul[role="listbox"], [role="listbox"]');
                if (!listbox) return true;
                return listbox.offsetParent === null;
            });

            if (dropdownClosed2) {
                debugLog('    ✅ Method 2 (JS Events) SUCCESS!');
                return true;
            }
            debugLog('    ⚠️ Method 2: Dropdown still open, trying next method...');
        }
    } catch (e) {
        debugLog('    ⚠️ Method 2 failed:', e.message);
    }

    // ============================================
    // METHOD 3: Playwright native click dengan force
    // ============================================
    try {
        debugLog('    🖱️ Method 3: Playwright click with force...');
        const locator = page.locator(selector).first();

        // Scroll ke element dulu
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        // Hover dulu (human behavior)
        await locator.hover({ timeout: 3000 });
        await page.waitForTimeout(200);

        // Click dengan force
        await locator.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(500);

        // Verify
        const dropdownClosed3 = await page.evaluate(() => {
            const listbox = document.querySelector('ul[role="listbox"], [role="listbox"]');
            if (!listbox) return true;
            return listbox.offsetParent === null;
        });

        if (dropdownClosed3) {
            debugLog('    ✅ Method 3 (Playwright Force) SUCCESS!');
            return true;
        }
        debugLog('    ⚠️ Method 3: Dropdown still open, trying next method...');
    } catch (e) {
        debugLog('    ⚠️ Method 3 failed:', e.message);
    }

    // ============================================
    // METHOD 4: CDP (Chrome DevTools Protocol) Input Dispatch
    // ============================================
    try {
        debugLog('    🖱️ Method 4: CDP Input dispatch...');
        const box = await page.locator(selector).first().boundingBox();
        if (box) {
            const client = await page.context().newCDPSession(page);

            const x = Math.round(box.x + box.width / 2);
            const y = Math.round(box.y + box.height / 2);

            await client.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: x,
                y: y,
                clickCount: 0
            });

            await page.waitForTimeout(100);

            await client.send('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: x,
                y: y,
                button: 'left',
                clickCount: 1
            });

            await page.waitForTimeout(80 + Math.random() * 100);

            await client.send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: x,
                y: y,
                button: 'left',
                clickCount: 1
            });

            await page.waitForTimeout(500);

            // Verify
            const dropdownClosed4 = await page.evaluate(() => {
                const listbox = document.querySelector('ul[role="listbox"], [role="listbox"]');
                if (!listbox) return true;
                return listbox.offsetParent === null;
            });

            if (dropdownClosed4) {
                debugLog('    ✅ Method 4 (CDP) SUCCESS!');
                return true;
            }
        }
        debugLog('    ⚠️ Method 4: No bounding box or still open...');
    } catch (e) {
        debugLog('    ⚠️ Method 4 failed:', e.message);
    }

    // ============================================
    // METHOD 5: Double Enter (Facebook sometimes requires double)
    // ============================================
    try {
        debugLog('    ⌨️ Method 5: Double Enter...');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        const dropdownClosed5 = await page.evaluate(() => {
            const listbox = document.querySelector('ul[role="listbox"], [role="listbox"]');
            if (!listbox) return true;
            return listbox.offsetParent === null;
        });

        if (dropdownClosed5) {
            debugLog('    ✅ Method 5 (Double Enter) SUCCESS!');
            return true;
        }
    } catch (e) {
        debugLog('    ⚠️ Method 5 failed:', e.message);
    }

    debugLog('    ❌ All click methods failed!');
    return false;
}
async function fillTitle(page, title) {
    try {
        debugLog(`    📝 Looking for title field...`);

        // Primary method: Find the input by label association
        const titleSelectors = [
            'input[id="_r_1l_"]', // Specific ID from HTML
            'input[aria-labelledby*="Title"]',
            'input[type="text"]:first-of-type'
        ];

        for (const selector of titleSelectors) {
            try {
                debugLog(`    🎯 Trying selector: ${selector}`);
                const titleInput = await page.locator(selector).first();

                if (await titleInput.count() > 0) {
                    debugLog('    🎯 Found title input, clicking first...');

                    // Click the input first to focus it (like human behavior)
                    await titleInput.click({ delay: 200 });
                    await page.waitForTimeout(300);

                    // Clear the input
                    await titleInput.fill('');

                    // Type the title using humanType function
                    await humanType(page, titleInput, title);

                    // Press Enter to confirm the title
                    await page.waitForTimeout(300);
                    await page.keyboard.press('Enter');

                    userLog(`    ✅ Title typed and Enter pressed: ${title}`);
                    return true;
                }
            } catch (error) {
                debugLog(`    ❌ Selector ${selector} failed: ${error.message}`);
                continue;
            }
        }

        debugLog('    ❌ All title selectors failed');
        return false;

    } catch (error) {
        console.error(`❌ Title fill error: ${error.message}`);
        return false;
    }
}

async function fillPrice(page, price) {
    try {
        // Format price as Indonesian Rupiah
        const formattedPrice = price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

        debugLog(`    💰 Looking for price field...`);

        // Primary method: Use the specific JavaScript selector provided by user
        debugLog(`    🎯 Trying user-provided JavaScript selector for Price field...`);

        try {
            const priceElement = await page.evaluate(() => {
                const input = [...document.querySelectorAll('label')]
                    .find(l => l.textContent.trim() === 'Price')
                    ?.querySelector('input');
                if (input) {
                    // Return unique identifiers for the input
                    return {
                        id: input.id,
                        className: input.className,
                        name: input.name,
                        ariaLabel: input.getAttribute('aria-label'),
                        type: input.type
                    };
                }
                return null;
            });

            if (priceElement) {
                debugLog('    🎯 Found price input with user-provided selector, clicking first...');

                // Create a locator based on the unique identifiers
                let selector;
                if (priceElement.id) {
                    selector = `input[id="${priceElement.id}"]`;
                } else if (priceElement.ariaLabel) {
                    selector = `input[aria-label="${priceElement.ariaLabel}"]`;
                } else if (priceElement.name) {
                    selector = `input[name="${priceElement.name}"]`;
                } else {
                    // Fallback to a more complex selector
                    selector = `input[type="${priceElement.type}"]`;
                }

                const priceLocator = page.locator(selector);

                // Click the input first to focus it (like human behavior)
                await priceLocator.click({ delay: 200 });
                await page.waitForTimeout(300);

                // Clear the input
                await priceLocator.fill('');

                // Type price directly (no currency prefix for international)
                await humanType(page, priceLocator, '');

                // Wait a bit before typing numbers
                await page.waitForTimeout(300);

                // Type the formatted number using humanType function
                await humanType(page, priceLocator, formattedPrice);

                // Press Enter to confirm the price
                await page.waitForTimeout(300);
                await page.keyboard.press('Enter');

                userLog(`    ✅ Price typed and Enter pressed: ${formattedPrice}`);
                return true;
            } else {
                debugLog('    ❌ User-provided selector did not find price input');
            }
        } catch (error) {
            debugLog(`    ❌ User-provided selector failed: ${error.message}`);
        }

        // Fallback: Try basic CSS selectors if the JavaScript selector fails
        const fallbackSelectors = [
            'input[id="_r_1p_"]', // Specific ID from HTML
            'input[aria-labelledby*="Price"]',
            'input[type="text"]:nth-of-type(2)'
        ];

        for (const selector of fallbackSelectors) {
            try {
                debugLog(`    🎯 Trying fallback selector: ${selector}`);
                const priceInput = await page.locator(selector).first();

                if (await priceInput.count() > 0) {
                    debugLog('    🎯 Found price input with fallback selector, clicking first...');

                    // Click the input first to focus it (like human behavior)
                    await priceInput.click({ delay: 200 });
                    await page.waitForTimeout(300);

                    // Clear the input
                    await priceInput.fill('');

                    // Type price directly (no currency prefix for international)
                    await humanType(page, priceInput, '');

                    // Wait a bit before typing numbers
                    await page.waitForTimeout(300);

                    // Type the formatted number using humanType function
                    await humanType(page, priceInput, formattedPrice);

                    // Press Enter to confirm the price
                    await page.waitForTimeout(300);
                    await page.keyboard.press('Enter');

                    userLog(`    ✅ Price typed and Enter pressed: ${formattedPrice}`);
                    return true;
                }
            } catch (error) {
                debugLog(`    ❌ Fallback selector ${selector} failed: ${error.message}`);
                continue;
            }
        }

        debugLog('    ❌ All price selectors failed');
        return false;

    } catch (error) {
        console.error(`❌ Price fill error: ${error.message}`);
        return false;
    }
}

async function selectCategory(page, category) {
    try {
        debugLog(`    📂 Looking for category dropdown...`);

        // Step 1: Click the category dropdown to open it
        debugLog(`    🖱️ Step 1: Clicking category dropdown...`);

        const dropdownClicked = await page.evaluate(() => {
            try {
                // Find the category dropdown (combobox with Category label)
                const labels = document.querySelectorAll('label[role="combobox"]');
                for (const label of labels) {
                    const span = label.querySelector('span');
                    if (span && span.textContent.trim() === 'Category') {
                        // [browser] debugLog('    ✅ Found category dropdown label');

                        // Click to open dropdown
                        label.click();
                        label.focus();
                        // [browser] debugLog('    🖱️ Category dropdown clicked');
                        return true;
                    }
                }

                // Fallback: Try specific selector
                const fallbackDropdown = document.querySelector('label[aria-labelledby="_r_1u_"]');
                if (fallbackDropdown) {
                    // [browser] debugLog('    ✅ Found category dropdown with fallback selector');
                    fallbackDropdown.click();
                    fallbackDropdown.focus();
                    // [browser] debugLog('    🖱️ Category dropdown clicked (fallback)');
                    return true;
                }

                // [browser] debugLog('    ❌ Category dropdown not found');
                return false;
            } catch (error) {
                console.error('    JS error clicking dropdown:', error);
                return false;
            }
        });

        if (!dropdownClicked) {
            debugLog('    ❌ Failed to click category dropdown');
            return false;
        }

        // Step 2: Wait for dropdown to appear
        debugLog(`    ⏳ Step 2: Waiting for dropdown to appear...`);
        await page.waitForTimeout(2000);

        // Step 3: Click the specific category option
        userLog(`    🎯 Step 3: Clicking category option: ${category}`);

        // Map category names to exact text in dropdown
        const categoryTextMap = {
            'Tools': 'Tools',
            'Furniture': 'Furniture',
            'Household': 'Household',
            'Garden': 'Garden',
            'Appliances': 'Appliances',
            'Video Games': 'Video Games',
            'Books Movies & Music': 'Books, Movies & Music',
            'Bags & Luggage': 'Bags & Luggage',
            'Women\'s clothing & shoes': 'Women\'s clothing & shoes',
            'Men\'s clothing & shoes': 'Men\'s clothing & shoes',
            'Jewelry & Accessories': 'Jewelry & Accessories',
            'Health & beauty': 'Health & beauty',
            'Pet Supplies': 'Pet Supplies',
            'Baby & kids': 'Baby & kids',
            'Toys & Games': 'Toys & Games',
            'Electronics & computers': 'Electronics & computers',
            'Mobile phones': 'Mobile phones',
            'Bicycles': 'Bicycles',
            'Arts & Crafts': 'Arts & Crafts',
            'Sports & Outdoors': 'Sports & Outdoors',
            'Auto parts': 'Auto parts',
            'Musical Instruments': 'Musical Instruments',
            'Antiques & Collectibles': 'Antiques & Collectibles',
            'Garage Sale': 'Garage Sale',
            'Miscellaneous': 'Miscellaneous'
        };

        const targetText = categoryTextMap[category];
        if (!targetText) {
            debugLog(`    ❌ No mapping found for category: ${category}`);
            return false;
        }

        const optionClicked = await page.evaluate((targetCategory) => {
            try {
                // Find all dropdown option elements using the exact selector pattern
                const allSpans = document.querySelectorAll('div[data-visualcompletion="ignore-dynamic"] span[dir="auto"] span');

                // [browser] debugLog(`    📋 Found ${allSpans.length} potential option elements`);

                // Find the one with matching text
                for (const span of allSpans) {
                    const text = span.textContent.trim();
                    // [browser] debugLog(`    🔍 Checking: "${text}"`);

                    if (text === targetCategory) {
                        // [browser] debugLog(`    🎯 Found target category: ${targetCategory}`);

                        // Click the element
                        span.click();
                        console.log(`    ✅ Category "${targetCategory}" clicked successfully`);
                        return true;
                    }
                }

                // [browser] debugLog(`    ❌ Category option "${targetCategory}" not found in dropdown`);
                return false;

            } catch (error) {
                console.error('    JS error clicking category option:', error);
                return false;
            }
        }, targetText);

        if (optionClicked) {
            // Step 4: Wait for selection to be applied
            debugLog(`    ⏳ Step 4: Waiting for selection to apply...`);
            await page.waitForTimeout(2000);

            userLog(`    ✅ Category "${category}" selected successfully`);

            // Scroll to main content area after selection
            await page.evaluate(() => {
                const mainElement = document.querySelector('div[role="main"]');
                if (mainElement) {
                    mainElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
            await page.waitForTimeout(1000);

            return true;
        } else {
            debugLog(`    ❌ Failed to click category option: ${category}`);

            // Try to close dropdown
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            return false;
        }

    } catch (error) {
        console.error(`❌ Category select error: ${error.message}`);
        return false;
    }
}

async function selectCondition(page, condition) {
    try {
        debugLog(`    🔧 Looking for condition dropdown...`);

        // Primary method: Based on HTML structure - label with span containing "Condition"
        const selected = await page.evaluate((conditionName) => {
            try {
                // Find label that contains span with text "Condition"
                const labels = document.querySelectorAll('label[role="combobox"]');
                for (const label of labels) {
                    const span = label.querySelector('span');
                    if (span && span.textContent.trim() === 'Condition') {
                        // [browser] debugLog(`    ✅ Found condition label with span`);

                        // Click the label to open dropdown (like human behavior)
                        label.click();
                        label.focus();

                        // Wait for dropdown to open and options to appear
                        setTimeout(() => {
                            try {
                                // Find the option with matching text
                                const options = document.querySelectorAll('div[role="option"]');
                                // [browser] debugLog(`    📋 Found ${options.length} option elements`);

                                for (const option of options) {
                                    const optionText = option.textContent || '';
                                    // [browser] debugLog(`    🔍 Checking option: "${optionText.trim()}"`);

                                    if (optionText.trim() === conditionName) {
                                        console.log(`    🎯 Clicking condition option: ${conditionName}`);
                                        option.click();
                                        return true;
                                    }
                                }

                                // [browser] debugLog(`    ❌ Condition option not found: ${conditionName}`);
                                return false;
                            } catch (error) {
                                console.error('    JS error selecting condition option:', error);
                                return false;
                            }
                        }, 1500);

                        return true; // Dropdown was opened
                    }
                }

                // [browser] debugLog('    ❌ Condition label not found');
                return false;
            } catch (error) {
                console.error('    JS error finding condition:', error);
                return false;
            }
        }, condition);

        if (selected) {
            await page.waitForTimeout(2000);
            userLog(`    ✅ Condition selected successfully: ${condition}`);

            // After selecting condition, scroll to the main content area as requested
            await page.evaluate(() => {
                const mainElement = document.querySelector('div[role="main"]');
                if (mainElement) {
                    mainElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
            await page.waitForTimeout(1000);

            return true;
        }

        // Fallback: Try direct label selectors
        debugLog(`    🔄 Trying fallback selectors for condition...`);
        const fallbackSelectors = [
            'label[aria-labelledby="_r_24_"]', // Specific ID from HTML
            'label:has(span:contains("Condition"))',
            'label[role="combobox"]:has(span:contains("Condition"))'
        ];

        for (const selector of fallbackSelectors) {
            try {
                debugLog(`    🎯 Trying condition selector: ${selector}`);
                const dropdown = await page.locator(selector).first();

                if (await dropdown.count() > 0) {
                    debugLog(`    ✅ Found condition dropdown with selector: ${selector}`);

                    await dropdown.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);

                    await dropdown.click({ delay: 200 });
                    debugLog(`    🖱️ Condition dropdown clicked, waiting for options...`);
                    await page.waitForTimeout(2000);

                    // Look for the specific condition option
                    const optionSelectors = [
                        `div[role="option"]:has-text("${condition}")`,
                        `div:has-text("${condition}")`
                    ];

                    let optionFound = false;
                    for (const optionSel of optionSelectors) {
                        try {
                            // Wait for options to be visible first
                            await page.waitForTimeout(1000);

                            const option = await page.locator(optionSel).first();
                            if (await option.count() > 0) {
                                debugLog(`    🎯 Found condition option: ${condition}`);

                                // Make sure option is visible
                                await option.scrollIntoViewIfNeeded();
                                await page.waitForTimeout(500);

                                // Click the option directly
                                await option.click({ delay: 300, force: true });

                                userLog(`    ✅ Condition "${condition}" clicked successfully`);

                                // Wait for selection to be applied
                                await page.waitForTimeout(1500);

                                // Verify the selection by checking if dropdown closed
                                const stillOpenDropdowns = await page.locator('div[role="listbox"], div[aria-expanded="true"]').count();
                                if (stillOpenDropdowns === 0) {
                                    userLog(`    ✅ Dropdown closed, selection confirmed`);
                                    optionFound = true;
                                } else {
                                    debugLog(`    ⚠️ Dropdown still open, trying to close it`);
                                    await page.keyboard.press('Escape');
                                    await page.waitForTimeout(500);
                                    optionFound = true; // Still consider it successful
                                }

                                // Scroll to main content after selection
                                await page.evaluate(() => {
                                    const mainElement = document.querySelector('div[role="main"]');
                                    if (mainElement) {
                                        mainElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                });
                                await page.waitForTimeout(1000);

                                break;
                            }
                        } catch (e) {
                            debugLog(`    ⚠️ Option selector ${optionSel} failed: ${e.message}`);
                            continue;
                        }
                    }

                    if (optionFound) {
                        return true;
                    } else {
                        debugLog(`    ❌ Condition option "${condition}" not found in dropdown`);
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(500);
                    }
                }
            } catch (error) {
                debugLog(`    ❌ Condition selector ${selector} failed: ${error.message}`);
                continue;
            }
        }

        debugLog('    ❌ CRITICAL: All condition selection methods failed');
        return false;

    } catch (error) {
        console.error(`❌ Condition select error: ${error.message}`);
        return false;
    }
}

async function fillLocation(page, location) {
    try {
        debugLog(`    📍 Looking for location field...`);

        // STEP 1: Gradual scrolling - check for location selector after each small scroll
        debugLog(`    🔍 Starting gradual scroll to find location selector...`);

        let locationExists = await page.locator('input[aria-label="Location"][role="combobox"]').count() > 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 15; // Maximum scroll attempts
        const scrollIncrement = 100; // Pixels per scroll

        // Keep scrolling gradually until location is found or max attempts reached
        while (!locationExists && scrollAttempts < maxScrollAttempts) {
            scrollAttempts++;
            debugLog(`    📜 Scroll attempt ${scrollAttempts}/${maxScrollAttempts}: Scrolling ${scrollIncrement}px...`);

            // Scroll gradually (small increment)
            await page.evaluate((increment) => {
                window.scrollBy(0, increment);
            }, scrollIncrement);

            await page.waitForTimeout(300); // Small wait after each scroll

            // Check if location selector exists
            locationExists = await page.locator('input[aria-label="Location"][role="combobox"]').count() > 0;

            if (locationExists) {
                debugLog(`    ✅ Location selector found after ${scrollAttempts} scroll attempts!`);
                break;
            }
        }

        if (!locationExists) {
            debugLog(`    ⚠️ Location selector not found after ${maxScrollAttempts} scrolls, trying "More details" expansion...`);
        }

        // STEP 2: Check if "More details" section is expanded
        debugLog(`    📋 Checking if "More details" section is expanded...`);
        const moreDetailsExpanded = await page.evaluate(() => {
            // Look for the "More details" button
            const moreDetailsButtons = document.querySelectorAll('div[role="button"]');
            for (const button of moreDetailsButtons) {
                const span = button.querySelector('span');
                if (span && span.textContent.includes('More details')) {
                    // [browser] debugLog('    ✅ Found "More details" button');

                    // Check if it's already expanded (aria-expanded attribute)
                    const ariaExpanded = button.getAttribute('aria-expanded');
                    if (ariaExpanded === 'false' || !ariaExpanded) {
                        // [browser] debugLog('    📂 "More details" not expanded, clicking to expand...');
                        button.click();
                        return false; // Not expanded, we just clicked it
                    } else {
                        // [browser] debugLog('    ✅ "More details" already expanded');
                        return true; // Already expanded
                    }
                }
            }
            // [browser] debugLog('    ⚠️ "More details" button not found');
            return true; // Assume it's already expanded
        });

        if (!moreDetailsExpanded) {
            debugLog(`    ⏳ Waiting for "More details" section to expand...`);
            await page.waitForTimeout(2000);

            // Check again after "More details" expansion (location field might appear now)
            locationExists = await page.locator('input[aria-label="Location"][role="combobox"]').count() > 0;
            debugLog(`    🔍 After "More details" expansion, location selector exists: ${locationExists}`);
        }

        // STEP 3: If still not found after "More details" expansion, continue gradual scrolling
        if (!locationExists) {
            debugLog(`    📜 Location still not found, continuing gradual scroll...`);

            let additionalScrollAttempts = 0;
            const maxAdditionalAttempts = 10;

            while (!locationExists && additionalScrollAttempts < maxAdditionalAttempts) {
                additionalScrollAttempts++;
                debugLog(`    📜 Additional scroll ${additionalScrollAttempts}/${maxAdditionalAttempts}: Scrolling ${scrollIncrement}px...`);

                await page.evaluate((increment) => {
                    window.scrollBy(0, increment);
                }, scrollIncrement);

                await page.waitForTimeout(300);

                locationExists = await page.locator('input[aria-label="Location"][role="combobox"]').count() > 0;

                if (locationExists) {
                    debugLog(`    ✅ Location selector found after additional ${additionalScrollAttempts} scrolls!`);
                    break;
                }
            }
        }

        // STEP 4: Final check - if still not found, try scrolling to bottom
        if (!locationExists) {
            debugLog(`    📜 Still not found, scrolling to bottom of page...`);
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(500);

            locationExists = await page.locator('input[aria-label="Location"][role="combobox"]').count() > 0;
            debugLog(`    🔍 After scrolling to bottom, location selector exists: ${locationExists}`);
        }

        // Location area should now be visible after (optional) scrolling and expanding

        // Debug: Check what elements exist now after expansion
        await page.evaluate(() => {
            // [browser] debugLog('    🔍 DEBUG: Looking for location elements after expansion...');

            // Find all inputs
            const allInputs = document.querySelectorAll('input');
            // [browser] debugLog(`    📊 Found ${allInputs.length} total input elements`);

            allInputs.forEach((input, index) => {
                const ariaLabel = input.getAttribute('aria-label') || '';
                const placeholder = input.getAttribute('placeholder') || '';
                const role = input.getAttribute('role') || '';
                const type = input.getAttribute('type') || '';

                if (ariaLabel.toLowerCase().includes('location') ||
                    placeholder.toLowerCase().includes('location') ||
                    role === 'combobox') {
                    console.log(`    🎯 Potential location input ${index}:`, {
                        ariaLabel, placeholder, role, type
                    });
                }
            });

            // Check all comboboxes
            const comboboxes = document.querySelectorAll('[role="combobox"]');
            // [browser] debugLog(`    📋 Found ${comboboxes.length} combobox elements`);
            comboboxes.forEach((box, index) => {
                const text = box.textContent || '';
                const ariaLabel = box.getAttribute('aria-label') || '';
                // [browser] debugLog(`    🔲 Combobox ${index}: "${text.substring(0, 30)}..." aria-label: "${ariaLabel}"`);
            });
        });

        // Method 1: Try the exact selector provided by user
        debugLog(`    🎯 Trying exact selector: input[aria-label="Location"][role="combobox"]`);
        const locationInputExact = await page.locator('input[aria-label="Location"][role="combobox"]').first();

        if (await locationInputExact.count() > 0) {
            debugLog('    🎯 Found location input with exact selector, clicking first...');

            // Use JavaScript click directly to bypass overlay/blocking elements
            const clickSuccess = await page.evaluate(() => {
                try {
                    const input = document.querySelector('input[aria-label="Location"][role="combobox"]');
                    if (input) {
                        input.focus();
                        input.click();
                        return true;
                    }
                    return false;
                } catch (error) {
                    // [browser] debugLog('    ❌ JS click error:', error.message);
                    return false;
                }
            });

            if (!clickSuccess) {
                debugLog('    ⚠️ JS click failed, trying Playwright click...');
                try {
                    await locationInputExact.click({ force: true, timeout: 5000 });
                } catch (clickError) {
                    debugLog('    ⚠️ Playwright click also failed, continuing anyway...');
                }
            }

            await page.waitForTimeout(300);

            // CHECK: If location is already filled, skip filling process
            const existingLocationValue = await page.evaluate(() => {
                const input = document.querySelector('input[aria-label="Location"][role="combobox"]');
                return input ? input.value : '';
            });

            if (existingLocationValue && existingLocationValue.trim() !== '') {
                userLog(`    ✅ Location already filled: "${existingLocationValue}". Skipping fill process...`);
                return true;
            }

            // Clear existing value using Ctrl+A then Backspace (more reliable)
            debugLog('    🧹 Clearing existing location value...');
            await page.evaluate(() => {
                const input = document.querySelector('input[aria-label="Location"][role="combobox"]');
                if (input) {
                    input.focus();
                    input.select(); // Select all text
                }
            });
            await page.waitForTimeout(200);
            await page.keyboard.press('Backspace'); // Delete selected text
            await page.waitForTimeout(200);

            // Type the location using SLOW humanType function
            await humanTypeSlow(page, locationInputExact, location);

            // Verify typing worked
            const currentValue = await page.evaluate(() => {
                const input = document.querySelector('input[aria-label="Location"][role="combobox"]');
                return input ? input.value : '';
            });
            userLog(`    ✅ Location input value after typing: "${currentValue}"`);

            // Wait for dropdown to appear (using new robust function)
            debugLog('    ⏳ Waiting for location dropdown to appear...');
            await page.waitForTimeout(3000);

            // Use the new robust function to click first dropdown option
            const dropdownClicked = await waitForAndClickFirstLocationOption(page, 12000);

            if (dropdownClicked) {
                userLog(`    ✅ Location selected from dropdown: ${location}`);
                await page.waitForTimeout(1500);
                return true;
            }

            // Final fallback: press Enter if dropdown click failed
            debugLog('    🔄 All dropdown methods failed, pressing Enter as final fallback...');
            await page.keyboard.press('Enter');
            debugLog(`    ✅ Location typed and Enter pressed (fallback): ${location}`);
            await page.waitForTimeout(1000);
            return true;
        }

        // Method 2: Try finding by label association
        debugLog(`    🏷️ Trying label association method...`);

        // Find labels containing "Location" and get associated input
        const locationElement = await page.evaluate(() => {
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
                const text = label.textContent || '';
                if (text.toLowerCase().includes('location')) {
                    const input = label.querySelector('input') ||
                        label.nextElementSibling?.querySelector('input') ||
                        label.parentElement?.querySelector('input');
                    if (input) {
                        return {
                            selector: 'input[aria-label="' + input.getAttribute('aria-label') + '"]',
                            found: true
                        };
                    }
                }
            }
            return { found: false };
        });

        if (locationElement.found) {
            const locationInputLabel = await page.locator(locationElement.selector).first();

            if (await locationInputLabel.count() > 0) {
                debugLog('    🎯 Found location input by label association, clicking first...');

                // Use JavaScript click directly to bypass overlay/blocking elements
                const clickSuccess = await page.evaluate((sel) => {
                    try {
                        const input = document.querySelector(sel);
                        if (input) {
                            input.focus();
                            input.click();
                            return true;
                        }
                        return false;
                    } catch (error) {
                        return false;
                    }
                }, locationElement.selector);

                if (!clickSuccess) {
                    try {
                        await locationInputLabel.click({ force: true, timeout: 5000 });
                    } catch (clickError) {
                        debugLog('    ⚠️ Playwright click failed, continuing anyway...');
                    }
                }

                await page.waitForTimeout(300);

                // CHECK: If location is already filled, skip filling process
                const existingLocValLabel = await page.evaluate((sel) => {
                    const input = document.querySelector(sel);
                    return input ? input.value : '';
                }, locationElement.selector);

                if (existingLocValLabel && existingLocValLabel.trim() !== '') {
                    userLog(`    ✅ Location already filled (label): "${existingLocValLabel}". Skipping fill...`);
                    return true;
                }

                // Clear existing value using select then Backspace
                debugLog('    🧹 Clearing existing location value...');
                await page.evaluate((sel) => {
                    const input = document.querySelector(sel);
                    if (input) {
                        input.focus();
                        input.select(); // Select all text
                    }
                }, locationElement.selector);
                await page.waitForTimeout(200);
                await page.keyboard.press('Backspace'); // Delete selected text
                await page.waitForTimeout(200);

                // Type the location using SLOW humanType function
                await humanTypeSlow(page, locationInputLabel, location);

                // Verify typing worked
                const currentValue2 = await page.evaluate((sel) => {
                    const input = document.querySelector(sel);
                    return input ? input.value : '';
                }, locationElement.selector);
                userLog(`    ✅ Location input value after typing: "${currentValue2}"`);

                // Wait for dropdown to appear
                debugLog('    ⏳ Waiting for location dropdown to appear...');
                await page.waitForTimeout(3000);

                // Use the new robust function to click first dropdown option
                const dropdownClicked2 = await waitForAndClickFirstLocationOption(page, 12000);

                if (dropdownClicked2) {
                    userLog(`    ✅ Location selected from dropdown by label association: ${location}`);
                    await page.waitForTimeout(1500);
                    return true;
                }

                // Fallback: press Enter if dropdown click failed
                debugLog('    🔄 All dropdown methods failed, pressing Enter as fallback...');
                await page.keyboard.press('Enter');
                debugLog(`    ✅ Location typed and Enter pressed by label association (fallback): ${location}`);
                await page.waitForTimeout(1000);
                return true;
            }
        }

        // Method 3: Try various common selectors
        debugLog(`    🔍 Trying comprehensive fallback selectors...`);
        const fallbackSelectors = [
            'input[aria-label*="Location"]',
            'input[placeholder*="Location"]',
            'input[aria-labelledby*="Location"]',
            'input[role="combobox"]',
            'input[type="text"]:nth-last-of-type(2)', // Often location is second to last
            'input[type="text"]:nth-last-of-type(1)', // Or the last text input
            'input[aria-autocomplete="list"]', // Location often has autocomplete
        ];

        for (const selector of fallbackSelectors) {
            try {
                debugLog(`    🎯 Trying selector: ${selector}`);
                const locationInput = await page.locator(selector).first();
                if (await locationInput.count() > 0) {
                    // Double-check if this is actually a location field
                    const isLocationField = await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (!el) return false;

                        const ariaLabel = el.getAttribute('aria-label') || '';
                        const placeholder = el.getAttribute('placeholder') || '';
                        const ariaDescribedBy = el.getAttribute('aria-describedby') || '';

                        // Check if various attributes suggest this is location
                        return ariaLabel.toLowerCase().includes('location') ||
                            placeholder.toLowerCase().includes('location') ||
                            ariaDescribedBy.toLowerCase().includes('location');
                    }, selector);

                    if (isLocationField) {
                        debugLog(`    ✅ Found verified location input, clicking first...`);

                        // Use JavaScript click directly to bypass overlay/blocking elements
                        const clickSuccess = await page.evaluate((sel) => {
                            try {
                                const input = document.querySelector(sel);
                                if (input) {
                                    input.focus();
                                    input.click();
                                    return true;
                                }
                                return false;
                            } catch (error) {
                                return false;
                            }
                        }, selector);

                        if (!clickSuccess) {
                            try {
                                await locationInput.click({ force: true, timeout: 5000 });
                            } catch (clickError) {
                                debugLog('    ⚠️ Playwright click failed, continuing anyway...');
                            }
                        }

                        await page.waitForTimeout(300);

                        // CHECK: If location is already filled, skip filling process
                        const existingLocValFallback = await page.evaluate((sel) => {
                            const input = document.querySelector(sel);
                            return input ? input.value : '';
                        }, selector);

                        if (existingLocValFallback && existingLocValFallback.trim() !== '') {
                            userLog(`    ✅ Location already filled (fallback): "${existingLocValFallback}". Skipping fill...`);
                            return true;
                        }

                        // Clear existing value using select then Backspace
                        debugLog('    🧹 Clearing existing location value...');
                        await page.evaluate((sel) => {
                            const input = document.querySelector(sel);
                            if (input) {
                                input.focus();
                                input.select(); // Select all text
                            }
                        }, selector);
                        await page.waitForTimeout(200);
                        await page.keyboard.press('Backspace'); // Delete selected text
                        await page.waitForTimeout(200);

                        // Type the location using SLOW humanType function
                        await humanTypeSlow(page, locationInput, location);

                        // Verify typing worked
                        const currentValue3 = await page.evaluate((sel) => {
                            const input = document.querySelector(sel);
                            return input ? input.value : '';
                        }, selector);
                        userLog(`    ✅ Location input value after typing: "${currentValue3}"`);

                        // Wait for dropdown to appear
                        debugLog('    ⏳ Waiting for location dropdown to appear...');
                        await page.waitForTimeout(3000);

                        // Use the new robust function to click first dropdown option
                        const dropdownClicked3 = await waitForAndClickFirstLocationOption(page, 12000);

                        if (dropdownClicked3) {
                            debugLog(`    ✅ Location selected from dropdown with verified selector: ${selector}`);
                            await page.waitForTimeout(1500);
                            return true;
                        }

                        // Fallback: press Enter if dropdown click failed
                        debugLog('    🔄 All dropdown methods failed, pressing Enter as fallback...');
                        await page.keyboard.press('Enter');
                        debugLog(`    ✅ Location typed and Enter pressed with verified selector (fallback): ${selector}`);
                        await page.waitForTimeout(1000);
                        return true;
                    } else {
                        debugLog(`    ⚠️ Selector ${selector} found but not location field, skipping`);
                    }
                }
            } catch (error) {
                debugLog(`    ❌ Selector ${selector} failed: ${error.message}`);
                continue;
            }
        }

        // Method 4: Last resort - find any combobox input that might be location
        debugLog(`    🚨 LAST RESORT: Finding any combobox input...`);

        const comboboxes = await page.locator('input[role="combobox"]').all();
        if (comboboxes.length >= 2) { // If there are multiple comboboxes, location is often the last one
            const lastCombobox = comboboxes[comboboxes.length - 1];

            debugLog(`    🎯 Found last combobox as location input, clicking first...`);

            // Use JavaScript click directly to bypass overlay/blocking elements
            const clickSuccess = await page.evaluate(() => {
                try {
                    const inputs = document.querySelectorAll('input[role="combobox"]');
                    const lastInput = inputs[inputs.length - 1];
                    if (lastInput) {
                        lastInput.focus();
                        lastInput.click();
                        return true;
                    }
                    return false;
                } catch (error) {
                    return false;
                }
            });

            if (!clickSuccess) {
                try {
                    await lastCombobox.click({ force: true, timeout: 5000 });
                } catch (clickError) {
                    debugLog('    ⚠️ Playwright click failed, continuing anyway...');
                }
            }

            await page.waitForTimeout(300);

            // CHECK: If location is already filled, skip filling process
            const existingLocValLast = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[role="combobox"]');
                const lastInput = inputs[inputs.length - 1];
                return lastInput ? lastInput.value : '';
            });

            if (existingLocValLast && existingLocValLast.trim() !== '') {
                userLog(`    ✅ Location already filled (last resort): "${existingLocValLast}". Skipping fill...`);
                return true;
            }

            // Clear existing value using select then Backspace
            debugLog('    🧹 Clearing existing location value...');
            await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[role="combobox"]');
                const lastInput = inputs[inputs.length - 1];
                if (lastInput) {
                    lastInput.focus();
                    lastInput.select(); // Select all text
                }
            });
            await page.waitForTimeout(200);
            await page.keyboard.press('Backspace'); // Delete selected text
            await page.waitForTimeout(200);

            // Type the location using SLOW humanType function
            await humanTypeSlow(page, lastCombobox, location);

            // Verify typing worked
            const currentValue4 = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[role="combobox"]');
                const lastInput = inputs[inputs.length - 1];
                return lastInput ? lastInput.value : '';
            });
            userLog(`    ✅ Location input value after typing: "${currentValue4}"`);

            // Wait for dropdown to appear
            debugLog('    ⏳ Waiting for location dropdown to appear...');
            await page.waitForTimeout(3000);

            // Use the new robust function to click first dropdown option
            const dropdownClicked4 = await waitForAndClickFirstLocationOption(page, 12000);

            if (dropdownClicked4) {
                userLog(`    ✅ Location selected from dropdown with last resort: ${location}`);
                await page.waitForTimeout(1500);
                return true;
            }

            // Fallback: press Enter if dropdown click failed
            debugLog('    🔄 All dropdown methods failed, pressing Enter as fallback...');
            await page.keyboard.press('Enter');
            debugLog(`    ✅ Location typed and Enter pressed with last resort (fallback): ${location}`);
            await page.waitForTimeout(1000);
            return true;
        }

        debugLog('    ❌ CRITICAL: All location selector methods failed!');
        return false;

    } catch (error) {
        console.error(`❌ Location fill error: ${error.message}`);
        return false;
    }
}

async function fillDescription(page, description) {
    debugLog(`    📝 Looking for description field...`);

    try {

        // Method 1: Try Playwright locators
        const descriptionSelectors = [
            'textarea[aria-label*="Description"]',
            'textarea[placeholder*="Description"]',
            'textarea[aria-labelledby*="Description"]',
            'textarea'
        ];

        for (const selector of descriptionSelectors) {
            try {
                debugLog(`    🎯 Trying description selector: ${selector}`);
                const descriptionTextarea = await page.locator(selector).first();
                if (await descriptionTextarea.count() > 0) {
                    debugLog(`    🎯 Found description textarea, clicking first...`);

                    // Scroll into view before filling
                    await descriptionTextarea.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);

                    // Click the textarea first to focus it (like human behavior)
                    await descriptionTextarea.click({ delay: 200 });
                    await page.waitForTimeout(300);

                    // Clear the textarea
                    await descriptionTextarea.fill('');

                    // Type the description using humanType function
                    await humanType(page, descriptionTextarea, description);

                    debugLog(`    ✅ Description typed with selector ${selector} (${description.length} chars)`);
                    return true;
                }
            } catch (error) {
                debugLog(`    ❌ Selector ${selector} failed: ${error.message}`);
                continue;
            }
        }

        // Method 2: JavaScript evaluation with label association
        debugLog(`    🏷️ Trying label association method...`);

        // Find labels containing "Description" and get associated textarea
        const descriptionElement = await page.evaluate(() => {
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
                const text = label.textContent || '';
                if (text.toLowerCase().includes('description')) {
                    const textarea = label.querySelector('textarea') ||
                        label.nextElementSibling?.querySelector('textarea') ||
                        label.parentElement?.querySelector('textarea');
                    if (textarea) {
                        return {
                            selector: 'textarea[aria-label="' + textarea.getAttribute('aria-label') + '"]',
                            found: true
                        };
                    }
                }
            }
            return { found: false };
        });

        if (descriptionElement.found) {
            const descriptionTextareaLabel = await page.locator(descriptionElement.selector).first();

            if (await descriptionTextareaLabel.count() > 0) {
                debugLog(`    🎯 Found description textarea by label association, clicking first...`);

                // Scroll into view before filling
                await descriptionTextareaLabel.scrollIntoViewIfNeeded();
                await page.waitForTimeout(500);

                // Click the textarea first to focus it (like human behavior)
                await descriptionTextareaLabel.click({ delay: 200 });
                await page.waitForTimeout(300);

                // Clear the textarea
                await descriptionTextareaLabel.fill('');

                // Type the description using humanType function
                await humanType(page, descriptionTextareaLabel, description);

                userLog(`    ✅ Description typed by label association (${description.length} chars)`);
                return true;
            }
        }

        // Method 3: Direct JavaScript fallback
        userLog(`    🔄 Trying direct JavaScript method...`);

        // Find description textarea via JavaScript (simplified)
        const descriptionTextarea = await page.evaluate(() => {
            const textareas = document.querySelectorAll('textarea');

            for (const textarea of textareas) {
                const label = textarea.getAttribute('aria-label') || '';
                const placeholder = textarea.getAttribute('placeholder') || '';
                const id = textarea.getAttribute('id') || '';

                if (label.toLowerCase().includes('description') ||
                    placeholder.toLowerCase().includes('description') ||
                    id.toLowerCase().includes('description')) {

                    return {
                        selector: 'textarea[aria-label="' + label + '"]',
                        found: true
                    };
                }
            }

            // Last resort: use the first available textarea
            if (textareas.length > 0) {
                return {
                    selector: 'textarea',
                    found: true,
                    isLastResort: true
                };
            }

            return { found: false };
        });

        if (descriptionTextarea.found) {
            const textareaLocator = await page.locator(descriptionTextarea.selector).first();

            if (await textareaLocator.count() > 0) {
                if (descriptionTextarea.isLastResort) {
                    debugLog(`    🚨 Using last resort textarea, clicking first...`);
                } else {
                    debugLog(`    🎯 Found description textarea via JavaScript, clicking first...`);
                }

                // Scroll into view before filling
                await textareaLocator.scrollIntoViewIfNeeded();
                await page.waitForTimeout(500);

                // Click the textarea first to focus it (like human behavior)
                await textareaLocator.click({ delay: 200 });
                await page.waitForTimeout(300);

                // Clear the textarea
                await textareaLocator.fill('');

                // Type the description using humanType function
                await humanType(page, textareaLocator, description);

                userLog(`    ✅ Description typed via JavaScript (${description.length} chars)`);
                return true;
            }
        }

        debugLog('    ❌ CRITICAL: All description selector methods failed');
        return false;

    } catch (error) {
        console.error(`❌ Description fill error: ${error.message}`);
        return false;
    }
}


async function clickNextButton(page, location = '') {
    debugLog('🔍 Looking for Next button...');

    try {
        // Initial wait for form to settle
        await page.waitForTimeout(3000);

        // ===== REDUNDANT LOCATION CHECK =====
        // Check if location is still filled before clicking Next
        if (location) {
            debugLog(`📍 Redundant check: Verifying location "${location}" is still present...`);
            const currentLocValue = await page.evaluate(() => {
                const input = document.querySelector('input[aria-label="Location"][role="combobox"]') ||
                    document.querySelector('input[placeholder*="Location"]') ||
                    document.querySelector('input[role="combobox"]');
                return input ? input.value : '';
            });

            if (!currentLocValue || currentLocValue.trim() === '') {
                userLog(`⚠️ WARNING: Location field is EMPTY before clicking Next! Re-filling...`);
                const refilled = await fillLocation(page, location);
                if (refilled) {
                    userLog(`✅ Location successfully re-filled before Next click.`);
                    await page.waitForTimeout(2000);
                } else {
                    userLog(`❌ CRITICAL: Failed to re-fill empty location before Next click.`);
                }
            } else {
                debugLog(`✅ Location verification passed: "${currentLocValue}"`);
            }
        } else {
            debugLog('ℹ️ No location provided for redundant check, skipping verification...');
        }

        // Define multiple possible selectors for the Next button
        const nextSelectors = [
            '[aria-label="Next"][role="button"]',
            '[aria-label="Selanjutnya"][role="button"]', // Indonesian fallback
            'div[role="button"]:has-text("Next")',
            'div[role="button"]:has-text("Selanjutnya")',
            'span:has-text("Next")',
            'span:has-text("Selanjutnya")',
            'div[aria-label="Lanjutkan"][role="button"]'
        ];

        let nextButtonClicked = false;
        let isButtonDisabled = false;

        for (const selector of nextSelectors) {
            debugLog(`🎯 Trying Next button selector: ${selector}`);

            const buttonInfo = await page.evaluate((sel) => {
                let button = null;
                if (sel.includes(':has-text')) {
                    const text = sel.match(/"([^"]+)"/)[1];
                    const elements = document.querySelectorAll('div[role="button"], span, div');
                    for (const el of elements) {
                        if (el.textContent.trim() === text) {
                            button = el.closest('[role="button"]') || el;
                            break;
                        }
                    }
                } else {
                    button = document.querySelector(sel);
                }

                if (button) {
                    const disabled = button.getAttribute('aria-disabled') === 'true' ||
                        button.hasAttribute('disabled') ||
                        button.className.includes('disabled');
                    const hidden = button.getAttribute('aria-hidden') === 'true' ||
                        window.getComputedStyle(button).display === 'none' ||
                        window.getComputedStyle(button).visibility === 'hidden';

                    if (hidden) return { exists: true, hidden: true };
                    if (disabled) return { exists: true, disabled: true };

                    // Scroll to button
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return { exists: true, clickable: true, selector: sel };
                }
                return { exists: false };
            }, selector);

            if (buttonInfo.exists && buttonInfo.clickable) {
                debugLog(`🖱️ Found clickable Next button with selector: ${selector}`);
                await page.click(buttonInfo.selector, { force: true });
                nextButtonClicked = true;
                break;
            } else if (buttonInfo.exists && buttonInfo.disabled) {
                debugLog(`⚠️ Found Next button but it is DISABLED (form may be incomplete)`);
                isButtonDisabled = true;
            }
        }

        // If button is disabled or not found, try to "wake up" the form by re-clicking the location
        if (!nextButtonClicked) {
            userLog('⚠️ Next button not found or disabled. Attempting to repair form state (re-triggering location)...');

            // Re-trigger location to ensure Facebook registers it
            await page.evaluate(() => {
                const locInput = document.querySelector('input[aria-label="Location"][role="combobox"]') ||
                    document.querySelector('input[placeholder*="Location"]') ||
                    document.querySelector('input[role="combobox"]');
                if (locInput) {
                    locInput.focus();
                    locInput.click();
                    // Just clicking/focusing might be enough to trigger state update
                }
                window.scrollTo(0, 0); // Scroll up to find any hidden error messages
            });

            await page.waitForTimeout(2000);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // Scroll back down
            await page.waitForTimeout(2000);

            // One last attempt to find and click the button
            const finalAttempt = await page.evaluate(() => {
                const btn = document.querySelector('[aria-label="Next"][role="button"]') ||
                    document.querySelector('div[role="button"]:has(span:contains("Next"))');
                if (btn && btn.getAttribute('aria-disabled') !== 'true') {
                    btn.click();
                    return true;
                }
                return false;
            });

            if (finalAttempt) {
                debugLog('✅ Next button clicked successfully on final attempt after form repair');
                nextButtonClicked = true;
            }
        }

        if (nextButtonClicked) {
            // Wait for navigation/page change
            await page.waitForTimeout(3000);

            // Verify we moved to next step
            const url = await page.url();
            if (url.includes('next') || url.includes('publish') || !url.includes('create')) {
                debugLog('✅ Successfully moved to next step/step 2');
                return true;
            } else {
                // Check if we can see the "Publish" button already
                const hasPublish = await page.locator('span:has-text("Publish")').count() > 0;
                if (hasPublish) {
                    debugLog('✅ Moved to publish step (detected via element)');
                    return true;
                }
                debugLog('⚠️ URL did not change, but button was clicked');
                return true;
            }
        }

        return false;

    } catch (error) {
        console.error(`❌ Error clicking Next button: ${error.message}`);
        return false;
    }
}

async function clickPublishButton(page) {
    debugLog('🔍 Looking for Publish button...');

    try {
        // Initial wait for page to reach last step
        await page.waitForTimeout(5000);

        const publishSelectors = [
            '[aria-label="Publish"][role="button"]',
            '[aria-label="Terbitkan"][role="button"]', // Indonesian
            '[aria-label="Publikasikan"][role="button"]', // Indonesian
            'div[role="button"]:has-text("Publish")',
            'div[role="button"]:has-text("Terbitkan")',
            'div[role="button"]:has-text("Publikasikan")',
            'span:has-text("Publish")',
            'span:has-text("Terbitkan")'
        ];

        let published = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!published && retryCount < maxRetries) {
            for (const selector of publishSelectors) {
                debugLog(`🎯 [Attempt ${retryCount + 1}] Trying Publish button selector: ${selector}`);

                const buttonInfo = await page.evaluate((sel) => {
                    let button = null;
                    if (sel.includes(':has-text')) {
                        const text = sel.match(/"([^"]+)"/)[1];
                        const elements = document.querySelectorAll('div[role="button"], span');
                        for (const el of elements) {
                            if (el.textContent.trim() === text) {
                                button = el.closest('[role="button"]') || el;
                                break;
                            }
                        }
                    } else {
                        button = document.querySelector(sel);
                    }

                    if (button) {
                        const disabled = button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('disabled');
                        const hidden = window.getComputedStyle(button).display === 'none';

                        if (hidden) return { exists: true, hidden: true };
                        if (disabled) return { exists: true, disabled: true };

                        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        return { exists: true, clickable: true, selector: sel };
                    }
                    return { exists: false };
                }, selector);

                if (buttonInfo.exists && buttonInfo.clickable) {
                    debugLog(`🖱️ Found clickable Publish button: ${selector}`);
                    await page.click(buttonInfo.selector, { force: true });
                    published = true;
                    break;
                } else if (buttonInfo.exists && buttonInfo.disabled) {
                    debugLog(`⚠️ Found Publish button but it is DISABLED.`);
                }
            }

            if (!published) {
                retryCount++;
                if (retryCount < maxRetries) {
                    debugLog(`⏳ Publish button not found/clickable, waiting 3s before retry ${retryCount}...`);
                    await page.waitForTimeout(3000);
                }
            }
        }

        if (published) {
            userLog('✅ Publish button clicked successfully!');
            await page.waitForTimeout(5000); // Wait for publishing process
            return true;
        }

        return false;
    } catch (error) {
        console.error(`❌ Error clicking Publish button: ${error.message}`);
        return false;
    }
}



// ========== FUNGSI VERIFIKASI STATUS MARKETPLACE ==========
// DEPRECATED: Verifikasi tidak lagi digunakan - success ditentukan dari klik publish button
// Verifikasi apakah produk benar-benar muncul di marketplace setelah posting
/*
async function verifyMarketplaceProduct(page, product) {
    debugLog(`🔍 Verifying marketplace product: ${product.name}`);

    try {
        // Tunggu beberapa detik untuk memastikan produk diproses
        await page.waitForTimeout(5000);

        // Navigasi ke marketplace home untuk melihat produk terbaru
        debugLog(`🏠 Navigating to marketplace home for verification...`);
        await page.goto('https://www.facebook.com/marketplace/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Tunggu marketplace load
        await page.waitForTimeout(5000);

        // Scroll sedikit untuk load produk
        await page.evaluate(() => {
            window.scrollTo(0, 500);
        });
        await page.waitForTimeout(3000);

        // Cari produk yang baru saja di-post
        const productFound = await page.evaluate((productData) => {
            // [browser] debugLog(`🔍 Looking for product: "${productData.name}" (${productData.price})`);

            // Cari semua item produk di marketplace
            const products = document.querySelectorAll('[data-pagelet*="Marketplace"], [role="article"], a[href*="/marketplace/item/"]');

            // [browser] debugLog(`📊 Found ${products.length} product elements in marketplace`);

            for (let i = 0; i < Math.min(products.length, 20); i++) { // Cek 20 produk teratas
                const productEl = products[i];

                try {
                    // Cari teks produk
                    const productText = productEl.textContent || '';
                    const productTextLower = productText.toLowerCase();
                    const productNameLower = productData.name.toLowerCase();

                    // Cek nama produk (minimal 70% match)
                    const nameWords = productNameLower.split(' ');
                    let nameMatchCount = 0;

                    for (const word of nameWords) {
                        if (word.length > 2 && productTextLower.includes(word)) {
                            nameMatchCount++;
                        }
                    }

                    const nameMatchPercentage = nameWords.length > 0 ? (nameMatchCount / nameWords.length) * 100 : 0;

                    // Cek harga (dengan toleransi)
                    const priceFound = productText.includes(productData.price.toString()) ||
                                     productText.includes(productData.price.toLocaleString('id-ID'));

                    // [browser] debugLog(`🛒 Product ${i + 1}: Name match ${nameMatchCount}/${nameWords.length} (${nameMatchPercentage.toFixed(1)}%), Price: ${priceFound}`);

                    if (nameMatchPercentage >= 70 && priceFound) {
                        // [browser] debugLog(`✅ Product found with name and price match`);
                        return true;
                    }

                    // Alternatif: Jika nama singkat tapi harga match
                    if (nameMatchPercentage >= 50 && priceFound && productData.name.length < 20) {
                        // [browser] debugLog(`✅ Product found with price match and reasonable name similarity`);
                        return true;
                    }

                } catch (e) {
                    // [browser] debugLog(`⚠️ Error checking product ${i + 1}:`, e.message);
                }
            }

            // [browser] debugLog(`❌ No matching product found in recent marketplace listings`);
            return false;

        }, product);

        if (productFound) {
            userLog(`✅ VERIFICATION SUCCESS: Product confirmed in marketplace`);
            return true;
        } else {
            debugLog(`❌ VERIFICATION FAILED: Product not found in marketplace`);
            return false;
        }

    } catch (error) {
        console.error(`❌ Error during marketplace product verification: ${error.message}`);
        return false;
    }
}
*/

// Jalankan script
if (require.main === module) {
    // Ensure stdin is flowing to receive data from parent process
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    runFacebookMarketplacePoster();
}