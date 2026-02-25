// ===== STARTUP DIAGNOSTICS =====
console.log('🚀 [STARTUP] facebook-auto-join-group.js loading...');
console.log(`🚀 [STARTUP] Node version: ${process.version}`);
console.log(`🚀 [STARTUP] Platform: ${process.platform}`);
console.log(`🚀 [STARTUP] __dirname: ${__dirname}`);
console.log(`🚀 [STARTUP] PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'not set'}`);
console.log(`🚀 [STARTUP] ACCOUNT_ID: ${process.env.ACCOUNT_ID || 'not set'}`);

let chromium;
try {
    console.log('🚀 [STARTUP] Loading playwright...');
    const playwright = require('playwright');
    chromium = playwright.chromium;
    console.log('🚀 [STARTUP] Playwright loaded successfully!');
} catch (error) {
    console.error('❌ [STARTUP] Failed to load playwright:', error.message);
    console.error('❌ [STARTUP] Full error:', error);
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== DEBUG MODE - Set to true to see internal debug logs =====
const DEBUG_MODE = true;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => { };

// ===== USER LOG - Always shown to user in UI =====
const userLog = (message) => console.log(message);

// ===== SPIN TEXT FUNCTION =====
function spinText(text) {
    if (!text || typeof text !== 'string') return text;
    const spinPattern = /\{\{([^}]+)\}\}/g;
    return text.replace(spinPattern, (match, options) => {
        const optionList = options.split('|').map(opt => opt.trim());
        const validOptions = optionList.filter(opt => opt.length > 0);
        if (validOptions.length === 0) return match;
        const timestamp = Date.now();
        const hrtime = process.hrtime.bigint().toString(10);
        const randomSource = (timestamp + parseInt(hrtime.slice(-8)) + Math.random() * 1000000) % 1000000;
        const randomIndex = Math.floor(randomSource % validOptions.length);
        debugLog(`🎲 [SPIN] Options: ${validOptions.length}, Index: ${randomIndex}, Selected: "${validOptions[randomIndex]}"`);
        return validOptions[randomIndex];
    });
}

debugLog(`🔧 Node version: ${process.version}`);
debugLog(`📂 Current directory: ${__dirname}`);

// ===== BROWSER EXECUTABLE PATH =====
async function getBrowserExecutablePath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    userLog(`🔍 [BROWSER] Searching for Playwright Chromium browser...`);
    debugLog(`🔍 getBrowserExecutablePath() called`);
    debugLog(`🔍 PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'not set'}`);
    userLog(`🔍 [BROWSER] PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'not set'}`);

    const findChromiumExecutable = (browsersPath) => {
        if (!fs.existsSync(browsersPath)) {
            debugLog(`🔍 Path not found: ${browsersPath}`);
            return null;
        }
        try {
            const files = fs.readdirSync(browsersPath);
            const chromiumFolders = files
                .filter(f => f.startsWith('chromium-') && !f.includes('headless'))
                .sort((a, b) => {
                    const vA = parseInt(a.replace('chromium-', '')) || 0;
                    const vB = parseInt(b.replace('chromium-', '')) || 0;
                    return vB - vA;
                });
            debugLog(`🔍 Found chromium folders: ${chromiumFolders.join(', ') || 'none'}`);
            for (const chromiumFolder of chromiumFolders) {
                let execPath;
                if (isWindows) {
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
                if (fs.existsSync(execPath)) return execPath;
            }
        } catch (e) {
            debugLog(`⚠️ Error reading path ${browsersPath}: ${e.message}`);
        }
        return null;
    };

    // PRIORITY 1: Custom path
    const customBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (customBrowsersPath && customBrowsersPath !== '0') {
        debugLog(`🔍 [PRIORITY 1] Checking custom browsers path: ${customBrowsersPath}`);
        const execPath = findChromiumExecutable(customBrowsersPath);
        if (execPath) {
            userLog(`✅ [BROWSER] Found browser at custom path: ${execPath}`);
            return execPath;
        }
    }

    // PRIORITY 2: Global ms-playwright path
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

    // PRIORITY 3: Playwright built-in
    try {
        debugLog(`🔍 [PRIORITY 3] Trying Playwright's built-in detection...`);
        const executablePath = chromium.executablePath();
        debugLog(`🔍 Playwright reports executable at: ${executablePath}`);
        userLog(`🔍 [BROWSER] Playwright executable check: ${executablePath}`);
        if (executablePath && fs.existsSync(executablePath)) {
            userLog(`✅ [BROWSER] Found Playwright browser: ${executablePath}`);
            return executablePath;
        } else {
            userLog(`⚠️ [BROWSER] Playwright executable not found at: ${executablePath}`);
        }
    } catch (error) {
        debugLog(`⚠️ Playwright detection failed: ${error.message}`);
        userLog(`⚠️ [BROWSER] Playwright detection error: ${error.message}`);
    }

    // PRIORITY 4: Local paths
    const localPaths = [
        path.join(__dirname, 'node_modules', 'playwright-core', '.local-browsers'),
        path.join(__dirname, 'node_modules', 'playwright', '.local-browsers')
    ];
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

    userLog(`⚠️ [BROWSER] No browser found in any location! Browser will need to be installed.`);
    userLog(`⚠️ [BROWSER] Checked paths: ${globalMsPlaywrightPath}, ${localPaths.join(', ')}`);
    debugLog(`⚠️ No browser found in any location, Playwright will try default detection`);
    return undefined;
}

// ===== ENVIRONMENT VARIABLES =====
const ACCOUNT_SESSION_DIR = process.env.ACCOUNT_SESSION_DIR || path.join(__dirname, 'sessions');
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || 'Default Account';

debugLog(`👤 Account: ${ACCOUNT_NAME} (${ACCOUNT_ID})`);
debugLog(`📁 Session: ${ACCOUNT_SESSION_DIR}`);

// ===== GLOBAL FLAGS =====
let isProcessRunning = false;
let isCancelled = false;

// ===== CLEANUP CHROME LOCKS =====
async function cleanupChromeLocks(userDataDir) {
    debugLog(`🔒 [${ACCOUNT_ID}] Checking Chrome locks in: ${userDataDir}`);
    if (!fs.existsSync(userDataDir)) {
        debugLog(`✅ [${ACCOUNT_ID}] No lock files found (directory doesn't exist)`);
        return;
    }
    const lockFiles = [
        'lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket',
        'SingletonTracker', 'chrome.lock', 'user-data-dir.lock'
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

// ===== SMART SCROLL WITH DUAL STOP INDICATORS =====
/**
 * SMART SCROLL - DUAL STOP INDICATORS
 * 
 * INDICATOR #1: Target jumlah grup tercapai
 * INDICATOR #2: 5x scroll berturut-turut tanpa grup baru
 * 
 * @param {Page} page - Playwright page object
 * @param {number} targetCount - Jumlah grup yang diinginkan user
 * @param {Object} options - Opsi tambahan
 * @returns {Promise<Object>} - Hasil scroll dengan data grup dan statistik
 */
async function smartScrollGroups(page, targetCount, options = {}) {
    const {
        maxScrollsWithoutNew = 5,   // Berhenti jika 5x scroll tanpa grup baru
        scrollDelay = 2000,         // Delay antar scroll
        maxTotalScrolls = 200,      // Batas aman infinite loop
        showProgress = true,        // Tampilkan progress ke UI
    } = options;

    const startTime = Date.now();
    
    debugLog(`\n🎯 [${ACCOUNT_ID}] ========== SMART SCROLL START ==========`);
    debugLog(`🎯 [${ACCOUNT_ID}] Target grup: ${targetCount}`);
    debugLog(`🛑 [${ACCOUNT_ID}] Stop condition #1: Target tercapai (${targetCount} grup)`);
    debugLog(`🛑 [${ACCOUNT_ID}] Stop condition #2: ${maxScrollsWithoutNew}x scroll tanpa grup baru`);
    debugLog(`📊 [${ACCOUNT_ID}] Max scroll aman: ${maxTotalScrolls}x`);
    debugLog(`==========================================\n`);

    // Variables untuk tracking
    let scrollsWithoutNewLinks = 0;
    let totalScrolls = 0;
    let totalGroupsFound = 0;
    
    // Set untuk menyimpan ID grup unik
    const foundGroupIds = new Set();
    
    // Object untuk menyimpan semua data grup
    const allGroups = {};
    
    // Flag untuk indikator berhenti
    let stopReason = '';
    let stopTimestamp = null;

    // Validasi target
    if (!targetCount || targetCount <= 0) {
        userLog(`⚠️ [${ACCOUNT_ID}] Target count tidak valid (${targetCount}), menggunakan default 20`);
        targetCount = 20;
    }

    // Progress reporting ke UI
    const reportProgress = () => {
        if (showProgress) {
            const percentage = Math.min(100, Math.round((totalGroupsFound / targetCount) * 100));
            const progressMessage = `📊 SCROLL:${totalScrolls}|GRUP:${totalGroupsFound}/${targetCount}|${percentage}%|TANPA_BARU:${scrollsWithoutNewLinks}/${maxScrollsWithoutNew}`;
            
            userLog(`📊 [${ACCOUNT_ID}] ${progressMessage}`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:progress:SCROLL_PROGRESS:${totalGroupsFound}:${targetCount}:${percentage}:${scrollsWithoutNewLinks}\n`);
        }
    };

    // ===== MAIN SCROLL LOOP =====
    while (totalScrolls < maxTotalScrolls) {
        totalScrolls++;
        
        // STEP 1: SCROLL KE BAWAH
        debugLog(`🔄 [${ACCOUNT_ID}] Scroll #${totalScrolls} - Sedang scroll ke bawah...`);
        
        try {
            await page.evaluate(() => {
                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'smooth'
                });
            });
        } catch (scrollError) {
            debugLog(`⚠️ [${ACCOUNT_ID}] Error saat scroll: ${scrollError.message}`);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        
        await page.waitForTimeout(scrollDelay);
        
        // Double scroll technique untuk trigger loading
        if (totalScrolls % 3 === 0) {
            debugLog(`🔄 [${ACCOUNT_ID}] Double scroll technique #${totalScrolls}`);
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight - 500);
                setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
            });
            await page.waitForTimeout(500);
        }
        
        // STEP 2: EKSTRAK GRUP DARI HALAMAN
        debugLog(`🔍 [${ACCOUNT_ID}] Mengekstrak grup dari halaman...`);
        
        const groupsData = await page.evaluate(() => {
            const groups = {};
            const now = Date.now();
            
            // Cari SEMUA link yang mengandung /groups/
            const allLinks = document.querySelectorAll('a[href*="/groups/"]');
            
            allLinks.forEach(link => {
                try {
                    const href = link.getAttribute('href');
                    if (!href) return;
                    
                    const cleanHref = href.split('?')[0].split('#')[0];
                    const match = cleanHref.match(/\/groups\/([^/]+)/);
                    if (!match) return;
                    
                    const groupId = match[1];
                    if (groups[groupId]) return;
                    
                    let groupName = '';
                    if (link.textContent && link.textContent.trim().length > 2) {
                        groupName = link.textContent.trim();
                    } else {
                        const possibleName = link.querySelector('span, div, strong');
                        if (possibleName && possibleName.textContent) {
                            groupName = possibleName.textContent.trim();
                        }
                    }
                    
                    if (groupName && 
                        groupName.length > 2 && 
                        !groupName.includes('Facebook') &&
                        !groupName.includes('Groups') &&
                        !groupName.includes('Join') &&
                        !groupName.includes('Members')) {
                        
                        let cleanName = groupName
                            .replace(/Public·/gi, '')
                            .replace(/Public group/gi, '')
                            .replace(/Public/gi, '')
                            .replace(/Publik/gi, '')
                            .replace(/Grup Publik/gi, '')
                            .replace(/Grup publik/gi, '')
                            .replace(/Join group/gi, '')
                            .replace(/Joined/gi, '')
                            .replace(/Members?/gi, '')
                            .replace(/\d+\.?\d*[KkMm]?\s*(members?|Members)?/gi, '')
                            .replace(/·/g, '')
                            .trim();
                        
                        if (cleanName.length > 2) {
                            groups[groupId] = {
                                id: groupId,
                                name: cleanName,
                                url: cleanHref.startsWith('http') ? cleanHref : `https://www.facebook.com${cleanHref}`,
                                discoveredAt: now
                            };
                        }
                    }
                } catch (e) {
                    // Skip link yang error
                }
            });
            
            return {
                count: Object.keys(groups).length,
                groups: groups,
                timestamp: now
            };
        });
        
        // STEP 3: UPDATE TOTAL GRUP
        let newGroupsCount = 0;
        Object.entries(groupsData.groups).forEach(([id, groupData]) => {
            if (!foundGroupIds.has(id)) {
                foundGroupIds.add(id);
                allGroups[id] = groupData;
                newGroupsCount++;
            }
        });
        
        totalGroupsFound = foundGroupIds.size;
        
        // STEP 4: LOG STATUS
        debugLog(`📊 [${ACCOUNT_ID}] Scroll #${totalScrolls}:`);
        debugLog(`   - Grup baru ditemukan: +${newGroupsCount} grup`);
        debugLog(`   - Total grup terkumpul: ${totalGroupsFound}/${targetCount}`);
        debugLog(`   - Scroll tanpa baru: ${scrollsWithoutNewLinks + 1}/${maxScrollsWithoutNew}`);
        
        reportProgress();
        
        // ===== INDICATOR #1: CEK APAKAH TARGET TERCAPAI =====
        if (totalGroupsFound >= targetCount) {
            stopReason = 'TARGET_TERCAPAI';
            stopTimestamp = Date.now();
            
            userLog(`\n✅ [${ACCOUNT_ID}] ======== TARGET TERCAPAI! ========`);
            userLog(`✅ [${ACCOUNT_ID}] Berhasil mengumpulkan ${totalGroupsFound} dari ${targetCount} grup`);
            userLog(`🛑 [${ACCOUNT_ID}] Indikator #1: Target tercapai`);
            userLog(`⏱️  [${ACCOUNT_ID}] Total scroll: ${totalScrolls}x`);
            userLog(`========================================\n`);
            
            process.stdout.write(`LOG:${ACCOUNT_ID}:success:SCROLL_COMPLETED:target_reached:${totalGroupsFound}:${targetCount}\n`);
            break;
        }
        
        // STEP 5: CEK APAKAH ADA GRUP BARU
        if (newGroupsCount > 0) {
            // ADA GRUP BARU! Reset counter scroll tanpa baru
            debugLog(`✨ [${ACCOUNT_ID}] Mendapatkan ${newGroupsCount} grup baru! Reset counter`);
            scrollsWithoutNewLinks = 0;
        } else {
            // TIDAK ADA GRUP BARU
            scrollsWithoutNewLinks++;
            
            debugLog(`⚠️ [${ACCOUNT_ID}] Scroll #${totalScrolls}: TIDAK ADA GRUP BARU`);
            debugLog(`   - Counter: ${scrollsWithoutNewLinks}/${maxScrollsWithoutNew}`);
            
            // ===== INDICATOR #2: CEK APAKAH SUDAH 5x SCROLL TANPA GRUP BARU =====
            if (scrollsWithoutNewLinks >= maxScrollsWithoutNew) {
                stopReason = 'MAX_SCROLL_WITHOUT_NEW';
                stopTimestamp = Date.now();
                
                userLog(`\n🛑 [${ACCOUNT_ID}] ======== BERHENTI: TIDAK ADA GRUP BARU ========`);
                userLog(`🛑 [${ACCOUNT_ID}] ${maxScrollsWithoutNew}x scroll berturut-turut tanpa grup baru`);
                userLog(`🛑 [${ACCOUNT_ID}] Indikator #2: Tidak ada grup baru`);
                userLog(`📊 [${ACCOUNT_ID}] Total grup terkumpul: ${totalGroupsFound} dari ${targetCount} target`);
                userLog(`⏱️  [${ACCOUNT_ID}] Total scroll: ${totalScrolls}x`);
                userLog(`================================================\n`);
                
                process.stdout.write(`LOG:${ACCOUNT_ID}:warning:SCROLL_STOPPED:no_new_groups:${totalGroupsFound}:${targetCount}\n`);
                break;
            }
            
            // STRATEGI KHUSUS: Jika sudah 3x tanpa baru, coba teknik deep scroll
            if (scrollsWithoutNewLinks === 3) {
                debugLog(`🔍 [${ACCOUNT_ID}] Mencoba teknik deep scroll...`);
                
                // Teknik 1: Scroll naik sedikit lalu turun
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight - 800);
                    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 200);
                });
                await page.waitForTimeout(1000);
                
                // Teknik 2: Klik "See More" jika ada
                await page.evaluate(() => {
                    const seeMoreButtons = Array.from(document.querySelectorAll('div[role="button"]'))
                        .filter(el => el.textContent?.includes('See more') || el.textContent?.includes('Lihat selengkapnya'));
                    seeMoreButtons.forEach(btn => btn.click());
                });
                await page.waitForTimeout(1500);
            }
            
            // Jika sudah 4x tanpa baru, coba aggressive scroll
            if (scrollsWithoutNewLinks === 4) {
                debugLog(`🚀 [${ACCOUNT_ID}] Mencoba aggressive scroll...`);
                for (let i = 0; i < 3; i++) {
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await page.waitForTimeout(500);
                }
            }
        }
        
        // SAFETY CHECK: Jika sudah scroll 30x tapi masih 0 grup
        if (totalScrolls >= 30 && totalGroupsFound === 0) {
            stopReason = 'NO_GROUPS_FOUND';
            stopTimestamp = Date.now();
            
            userLog(`❌ [${ACCOUNT_ID}] ======== TIDAK ADA GRUP DITEMUKAN ========`);
            userLog(`❌ [${ACCOUNT_ID}] Setelah ${totalScrolls}x scroll, tidak ada grup yang ditemukan`);
            userLog(`❌ [${ACCOUNT_ID}] Mungkin: kata kunci tidak valid atau halaman error`);
            userLog(`================================================\n`);
            
            process.stdout.write(`LOG:${ACCOUNT_ID}:error:SCROLL_FAILED:no_groups_found\n`);
            break;
        }
        
        // PROGRESS UNTUK TARGET BESAR (1000+)
        if (targetCount >= 1000 && totalScrolls % 10 === 0) {
            const avgGroupsPerScroll = totalGroupsFound / totalScrolls;
            const estimatedRemainingScrolls = Math.ceil((targetCount - totalGroupsFound) / avgGroupsPerScroll);
            const estimatedTimeRemaining = estimatedRemainingScrolls * scrollDelay / 1000;
            
            userLog(`⏳ [${ACCOUNT_ID}] TARGET BESAR: ${totalGroupsFound}/${targetCount} | Scroll: ${totalScrolls}x | Estimasi sisa: ~${Math.round(estimatedTimeRemaining)} detik`);
        }
    }

    // STEP 6: FINAL STATISTICS
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    debugLog(`\n📊 [${ACCOUNT_ID}] ========== SMART SCROLL COMPLETE ==========`);
    debugLog(`📊 [${ACCOUNT_ID}] Stop reason: ${stopReason || 'MAX_SCROLL_LIMIT'}`);
    debugLog(`📊 [${ACCOUNT_ID}] Total grup ditemukan: ${totalGroupsFound}`);
    debugLog(`📊 [${ACCOUNT_ID}] Target grup: ${targetCount}`);
    debugLog(`📊 [${ACCOUNT_ID}] Total scroll: ${totalScrolls}`);
    debugLog(`📊 [${ACCOUNT_ID}] Scroll tanpa baru: ${scrollsWithoutNewLinks}`);
    debugLog(`📊 [${ACCOUNT_ID}] Durasi: ${durationSeconds.toFixed(2)} detik`);
    debugLog(`📊 [${ACCOUNT_ID}] Rata-rata grup/scroll: ${(totalGroupsFound / totalScrolls).toFixed(2)}`);
    debugLog(`================================================\n`);
    
    // Final report ke UI
    userLog(`\n🎯 [${ACCOUNT_ID}] ========== KOLEKSI GRUP SELESAI ==========`);
    userLog(`📦 [${ACCOUNT_ID}] Total grup terkumpul: ${totalGroupsFound}`);
    userLog(`🎯 [${ACCOUNT_ID}] Target awal: ${targetCount}`);
    
    if (totalGroupsFound >= targetCount) {
        userLog(`✅ [${ACCOUNT_ID}] Status: TARGET TERCAPAI (Indikator #1)`);
    } else if (stopReason === 'MAX_SCROLL_WITHOUT_NEW') {
        userLog(`🛑 [${ACCOUNT_ID}] Status: BERHENTI - 5x scroll tanpa grup baru (Indikator #2)`);
    } else if (stopReason === 'NO_GROUPS_FOUND') {
        userLog(`❌ [${ACCOUNT_ID}] Status: TIDAK ADA GRUP DITEMUKAN`);
    } else {
        userLog(`⚠️ [${ACCOUNT_ID}] Status: ${stopReason || 'BERHENTI - Batas maksimum scroll'}`);
    }
    
    userLog(`⏱️  [${ACCOUNT_ID}] Waktu: ${durationSeconds.toFixed(2)} detik`);
    userLog(`==============================================\n`);
    
    // Kirim final result ke parent process
    const result = {
        groups: Object.values(allGroups),
        totalFound: totalGroupsFound,
        targetReached: totalGroupsFound >= targetCount,
        stopReason: stopReason,
        scrollCount: totalScrolls,
        duration: durationSeconds
    };
    
    process.stdout.write(`LOG:${ACCOUNT_ID}:info:SCROLL_FINAL_RESULT:${JSON.stringify(result)}\n`);
    
    return result;
}

// ===== MAIN RUN FUNCTION =====
async function runFacebookAutoJoinGroup() {
    let joinData = '';

    userLog(`🚀 [${ACCOUNT_ID}] Script started, waiting for data from parent process...`);
    userLog(`🚀 [${ACCOUNT_ID}] stdin readable: ${process.stdin.readable}`);
    userLog(`🚀 [${ACCOUNT_ID}] stdin isTTY: ${process.stdin.isTTY}`);

    process.stdin.on('data', (chunk) => {
        const data = chunk.toString();
        userLog(`📥 [${ACCOUNT_ID}] ✅ RECEIVED DATA FROM PARENT PROCESS!`);
        debugLog(`📥 [${ACCOUNT_ID}] Data preview: ${data.substring(0, 200)}...`);
        debugLog(`📥 [${ACCOUNT_ID}] Data length: ${data.length} bytes`);

        try {
            const parsed = JSON.parse(data);

            if (parsed.action === 'login-confirmation') {
                userLog(`✅ [${ACCOUNT_ID}] Login confirmation: ${parsed.confirmed ? 'CONTINUE' : 'CANCEL'}`);
                if (parsed.confirmed) {
                    process.nextTick(async () => {
                        try {
                            if (global.joinData) {
                                await continueAfterLogin(global.joinData);
                            } else {
                                console.error(`❌ [${ACCOUNT_ID}] No joinData found`);
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
                userLog(`⏹️ [${ACCOUNT_ID}] Process cancelled by user`);
                isCancelled = true;
                isProcessRunning = false;
                debugLog(`JOIN_STATUS_UPDATE:cancelled:Proses dibatalkan oleh user`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:JOIN_STATUS_UPDATE:cancelled:Proses dibatalkan oleh user\n`);
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
            } else if (parsed.action === 'bring-browser-to-front') {
                const uniqueTitle = parsed.uniqueTitle || `FBOOM-ACCOUNT-${ACCOUNT_ID}`;
                userLog(`🔄 [${ACCOUNT_ID}] Bringing browser to front...`);
                process.nextTick(async () => {
                    try {
                        if (global.browserInstance) {
                            const pages = global.browserInstance.pages() || [];
                            if (pages.length > 0) {
                                const page = pages[0];
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
                                for (let attempt = 1; attempt <= 3; attempt++) {
                                    try {
                                        userLog(`🔄 [${ACCOUNT_ID}] Attempt ${attempt} to bring browser to front`);
                                        await page.bringToFront();
                                        await page.waitForTimeout(500);
                                        await page.evaluate(() => {
                                            window.focus();
                                            window.scrollTo(0, 0);
                                            if (document.body) document.body.focus();
                                        });
                                        await page.waitForTimeout(300);
                                        userLog(`✅ [${ACCOUNT_ID}] Browser brought to front successfully on attempt ${attempt}`);
                                        break;
                                    } catch (attemptError) {
                                        debugLog(`⚠️ [${ACCOUNT_ID}] Attempt ${attempt} failed: ${attemptError.message}`);
                                        if (attempt === 3) throw attemptError;
                                        await page.waitForTimeout(1000);
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error bringing browser to front: ${error.message}`);
                    }
                });
            } else if (parsed.action === 'facebook-login') {
                userLog(`🔐 [${ACCOUNT_ID}] Facebook Login Mode - Opening browser for login...`);
                process.nextTick(async () => {
                    try {
                        await startLoginMode(parsed.url || 'https://www.facebook.com/login.php');
                    } catch (error) {
                        console.error(`❌ [${ACCOUNT_ID}] Error starting login mode: ${error.message}`);
                        process.exit(1);
                    }
                });
            } else {
                joinData = parsed;
                global.joinData = parsed;

                if (parsed.action === 'collect-join-groups' || parsed.type === 'collect-join-groups') {
                    userLog(`✅ [${ACCOUNT_ID}] Collect join groups data received`);
                    process.nextTick(async () => {
                        try {
                            if (!isProcessRunning) {
                                isProcessRunning = true;
                                await startCollectGroupsProcess(joinData);
                            }
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error starting collect process: ${error.message}`);
                            process.exit(1);
                        }
                    });
                } else if (parsed.groups && parsed.groups.length > 0) {
                    userLog(`✅ [${ACCOUNT_ID}] Join collected groups data received`);
                    process.nextTick(async () => {
                        try {
                            if (!isProcessRunning) {
                                isProcessRunning = true;
                                await startJoinCollectedGroupsProcess(joinData);
                            }
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error starting join collected groups: ${error.message}`);
                            process.exit(1);
                        }
                    });
                } else {
                    userLog(`✅ [${ACCOUNT_ID}] Join data received for auto join group`);
                    process.nextTick(async () => {
                        try {
                            if (!isProcessRunning) {
                                isProcessRunning = true;
                                await startJoinProcess(joinData);
                            }
                        } catch (error) {
                            console.error(`❌ [${ACCOUNT_ID}] Error starting join process: ${error.message}`);
                            process.exit(1);
                        }
                    });
                }
            }
        } catch (error) {
            userLog(`📝 [${ACCOUNT_ID}] Raw input: ${data.substring(0, 100)}`);
        }
    });
}

// ===== FACEBOOK LOGIN MODE =====
async function startLoginMode(loginUrl) {
    userLog(`🔐 [${ACCOUNT_ID}] Starting Facebook Login Mode...`);
    userLog(`🔐 [${ACCOUNT_ID}] Login URL: ${loginUrl}`);

    const SESSION_DIR = ACCOUNT_SESSION_DIR;
    const USER_DATA_DIR = path.join(SESSION_DIR, 'chrome_profile');

    userLog(`📁 [${ACCOUNT_ID}] Session directory: ${SESSION_DIR}`);
    userLog(`📁 [${ACCOUNT_ID}] Chrome profile directory: ${USER_DATA_DIR}`);

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    await cleanupChromeLocks(USER_DATA_DIR);

    let browser;
    let page;

    try {
        const browserWidth = parseInt(process.env.BROWSER_WIDTH) || 960;
        const browserHeight = parseInt(process.env.BROWSER_HEIGHT) || 1080;
        const browserX = parseInt(process.env.BROWSER_X) || 960;
        const browserY = parseInt(process.env.BROWSER_Y) || 0;

        debugLog(`📐 [${ACCOUNT_ID}] Browser size: ${browserWidth}x${browserHeight} at position (${browserX}, ${browserY})`);

        const executablePath = await getBrowserExecutablePath();

        const baseArgs = [
            `--window-size=${browserWidth},${browserHeight}`,
            `--window-position=${browserX},${browserY}`,
            '--no-default-browser-check', '--disable-extensions', '--disable-plugins',
            '--no-first-run', '--noerrdialogs', '--disable-infobars', '--disable-popup-blocking',
            '--ignore-certificate-errors', '--disable-features=IsolateOrigins,site-per-process',
            '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        ];

        userLog(`🚀 [${ACCOUNT_ID}] Launching Playwright browser...`);
        userLog(`🚀 [${ACCOUNT_ID}] Executable path: ${executablePath || 'default (Playwright auto-detect)'}`);
        userLog(`🚀 [${ACCOUNT_ID}] User data dir: ${USER_DATA_DIR}`);

        try {
            browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
                headless: false,
                executablePath: executablePath,
                args: baseArgs,
                viewport: { width: browserWidth, height: browserHeight },
                ignoreDefaultArgs: ['--enable-automation'],
                acceptDownloads: true,
                javaScriptEnabled: true,
                timeout: 120000,
            });
        } catch (launchError) {
            userLog(`❌ [${ACCOUNT_ID}] Failed to launch browser: ${launchError.message}`);
            debugLog(`❌ [${ACCOUNT_ID}] Failed to launch browser: ${launchError.message}`);

            const isLockFileError = launchError.message.includes('lock file') ||
                launchError.message.includes('EPERM') || launchError.message.includes('EBUSY') ||
                launchError.message.includes('SingletonLock');

            if (isLockFileError) {
                userLog(`🔄 [${ACCOUNT_ID}] Lock file issue detected, cleaning locks and retrying...`);
            } else {
                debugLog(`⚠️ [${ACCOUNT_ID}] Launch failed, cleaning locks only (NOT deleting profile): ${launchError.message}`);
            }

            await cleanupChromeLocks(USER_DATA_DIR);
            userLog(`🔄 [${ACCOUNT_ID}] Retrying browser launch without custom executable path...`);

            try {
                browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
                    headless: false,
                    args: baseArgs,
                    viewport: { width: browserWidth, height: browserHeight },
                    ignoreDefaultArgs: ['--enable-automation'],
                    acceptDownloads: true,
                    javaScriptEnabled: true,
                    timeout: 120000,
                });
            } catch (retryError) {
                const isNotInstalled = retryError.message.includes('Executable doesn\'t exist') ||
                    retryError.message.includes('Failed to find browser') ||
                    (retryError.message.includes('chromium') && retryError.message.includes('not found'));

                if (isNotInstalled) {
                    userLog(`❌ [${ACCOUNT_ID}] CRITICAL: Browser Chromium not installed!`);
                    userLog(`❌ [${ACCOUNT_ID}] Please restart the application to install the browser.`);
                    process.stdout.write(`BROWSER_NOT_INSTALLED:${ACCOUNT_ID}:Browser Chromium belum terinstall. Silakan restart aplikasi.\n`);
                }
                throw retryError;
            }
        }

        global.browserInstance = browser;
        userLog(`✅ [${ACCOUNT_ID}] Browser launched successfully!`);

        browser.on('disconnected', () => {
            debugLog(`⚠️ [${ACCOUNT_ID}] Browser disconnected`);
            process.exit(0);
        });

        const pages = browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();
        page.setDefaultTimeout(60000);

        debugLog(`🌐 [${ACCOUNT_ID}] Navigating to Facebook login page...`);
        await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60000 });
        userLog(`✅ [${ACCOUNT_ID}] Facebook login page loaded`);

        debugLog(`⏳ [${ACCOUNT_ID}] Waiting for user to login...`);
        debugLog(`💡 [${ACCOUNT_ID}] Please login to Facebook. Close the browser window when done.`);

        page.on('close', async () => {
            debugLog(`🔒 [${ACCOUNT_ID}] Page closed (user finished login)`);
            try {
                if (browser && !browser.isConnected()) await browser.close();
            } catch (e) { }
            process.exit(0);
        });

        return new Promise((resolve) => {
            browser.on('contextclosed', () => {
                userLog(`✅ [${ACCOUNT_ID}] Login session complete - browser closed`);
                resolve();
                process.exit(0);
            });
        });

    } catch (error) {
        console.error(`❌ [${ACCOUNT_ID}] Error in login mode: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// ===== COMMON FUNCTIONS =====
async function checkIfLoggedInSimple(page) {
    try {
        const url = await page.url();
        if (url.includes('login') || url.includes('checkpoint')) return false;
        const emailField = await page.locator('#email, input[name="email"]').first();
        if (await emailField.count() > 0) return false;
        const loginBtn = await page.locator('button:has-text("Log In"), button:has-text("Masuk")').first();
        if (await loginBtn.count() > 0) return false;
        return true;
    } catch {
        return false;
    }
}

async function continueAfterLogin(joinData) {
    userLog(`🔄 [${ACCOUNT_ID}] Continuing after login confirmation...`);
    if (!global.loginPage || !global.browserInstance) {
        console.error(`❌ [${ACCOUNT_ID}] Browser instance not found`);
        isProcessRunning = false;
        throw new Error('Browser session lost');
    }
    try {
        userLog(`🔄 [${ACCOUNT_ID}] Refreshing page...`);
        await global.loginPage.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await global.loginPage.waitForTimeout(3000);
        if (joinData.action === 'collect-join-groups' || joinData.type === 'collect-join-groups') {
            await continueCollectGroupsProcess(global.loginPage, global.browserInstance, joinData);
        } else if (joinData.groups && joinData.groups.length > 0) {
            await continueJoinCollectedGroupsProcess(global.loginPage, global.browserInstance, joinData);
        } else {
            await continueJoinProcess(global.loginPage, global.browserInstance, joinData);
        }
    } finally {
        delete global.loginPage;
        delete global.browserInstance;
        delete global.joinData;
    }
}

async function launchBrowserForJoin() {
    const SESSION_DIR = ACCOUNT_SESSION_DIR;
    const USER_DATA_DIR = path.join(SESSION_DIR, 'chrome_profile');

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    await cleanupChromeLocks(USER_DATA_DIR);

    const browserWidth = parseInt(process.env.BROWSER_WIDTH) || 960;
    const browserHeight = parseInt(process.env.BROWSER_HEIGHT) || 1080;
    const browserX = parseInt(process.env.BROWSER_X) || 960;
    const browserY = parseInt(process.env.BROWSER_Y) || 0;
    const sizeOption = process.env.BROWSER_SIZE || 'half';

    debugLog(`📐 [${ACCOUNT_ID}] Browser size: ${browserWidth}x${browserHeight} at position (${browserX}, ${browserY})`);

    const isFullscreen = sizeOption === 'full' || sizeOption === 'fullscreen' || sizeOption === 'maximized';
    const viewport = isFullscreen ? null : { width: browserWidth, height: browserHeight };

    const baseArgs = isFullscreen
        ? ['--start-maximized']
        : [`--window-size=${browserWidth},${browserHeight}`, `--window-position=${browserX},${browserY}`];

    const separationArgs = [
        '--no-default-browser-check', '--disable-extensions', '--disable-plugins',
        '--no-first-run', '--noerrdialogs', '--disable-save-password-bubble',
        '--disable-background-mode', '--disable-blink-features=AutomationControlled',
        '--disable-infobars', '--disable-automation', '--exclude-switches=enable-automation',
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

    const launchArgs = [...args, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
    let browser;

    userLog(`🚀 [${ACCOUNT_ID}] Launching Playwright browser...`);
    userLog(`🚀 [${ACCOUNT_ID}] Executable path: ${executablePath || 'default (Playwright auto-detect)'}`);
    userLog(`🚀 [${ACCOUNT_ID}] User data dir: ${USER_DATA_DIR}`);

    try {
        browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            viewport: viewport,
            args: launchArgs,
            executablePath: executablePath,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            slowMo: 0,
            timeout: 120000,
            ignoreDefaultArgs: ['--enable-automation'],
        });
    } catch (error) {
        debugLog(`❌ [${ACCOUNT_ID}] Failed to launch with executablePath: ${error.message}`);

        if (error.message.includes('Executable doesn\'t exist') ||
            error.message.includes('Failed to find browser') ||
            (error.message.includes('chromium') && error.message.includes('not found'))) {
            userLog(`❌ [${ACCOUNT_ID}] BROWSER_NOT_INSTALLED`);
            console.error(`❌ [${ACCOUNT_ID}] Chromium browser not installed. Please restart the app to install browser.`);
            process.exit(1);
        }

        if (error.message.includes('2147483651') || error.message.includes('lock file') ||
            error.message.includes('EPERM') || error.message.includes('EBUSY') ||
            error.message.includes('SingletonLock')) {
            userLog(`🔄 [${ACCOUNT_ID}] Detected corrupt profile, cleaning up and retrying...`);
            await deleteCorruptProfile();
        } else {
            debugLog(`⚠️ [${ACCOUNT_ID}] Launch failed but not deleting profile: ${error.message}`);
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
                ignoreDefaultArgs: ['--enable-automation'],
            });
        } catch (retryError) {
            if (retryError.message.includes('Executable doesn\'t exist') ||
                retryError.message.includes('Failed to find browser') ||
                (retryError.message.includes('chromium') && retryError.message.includes('not found'))) {
                userLog(`❌ [${ACCOUNT_ID}] BROWSER_NOT_INSTALLED`);
                console.error(`❌ [${ACCOUNT_ID}] Chromium browser not installed. Error: ${retryError.message}`);
                process.exit(1);
            }
            throw retryError;
        }
    }

    userLog(`✅ [${ACCOUNT_ID}] SEPARATE Chrome instance launched successfully!`);

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
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    page.setDefaultTimeout(180000);

    return { browser, page };
}

// ===== GROUPS DATA COLLECTION =====
async function startCollectGroupsProcess(joinData) {
    userLog(`📦 [${ACCOUNT_ID}] Starting Facebook Groups Data Collection process...`);

    let browser;
    let page;

    try {
        const keyword = joinData.keyword || '';
        const maxJoins = joinData.maxJoins || 20;

        debugLog(`🔍 [${ACCOUNT_ID}] Collect groups with keyword: "${keyword}"`);
        userLog(`📊 [${ACCOUNT_ID}] Max groups to collect: ${maxJoins}`);

        const browserData = await launchBrowserForJoin();
        browser = browserData.browser;
        page = browserData.page;

        global.browserInstance = browser;
        userLog(`✅ [${ACCOUNT_ID}] Global browser instance set for bring-to-front command`);

        debugLog(`🌐 [${ACCOUNT_ID}] Opening Facebook...`);
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        try {
            const accountTitle = `[${ACCOUNT_NAME}] - Collect Groups`;
            await page.setTitle(accountTitle);
            debugLog(`🏷️ [${ACCOUNT_ID}] Browser window title set to: ${accountTitle}`);
            await page.evaluate((title) => {
                document.title = title;
                const existingBadge = document.getElementById('account-badge');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.id = 'account-badge';
                    badge.style.cssText = `
                        position: fixed; top: 5px; left: 5px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; padding: 6px 12px; border-radius: 20px;
                        font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;
                        z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        pointer-events: none; user-select: none;
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

        userLog(`⏰ [${ACCOUNT_ID}] Waiting for user to login...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            debugLog(`❓ [${ACCOUNT_ID}] Please check browser and login if needed`);
            userLog(`✅ [${ACCOUNT_ID}] If already logged in, click YES in the app popup`);
            debugLog(`❌ [${ACCOUNT_ID}] If not logged in, click NO to cancel`);

            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.joinData = joinData;

            process.stdout.write(`BROWSER_CREATED:${ACCOUNT_ID}:${browser.pages()?.length || 0}\n`);
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
                    await continueCollectGroupsProcess(page, browser, joinData);
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
        throw error;
    }
}

async function continueCollectGroupsProcess(page, browser, joinData) {
    debugLog(`\n📦 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🚀 [${ACCOUNT_ID}] STARTING GROUPS DATA COLLECTION`);
    debugLog(`==========================================\n`);

    try {
        const keyword = joinData.keyword || '';
        const maxJoins = joinData.maxJoins || 20;

        debugLog(`🔍 [${ACCOUNT_ID}] Search keyword: "${keyword}"`);
        userLog(`📊 [${ACCOUNT_ID}] Max groups to collect: ${maxJoins}`);

        // Navigate to groups search page
        debugLog(`🌐 [${ACCOUNT_ID}] Navigating to groups search page...`);
        const encodedKeyword = encodeURIComponent(keyword);
        const searchUrl = `https://www.facebook.com/groups/search/groups_home?q=${encodedKeyword}`;

        userLog(`🔗 [${ACCOUNT_ID}] Search URL: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // ===== REPLACED: Smart Scroll dengan Dua Indikator Berhenti =====
        debugLog(`⬇️ [${ACCOUNT_ID}] Starting SMART SCROLL with DUAL STOP INDICATORS...`);
        userLog(`🎯 [${ACCOUNT_ID}] Target: ${maxJoins} grup | Akan berhenti jika:`);
        userLog(`   ✅ Indikator #1: Target tercapai (${maxJoins} grup)`);
        userLog(`   🛑 Indikator #2: 5x scroll berturut-turut tanpa grup baru`);
        
        await smartScrollGroups(page, maxJoins, {
            maxScrollsWithoutNew: 5,
            scrollDelay: 2000,
            showProgress: true
        });

        // Extract public groups - final collection
        const collectedGroups = await collectPublicGroupsFromPage(page, maxJoins);
        debugLog(`📊 [${ACCOUNT_ID}] Found ${collectedGroups.length} public groups`);

        // Save groups to file
        await saveCollectedGroupsToFile(collectedGroups);

        // Send groups to UI
        const groupsJson = JSON.stringify({ groups: collectedGroups });
        userLog(`GROUPS_COLLECTED:${collectedGroups.length}:${groupsJson}`);
        process.stdout.write(`LOG:${ACCOUNT_ID}:info:GROUPS_COLLECTED:${collectedGroups.length}:${groupsJson}\n`);

        userLog(`✅ [${ACCOUNT_ID}] GROUPS_COLLECTION_COMPLETED`);

        await page.waitForTimeout(2000);

        // Close browser
        userLog(`🔒 [${ACCOUNT_ID}] Closing browser after successful collection...`);
        try {
            if (global.browserInstance && global.browserInstance.isConnected()) {
                await global.browserInstance.close();
                userLog(`✅ [${ACCOUNT_ID}] Browser closed successfully`);
            }
        } catch (closeErr) {
            debugLog(`⚠️ [${ACCOUNT_ID}] Error closing browser: ${closeErr.message}`);
        }

        isProcessRunning = false;
        userLog(`🔚 [${ACCOUNT_ID}] Collection complete, exiting process...`);
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Collect groups error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    }
}

async function collectPublicGroupsFromPage(page, maxGroups) {
    debugLog(`🔍 [${ACCOUNT_ID}] Extracting public groups from page...`);

    const groups = await page.evaluate((maxCount) => {
        const groupsObj = {};
        const publicSpans = [];
        
        document.querySelectorAll('span, div, a').forEach(el => {
            const text = el.textContent || '';
            const isPublic =
                text.includes('Public ·') || text.includes('Public group') ||
                text.includes('Public') || text.includes('public') ||
                text.includes('Publik') || text.includes('publik') ||
                text.includes('Grup Publik') || text.includes('Grup publik') ||
                text.includes('Public Group');

            if (isPublic && text.length < 50) {
                publicSpans.push(el);
            }
        });

        publicSpans.forEach((el) => {
            let container = el;
            for (let i = 0; i < 20; i++) {
                if (!container) break;
                const links = container.querySelectorAll('a[href*="/groups/"]');
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    const name = link.textContent.trim();
                    if (href && href.includes('/groups/') &&
                        name && name.length > 2 &&
                        !name.includes('Join') && !name.includes('Members') && !name.includes('Member')) {
                        const cleanLink = href.split('?')[0].split('#')[0];
                        const slugMatch = cleanLink.match(/\/groups\/([^/]+)/);
                        if (slugMatch) {
                            const groupId = slugMatch[1];
                            if (!groupsObj[groupId]) {
                                let cleanName = name
                                    .replace(/Public·/gi, '').replace(/Public group/gi, '')
                                    .replace(/Public/gi, '').replace(/Publik/gi, '')
                                    .replace(/Grup Publik/gi, '').replace(/Join group/gi, '')
                                    .replace(/Joined/gi, '').replace(/Members?/gi, '')
                                    .replace(/\d+\.?\d*[KkMm]?\s*(members?|Members)?/gi, '')
                                    .replace(/·/g, '').trim();
                                if (cleanName.length > 2) {
                                    groupsObj[groupId] = {
                                        id: groupId,
                                        name: cleanName,
                                        url: cleanLink
                                    };
                                }
                            }
                        }
                    }
                });
                container = container.parentElement;
            }
            if (Object.keys(groupsObj).length >= maxCount) return;
        });
        return Object.values(groupsObj);
    }, maxGroups);

    userLog(`📊 Extracted ${groups.length} unique public groups`);
    return groups.slice(0, maxGroups);
}

async function saveCollectedGroupsToFile(groups) {
    try {
        const userDataDir = process.env.FBOOM_USER_DATA || os.homedir();
        const brandId = process.env.BRAND || 'fboom-x';
        const accountsDir = path.join(userDataDir, 'accounts', brandId);
        const accountPath = path.join(accountsDir, ACCOUNT_ID);
        const joinGroupsFilePath = path.join(accountPath, 'join-groups.json');

        debugLog(`💾 [${ACCOUNT_ID}] Saving groups to: ${joinGroupsFilePath}`);

        if (!fs.existsSync(accountPath)) fs.mkdirSync(accountPath, { recursive: true });

        const joinGroupsData = {
            collectedGroups: groups,
            lastUpdated: new Date().toISOString(),
            accountId: ACCOUNT_ID
        };

        fs.writeFileSync(joinGroupsFilePath, JSON.stringify(joinGroupsData, null, 2));
        debugLog(`✅ [${ACCOUNT_ID}] Saved ${groups.length} groups to ${joinGroupsFilePath}`);
    } catch (error) {
        console.error(`❌ [${ACCOUNT_ID}] Error saving groups to file: ${error.message}`);
    }
}

// ===== JOIN COLLECTED GROUPS PROCESS =====
async function startJoinCollectedGroupsProcess(joinData) {
    userLog(`🤝 [${ACCOUNT_ID}] Starting Join Collected Groups process...`);

    let browser;
    let page;

    try {
        const groups = joinData.groups || [];
        const delayMin = joinData.delayMin || 30;
        const delayMax = joinData.delayMax || 120;

        userLog(`📊 [${ACCOUNT_ID}] Groups to join: ${groups.length}`);
        debugLog(`⏱️ [${ACCOUNT_ID}] Delay range: ${delayMin}-${delayMax} seconds`);

        const browserData = await launchBrowserForJoin();
        browser = browserData.browser;
        page = browserData.page;

        global.browserInstance = browser;
        userLog(`✅ [${ACCOUNT_ID}] Global browser instance set for bring-to-front command`);

        debugLog(`🌐 [${ACCOUNT_ID}] Opening Facebook...`);
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        try {
            const accountTitle = `[${ACCOUNT_NAME}] - Auto Join Groups`;
            await page.setTitle(accountTitle);
            debugLog(`🏷️ [${ACCOUNT_ID}] Browser window title set to: ${accountTitle}`);
            await page.evaluate((title) => {
                document.title = title;
                const existingBadge = document.getElementById('account-badge');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.id = 'account-badge';
                    badge.style.cssText = `
                        position: fixed; top: 5px; left: 5px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; padding: 6px 12px; border-radius: 20px;
                        font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;
                        z-index: 999999; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        pointer-events: none; user-select: none;
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

        userLog(`⏰ [${ACCOUNT_ID}] Waiting for user to login...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.joinData = joinData;

            process.stdout.write(`BROWSER_CREATED:${ACCOUNT_ID}:${browser.pages()?.length || 0}\n`);
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
                    await continueJoinCollectedGroupsProcess(page, browser, joinData);
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
        throw error;
    }
}

async function continueJoinCollectedGroupsProcess(page, browser, joinData) {
    debugLog(`\n🤝 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🚀 [${ACCOUNT_ID}] STARTING AUTO JOIN GROUPS PROCESS`);
    debugLog(`⏳ [${ACCOUNT_ID}] Processing collected groups one by one`);
    debugLog(`==========================================\n`);

    try {
        const groups = joinData.groups || [];
        const delayMin = joinData.delayMin || 30;
        const delayMax = joinData.delayMax || 120;

        userLog(`📊 [${ACCOUNT_ID}] Groups to process: ${groups.length}`);
        debugLog(`⏱️ [${ACCOUNT_ID}] Delay range: ${delayMin}-${delayMax} seconds`);

        let successCount = 0;
        let failCount = 0;
        let totalProcessed = 0;

        for (let i = 0; i < groups.length; i++) {
            if (isCancelled) {
                userLog(`⏹️ [${ACCOUNT_ID}] Group join cancelled by user at ${totalProcessed}/${groups.length} groups processed`);
                break;
            }

            const group = groups[i];
            const groupNumber = i + 1;

            userLog(`\n📊 [${ACCOUNT_ID}] ==========================================`);
            userLog(`🎯 [${ACCOUNT_ID}] PROCESSING GROUP ${groupNumber}/${groups.length}`);
            debugLog(`👥 [${ACCOUNT_ID}] ${group.name} (${group.id})`);
            userLog(`🔗 [${ACCOUNT_ID}] URL: ${group.url}`);
            debugLog(`==========================================\n`);

            userLog(`JOIN_GROUP_STATUS_UPDATE:${group.id}:joining`);
            process.stdout.write(`LOG:${ACCOUNT_ID}:info:JOIN_GROUP_STATUS_UPDATE:${group.id}:joining\n`);

            try {
                debugLog(`🌐 [${ACCOUNT_ID}] Navigating to group page...`);
                await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(3000);

                const joinResult = await joinGroupFromPage(page);

                if (joinResult.success) {
                    successCount++;
                    totalProcessed++;
                    userLog(`✅ [${ACCOUNT_ID}] GROUP JOIN SUCCESS #${totalProcessed}`);
                    debugLog(`🤝 [${ACCOUNT_ID}] Joined: ${group.name}`);

                    userLog(`JOIN_GROUP_STATUS_UPDATE:${group.id}:joined`);
                    process.stdout.write(`LOG:${ACCOUNT_ID}:info:JOIN_GROUP_STATUS_UPDATE:${group.id}:joined\n`);

                    await removeJoinedGroupFromFile(group.id);

                    debugLog(`REMOVE_GROUP_FROM_TABLE:${group.id}`);
                    process.stdout.write(`LOG:${ACCOUNT_ID}:info:REMOVE_GROUP_FROM_TABLE:${group.id}\n`);
                } else {
                    failCount++;
                    totalProcessed++;
                    debugLog(`❌ [${ACCOUNT_ID}] GROUP JOIN FAILED #${totalProcessed}`);
                    debugLog(`❌ [${ACCOUNT_ID}] Error: ${joinResult.error}`);

                    userLog(`JOIN_GROUP_STATUS_UPDATE:${group.id}:failed:${joinResult.error}`);
                    process.stdout.write(`LOG:${ACCOUNT_ID}:info:JOIN_GROUP_STATUS_UPDATE:${group.id}:failed:${joinResult.error}\n`);
                }

                if (i < groups.length - 1) {
                    const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
                    const waitTime = randomDelay * 1000;
                    debugLog(`⏳ [${ACCOUNT_ID}] WAITING ${Math.round(randomDelay)} SECONDS BEFORE NEXT JOIN...`);
                    await page.waitForTimeout(waitTime);
                }

            } catch (error) {
                failCount++;
                totalProcessed++;
                console.error(`❌ [${ACCOUNT_ID}] Error processing group ${group.name}: ${error.message}`);
                userLog(`JOIN_GROUP_STATUS_UPDATE:${group.id}:error:${error.message}`);
                process.stdout.write(`LOG:${ACCOUNT_ID}:info:JOIN_GROUP_STATUS_UPDATE:${group.id}:error:${error.message}\n`);
            }
        }

        userLog(`\n🎯 [${ACCOUNT_ID}] ==========================================`);
        userLog(`📊 [${ACCOUNT_ID}] AUTO JOIN GROUPS SUMMARY`);
        debugLog('══════════════════════════════════════════');
        debugLog(`📦 [${ACCOUNT_ID}] Total groups processed: ${totalProcessed}`);
        userLog(`✅ [${ACCOUNT_ID}] Successful joins: ${successCount}`);
        debugLog(`❌ [${ACCOUNT_ID}] Failed joins: ${failCount}`);
        userLog(`📊 [${ACCOUNT_ID}] Success rate: ${Math.round((successCount / Math.max(totalProcessed, 1)) * 100)}%`);
        if (isCancelled) userLog(`⏹️ [${ACCOUNT_ID}] Process was cancelled by user`);
        debugLog('══════════════════════════════════════════');
        userLog(`✅ [${ACCOUNT_ID}] JOIN PROCESS COMPLETED`);
        userLog(`🎉 [${ACCOUNT_ID}] JOIN_PROCESS_COMPLETED`);
        debugLog('==========================================\n');

        isProcessRunning = false;

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Join collected groups error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    }
}

async function joinGroupFromPage(page) {
    try {
        debugLog(`🔍 [${ACCOUNT_ID}] Looking for join button on group page...`);
        await page.waitForTimeout(2000);

        const joinClicked = await page.evaluate(() => {
            const joinSelectors = [
                '[aria-label="Join group"]',
                '[aria-label*="Join group"]',
                '[role="button"][aria-label="Join group"]',
                'div[role="button"] span:has-text("Join")',
            ];

            let foundButton = null;

            for (const selector of joinSelectors) {
                try {
                    const button = document.querySelector(selector);
                    if (button) {
                        const rect = button.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            foundButton = button;
                            break;
                        }
                    }
                } catch (e) { }
            }

            if (!foundButton) {
                const allDivs = document.querySelectorAll('div[role="button"], button');
                for (const btn of allDivs) {
                    const text = btn.textContent || '';
                    if (text === 'Join group' || text === 'Join' || text === 'Gabung') {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            foundButton = btn;
                            break;
                        }
                    }
                }
            }

            if (foundButton) {
                foundButton.click();
                return { success: true };
            }
            return { success: false, error: 'Join button not found' };
        });

        if (!joinClicked.success) {
            return { success: false, error: joinClicked.error };
        }

        userLog(`✅ Clicked join button`);
        await page.waitForTimeout(3000);

        const closeClicked = await page.evaluate(() => {
            const selectors = [
                '[aria-label="Close"]',
                '[aria-label*="Close" i]',
                'button[aria-label="Close"]',
                'div[role="button"][aria-label="Close"]',
                'div[aria-label="Close"][role="button"]',
            ];

            for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        btn.click();
                        return { success: true };
                    }
                }
            }

            const allButtons = document.querySelectorAll('[role="button"], button');
            for (const btn of allButtons) {
                const ariaLabel = btn.getAttribute('aria-label') || '';
                if (ariaLabel.toLowerCase().includes('close')) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        btn.click();
                        return { success: true };
                    }
                }
            }
            return { success: false };
        });

        if (closeClicked.success) {
            userLog(`✅ Closed dialog`);
            await page.waitForTimeout(1000);
        }

        return { success: true };

    } catch (error) {
        console.error(`❌ Error in joinGroupFromPage: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function removeJoinedGroupFromFile(groupId) {
    try {
        const userDataDir = process.env.FBOOM_USER_DATA || os.homedir();
        const brandId = process.env.BRAND || 'fboom-x';
        const accountsDir = path.join(userDataDir, 'accounts', brandId);
        const accountPath = path.join(accountsDir, ACCOUNT_ID);
        const joinGroupsFilePath = path.join(accountPath, 'join-groups.json');

        debugLog(`🗑️ [${ACCOUNT_ID}] Removing group ${groupId} from: ${joinGroupsFilePath}`);

        if (fs.existsSync(joinGroupsFilePath)) {
            const data = JSON.parse(fs.readFileSync(joinGroupsFilePath, 'utf8'));
            const originalCount = data.collectedGroups?.length || 0;
            data.collectedGroups = (data.collectedGroups || []).filter(g => g.id !== groupId);
            data.lastUpdated = new Date().toISOString();
            fs.writeFileSync(joinGroupsFilePath, JSON.stringify(data, null, 2));
            userLog(`✅ [${ACCOUNT_ID}] Removed joined group ${groupId} from file (${originalCount} -> ${data.collectedGroups.length} groups remaining)`);
        } else {
            debugLog(`⚠️ [${ACCOUNT_ID}] join-groups.json not found at: ${joinGroupsFilePath}`);
        }
    } catch (error) {
        console.error(`❌ [${ACCOUNT_ID}] Error removing group from file: ${error.message}`);
    }
}

// ===== LEGACY KEYWORD-BASED JOIN =====
async function startJoinProcess(joinData) {
    debugLog(`🤝 [${ACCOUNT_ID}] Starting Facebook Auto Join Group process (keyword mode)...`);

    let browser;
    let page;

    try {
        const hasSpintax = joinData.hasSpintax || false;
        const keyword = joinData.keyword || '';
        const delayMin = joinData.delayMin || 30;
        const delayMax = joinData.delayMax || 120;
        const maxJoins = joinData.maxJoins || 10;

        debugLog(`🔍 [${ACCOUNT_ID}] Search keyword: "${keyword}"${hasSpintax ? ' [HAS SPINTAX]' : ''}`);
        debugLog(`⏱️ [${ACCOUNT_ID}] Delay range: ${delayMin}-${delayMax} seconds`);
        userLog(`📊 [${ACCOUNT_ID}] Max joins: ${maxJoins}`);

        const browserData = await launchBrowserForJoin();
        browser = browserData.browser;
        page = browserData.page;

        global.browserInstance = browser;

        debugLog(`🌐 [${ACCOUNT_ID}] Opening Facebook...`);
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        let checkInterval;
        let loginConfirmedManually = false;

        userLog(`⏰ [${ACCOUNT_ID}] Waiting 10 seconds for user to login...`);

        const loginTimeout = setTimeout(() => {
            userLog(`⏰ [${ACCOUNT_ID}] LOGIN_CONFIRMATION_NEEDED`);
            process.stdout.write('LOGIN_CONFIRMATION_NEEDED\n');

            global.loginPage = page;
            global.browserInstance = browser;
            global.joinData = joinData;

            process.stdout.write(`BROWSER_CREATED:${ACCOUNT_ID}:${browser.pages()?.length || 0}\n`);
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
                    await continueJoinProcess(page, browser, joinData);
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
        throw error;
    }
}

async function continueJoinProcess(page, browser, joinData) {
    debugLog(`\n🤝 [${ACCOUNT_ID}] ==========================================`);
    userLog(`🚀 [${ACCOUNT_ID}] STARTING AUTO JOIN GROUP PROCESS (KEYWORD MODE)`);
    debugLog(`⏳ [${ACCOUNT_ID}] Processing each group with delay`);
    debugLog(`==========================================\n`);

    try {
        const hasSpintax = joinData.hasSpintax || false;
        const keyword = joinData.keyword || '';
        const delayMin = joinData.delayMin || 30;
        const delayMax = joinData.delayMax || 120;
        const maxJoins = joinData.maxJoins || 10;

        let searchKeyword = keyword;
        if (hasSpintax) {
            searchKeyword = spinText(keyword);
            debugLog(`🎲 [${ACCOUNT_ID}] Spin text applied: "${keyword}" → "${searchKeyword}"`);
        }

        debugLog(`🌐 [${ACCOUNT_ID}] Navigating to groups search page...`);
        const encodedKeyword = encodeURIComponent(searchKeyword);
        const searchUrl = `https://www.facebook.com/groups/search/groups_home?q=${encodedKeyword}`;

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        let successCount = 0;
        let failCount = 0;
        let totalProcessed = 0;

        while (totalProcessed < maxJoins) {
            if (isCancelled) {
                userLog(`⏹️ [${ACCOUNT_ID}] Group join cancelled by user`);
                break;
            }

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);

            const joinResult = await joinNextAvailableGroup(page);

            if (joinResult.success) {
                successCount++;
                totalProcessed++;
                userLog(`✅ [${ACCOUNT_ID}] GROUP JOIN SUCCESS #${totalProcessed}`);
                if (totalProcessed < maxJoins) {
                    const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
                    await page.waitForTimeout(randomDelay * 1000);
                }
            } else if (joinResult.noMoreGroups) {
                debugLog(`🏁 [${ACCOUNT_ID}] No more groups available`);
                break;
            } else {
                failCount++;
                totalProcessed++;
                if (totalProcessed < maxJoins) {
                    const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
                    await page.waitForTimeout(randomDelay * 1000);
                }
            }
        }

        userLog(`\n🎯 [${ACCOUNT_ID}] AUTO JOIN GROUP SUMMARY`);
        userLog(`✅ Successful joins: ${successCount}`);
        debugLog(`❌ Failed joins: ${failCount}`);
        userLog(`✅ [${ACCOUNT_ID}] JOIN_PROCESS_COMPLETED`);

        isProcessRunning = false;

    } catch (error) {
        console.error(`\n❌ [${ACCOUNT_ID}] Auto join group error: ${error.message}`);
        isProcessRunning = false;
        throw error;
    }
}

async function joinNextAvailableGroup(page) {
    try {
        const groupsData = await page.evaluate(() => {
            const groupSelectors = [
                '[data-virtualized="false"]',
                '[role="listitem"]',
                '[data-pagelet*="Group"]',
            ];

            let groups = [];
            for (const selector of groupSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        const potentialGroups = Array.from(elements).filter(element => {
                            const text = element.textContent || '';
                            return text.includes('Public') || text.includes('Public group') ||
                                (!text.includes('Private') && !text.includes('Private group'));
                        });
                        if (potentialGroups.length > 0) {
                            groups = potentialGroups;
                            break;
                        }
                    }
                } catch (e) { continue; }
            }

            if (groups.length === 0) return { noMoreGroups: true };

            const joinableGroups = [];
            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const text = group.textContent || '';
                const isPublic = text.includes('Public group') || text.includes('Public') ||
                    (!text.includes('Private group') && !text.includes('Private'));

                if (isPublic) {
                    let joinButton = group.querySelector('[aria-label*="Join group"]') ||
                        group.querySelector('[role="button"][aria-label*="Join"]');

                    if (!joinButton) {
                        const allButtons = group.querySelectorAll('button, [role="button"]');
                        for (const btn of allButtons) {
                            const btnText = btn.textContent || '';
                            if (btnText.includes('Join') || btnText.includes('Gabung')) {
                                joinButton = btn;
                                break;
                            }
                        }
                    }

                    if (joinButton) {
                        const groupName = group.querySelector('h3, h4, [role="link"] span')?.textContent || `Group ${i + 1}`;
                        joinableGroups.push({
                            index: i,
                            groupName: groupName.trim(),
                            hasJoinButton: true
                        });
                    }
                }
            }

            return { groups: joinableGroups, joinableCount: joinableGroups.length };
        });

        if (groupsData.noMoreGroups || groupsData.joinableCount === 0) {
            return { noMoreGroups: true };
        }

        for (const groupInfo of groupsData.groups) {
            const joinResult = await page.evaluate((groupIndex) => {
                const groupSelectors = [
                    '[data-virtualized="false"]',
                    '[role="listitem"]',
                ];

                let targetGroup = null;
                for (const selector of groupSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > groupIndex) {
                        const potentialGroups = Array.from(elements).filter(element => {
                            const text = element.textContent || '';
                            return text.includes('Public') || text.includes('Private') ||
                                element.querySelector('[aria-label*="Join"]');
                        });
                        if (potentialGroups.length > groupIndex) {
                            targetGroup = potentialGroups[groupIndex];
                            break;
                        }
                    }
                }

                if (!targetGroup) return { success: false, error: 'Group element not found' };

                let joinButton = targetGroup.querySelector('[aria-label*="Join group"]') ||
                    targetGroup.querySelector('[role="button"][aria-label*="Join"]');

                if (!joinButton) {
                    const allButtons = targetGroup.querySelectorAll('button, [role="button"]');
                    for (const btn of allButtons) {
                        const text = btn.textContent || '';
                        if (text.includes('Join') || text.includes('Gabung')) {
                            joinButton = btn;
                            break;
                        }
                    }
                }

                if (!joinButton) return { success: false, error: 'Join button not found' };

                joinButton.click();

                setTimeout(() => {
                    const closeButton = document.querySelector('[aria-label="Close"]') ||
                        document.querySelector('[role="button"][aria-label="Close"]');
                    if (closeButton) closeButton.click();
                }, 2000);

                return { success: true };
            }, groupInfo.index);

            if (joinResult.success) {
                await page.waitForTimeout(3000);
                try {
                    const closeButton = await page.locator('[aria-label="Close"]').first();
                    if (await closeButton.count() > 0) await closeButton.click();
                } catch (e) { }
                return { success: true, groupName: groupInfo.groupName };
            }
        }

        return { success: false, error: 'No groups could be joined' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===== MAIN EXECUTION =====
if (require.main === module) {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    runFacebookAutoJoinGroup();
}