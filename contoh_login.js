// Login System for Facebook Auto Poster - PRODUCTION ONLY
class LoginSystem {
    constructor() {
        // API Configuration - PRODUCTION
        this.apiUrl = "https://api2.solvy.cloud/Fboomx/check";
        this.apiKey = "dc85d4d8-9b5f-466a-ba47-b7c66aa43b7f";

        // Session Configuration
        this.sessionDuration = 3 * 24 * 60 * 60 * 1000; // 3 days
        this.maxRetryAttempts = 3;
        this.retryDelay = 2000;

        this.init();
    }

    init() {
        this.setupSecurityProtection();
        this.setupEventListeners();
        this.checkExistingSession();
        this.setupNotificationStyles();
    }

    // 🔒 SECURITY PROTECTION METHODS
    setupSecurityProtection() {
        this.preventDeveloperTools();
        this.disableRightClick();
        this.disableKeyboardShortcuts();
        this.detectDevTools();
    }

    preventDeveloperTools() {
        document.addEventListener('keydown', (e) => {
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                (e.ctrlKey && e.shiftKey && e.key === 'J') ||
                (e.ctrlKey && e.shiftKey && e.key === 'C') ||
                (e.ctrlKey && e.key === 'u')
            ) {
                e.preventDefault();
                this.showSecurityWarning();
                return false;
            }
        });

        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showSecurityWarning();
            return false;
        });
    }

    disableRightClick() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        document.addEventListener('dragstart', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    disableKeyboardShortcuts() {
        const disabledKeys = [
            'F12', 'I', 'J', 'C', 'U'
        ];

        document.addEventListener('keydown', (e) => {
            if (
                (e.ctrlKey && disabledKeys.includes(e.key)) ||
                (e.ctrlKey && e.shiftKey && disabledKeys.includes(e.key)) ||
                e.key === 'F12'
            ) {
                e.preventDefault();
                e.stopPropagation();
                this.showSecurityWarning();
                return false;
            }
        });
    }

    detectDevTools() {
        const checkDevTools = () => {
            const start = Date.now();
            debugger;
            const end = Date.now();
            if (end - start > 100) {
                this.handleDevToolsDetected();
            }
        };

        setInterval(checkDevTools, 1000);

        let lastWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            if (window.innerWidth !== lastWidth) {
                setTimeout(checkDevTools, 100);
            }
            lastWidth = window.innerWidth;
        });
    }

    handleDevToolsDetected() {
        console.log('Developer Tools detected!');
        this.showSecurityWarning();
    }

    showSecurityWarning() {
        this.showNotification('Akses developer tools diblokir untuk keamanan', 'warning');
    }

    setupEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const licenseInput = document.getElementById('licenseKey');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        if (licenseInput) {
            licenseInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLogin();
                }
            });

            licenseInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\s/g, '').toUpperCase();
            });

            licenseInput.addEventListener('paste', (e) => {
                setTimeout(() => {
                    e.target.value = e.target.value.replace(/\s/g, '').toUpperCase();
                }, 10);
            });
        }
    }

    setupNotificationStyles() {
        if (!document.getElementById('notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 16px 20px;
                    border-radius: 8px;
                    color: white;
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    transform: translateX(400px);
                    opacity: 0;
                    transition: all 0.3s ease-in-out;
                    z-index: 10000;
                    min-width: 300px;
                    max-width: 400px;
                }

                .notification.show {
                    transform: translateX(0);
                    opacity: 1;
                }

                .notification.success {
                    background: linear-gradient(135deg, #10b981, #059669);
                    border-left: 4px solid #047857;
                }

                .notification.error {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    border-left: 4px solid #b91c1c;
                }

                .notification.warning {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    border-left: 4px solid #b45309;
                }

                .notification.info {
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    border-left: 4px solid #1d4ed8;
                }

                .notification button {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: background-color 0.2s;
                }

                .notification button:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .btn-loading {
                    position: relative;
                    color: transparent !important;
                }

                .btn-loading::after {
                    content: '';
                    position: absolute;
                    width: 20px;
                    height: 20px;
                    top: 50%;
                    left: 50%;
                    margin-left: -10px;
                    margin-top: -10px;
                    border: 2px solid #ffffff;
                    border-radius: 50%;
                    border-top-color: transparent;
                    animation: spin 1s ease-in-out infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    async checkExistingSession() {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`═══════════════════════════════════════════════════════════`);
        console.log(`[${timestamp}] [SESSION CHECK] Starting session validation process...`);
        console.log(`═══════════════════════════════════════════════════════════`);

        try {
            // Get stored session and validate it
            const session = await this.validateSession();

            if (!session.isValid) {
                console.log(`[${timestamp}] [SESSION CHECK] ❌ No valid session found`);
                console.log(`[${timestamp}] [SESSION CHECK] Manual login required`);
                // Ensure PC ID exists
                let pcid = this.getStoredPcid();
                if (!pcid) {
                    console.log(`[${timestamp}] [SESSION CHECK] No stored PC ID found, generating new one...`);
                    pcid = await this.generateDeviceId();
                    console.log(`[${timestamp}] [SESSION CHECK] ✅ PC ID generated and stored for future use`);
                } else {
                    console.log(`[${timestamp}] [SESSION CHECK] ✅ Using existing stored PC ID: ${pcid.substring(0, 20)}...`);
                }
                console.log(`═══════════════════════════════════════════════════════════`);
                return;
            }

            console.log(`[${timestamp}] [SESSION CHECK] ✅ Valid session found`);
            console.log(`[${timestamp}] [SESSION CHECK] Session expires in: ${session.remainingMinutes} minutes`);
            console.log(`[${timestamp}] [SESSION CHECK] License Key: ${session.license}`);
            console.log(`[${timestamp}] [SESSION CHECK] PC ID: ${session.pcid}`);

            // Validate license with server
            const licenseKey = session.license;
            const pcid = session.pcid;

            console.log(`[${timestamp}] [LICENSE CHECK] 🔍 Validating stored license with server...`);
            const validationResult = await this.validateLicense(licenseKey, pcid);

            if (validationResult.success) {
                console.log(`[${timestamp}] [LICENSE CHECK] ✅ License validation successful`);
                console.log(`[${timestamp}] [AUTO-LOGIN] Auto-login allowed`);
                this.showNotification('License valid! Logging in...', 'success');

                // Update session time on successful validation
                await this.saveLoginSession(licenseKey, pcid);

                // Redirect to main app after short delay
                setTimeout(async () => {
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`[${timestamp}] [AUTO-LOGIN] Starting account cleanup before launching Fboom...`);

                    // Stop all active accounts before launching Fboom
                    try {
                        console.log(`[${timestamp}] [AUTO-LOGIN] Calling window.electronAPI.stopAllAccounts()...`);
                        const stopResult = await window.electronAPI.stopAllAccounts();
                        console.log(`[${timestamp}] [AUTO-LOGIN] stopAllAccounts result:`, stopResult);

                        if (stopResult.success) {
                            console.log(`[${timestamp}] [AUTO-LOGIN] Successfully stopped ${stopResult.stopped} of ${stopResult.total} accounts`);
                        } else {
                            console.log(`[${timestamp}] [AUTO-LOGIN] Warning: Failed to stop some accounts: ${stopResult.message}`);
                        }
                    } catch (error) {
                        console.error(`[${timestamp}] [AUTO-LOGIN] Error stopping accounts:`, error);
                    }

                    // Notify main process that login was successful
                    try {
                        await window.electronAPI.loginSuccess();
                    } catch (error) {
                        console.error('Error notifying main process:', error);
                        window.location.href = 'index.html';
                    }
                }, 1500);
            } else {
                console.log(`[${timestamp}] [LICENSE CHECK] ❌ License validation FAILED`);
                console.log(`[${timestamp}] [LICENSE CHECK] Error: ${validationResult.error}`);
                console.log(`[${timestamp}] [LICENSE CHECK] Clear session: ${validationResult.clearSession}`);

                // Clear session if license is invalid/expired
                if (validationResult.clearSession) {
                    await this.clearSession();
                    this.showNotification('License tidak valid: ' + validationResult.error, 'error');
                } else {
                    this.showNotification('License check failed: ' + validationResult.error, 'warning');
                }

                // Prefill license field for user convenience
                this.prefillLicenseField(licenseKey);
            }

            console.log(`═══════════════════════════════════════════════════════════`);

        } catch (error) {
            console.error(`[${timestamp}] [SESSION CHECK] ❌ Session check error:`, error);
            this.showNotification('Terjadi kesalahan saat memeriksa session', 'error');
        }
    }

    async validateSession() {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [VALIDATE SESSION] 🔍 Validating stored session...`);

        try {
            const result = await window.electronAPI.getLoginSession();
            if (!result.success) {
                console.log(`[${timestamp}] [VALIDATE SESSION] ❌ Failed to get login session: ${result.error}`);
                return { isValid: false };
            }

            const { license, pcid, loginTime } = result.session;

            console.log(`[${timestamp}] [VALIDATE SESSION] 📋 Session data found:`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - License: ${license}`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - PC ID: ${pcid}`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - Login Time: ${new Date(parseInt(loginTime)).toISOString()}`);

            if (!license || !pcid || !loginTime) {
                console.log(`[${timestamp}] [VALIDATE SESSION] ❌ Session data incomplete`);
                return { isValid: false };
            }

            const loginTimestamp = parseInt(loginTime);
            const currentTime = Date.now();
            const elapsed = currentTime - loginTimestamp;
            const sessionValid = elapsed <= this.sessionDuration;
            const remainingTime = Math.max(0, this.sessionDuration - elapsed);
            const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
            const remainingHours = Math.floor(remainingMinutes / 60);

            console.log(`[${timestamp}] [VALIDATE SESSION] ⏱️ Time calculation:`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - Current time: ${new Date(currentTime).toISOString()}`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - Elapsed time: ${Math.floor(elapsed / (60 * 1000))} minutes`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - Remaining time: ${remainingHours}h ${remainingMinutes % 60}m`);
            console.log(`[${timestamp}] [VALIDATE SESSION]    - Session valid: ${sessionValid ? '✅ YES' : '❌ NO'}`);

            return {
                isValid: sessionValid,
                remainingTime: remainingTime,
                remainingMinutes: remainingMinutes,
                license: license,
                pcid: pcid
            };
        } catch (error) {
            console.error(`[${timestamp}] [VALIDATE SESSION] ❌ Error validating session:`, error);
            return { isValid: false };
        }
    }

    async handleLogin() {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [LOGIN] handleLogin() called - Launch Fboom button clicked`);

        const licenseKey = document.getElementById('licenseKey').value.trim();

        if (!licenseKey) {
            this.showNotification('License key tidak boleh kosong', 'error');
            return;
        }

        if (licenseKey.length < 5) {
            this.showNotification('License key terlalu pendek', 'error');
            return;
        }

        const submitBtn = document.querySelector('#loginForm button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        this.setButtonLoading(submitBtn, true);

        try {
            // Get or generate PC ID
            let pcid = this.getStoredPcid();
            if (!pcid) {
                pcid = await this.generateDeviceId();
                this.saveStoredPcid(pcid);
                console.log('Generated and stored new PC ID:', pcid);
            } else {
                console.log('Using stored PC ID:', pcid);
            }

            console.log('Sending request with:', { licenseKey, pcid });

            const result = await this.validateLicense(licenseKey, pcid);

            if (result.success) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] [LOGIN] License validation successful, proceeding with login`);

                // Create session (PC ID stays in localStorage for future use)
                await this.saveLoginSession(licenseKey, pcid);
                console.log(`[${timestamp}] [LOGIN] Session saved, showing success notification`);
                this.showNotification('Login successful! Redirecting to Fboom-X...', 'success');

                setTimeout(async () => {
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`[${timestamp}] [LOGIN] Starting account cleanup before launching Fboom...`);

                    // Stop all active accounts before launching Fboom
                    try {
                        console.log(`[${timestamp}] [LOGIN] Calling window.electronAPI.stopAllAccounts()...`);
                        const stopResult = await window.electronAPI.stopAllAccounts();
                        console.log(`[${timestamp}] [LOGIN] stopAllAccounts result:`, stopResult);

                        if (stopResult.success) {
                            console.log(`[${timestamp}] [LOGIN] Successfully stopped ${stopResult.stopped} of ${stopResult.total} accounts`);
                        } else {
                            console.log(`[${timestamp}] [LOGIN] Warning: Failed to stop some accounts: ${stopResult.message}`);
                        }
                    } catch (error) {
                        console.error(`[${timestamp}] [LOGIN] Error stopping accounts:`, error);
                        // Continue with login even if stopping accounts fails
                    }

                    // Notify main process that login was successful
                    try {
                        await window.electronAPI.loginSuccess();
                    } catch (error) {
                        console.error('Error notifying main process:', error);
                        // Fallback to direct redirect if electron API fails
                        window.location.href = 'index.html';
                    }
                }, 1500);
            } else {
                this.showNotification(result.error, 'error');
                if (result.clearSession) {
                    this.clearSession();
                }
            }

        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Terjadi kesalahan: ' + error.message, 'error');
        } finally {
            this.setButtonLoading(submitBtn, false, originalText);
        }
    }

    async validateLicense(licenseKey, pcid) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [LICENSE VALIDATION] 🔍 Starting license validation process`);
        console.log(`[${timestamp}] [LICENSE VALIDATION] License: ${licenseKey}`);
        console.log(`[${timestamp}] [LICENSE VALIDATION] PC ID: ${pcid}`);
        console.log(`[${timestamp}] [LICENSE VALIDATION] API URL: ${this.apiUrl}`);

        // PRODUCTION - Always use real API
        for (let attempt = 1; attempt <= this.maxRetryAttempts; attempt++) {
            try {
                console.log(`[${timestamp}] [LICENSE VALIDATION] 📡 Attempt ${attempt}/${this.maxRetryAttempts}`);
                const result = await this.callLicenseAPI(licenseKey, pcid);

                console.log(`[${timestamp}] [LICENSE VALIDATION] 📨 API Response received:`, result);

                if (result.status === true) {
                    console.log(`[${timestamp}] [LICENSE VALIDATION] ✅ SUCCESS - License is VALID`);
                    return {
                        success: true,
                        data: result
                    };
                }
                else if (result.status === false) {
                    console.log(`[${timestamp}] [LICENSE VALIDATION] ❌ FAILED - License is INVALID`);
                    console.log(`[${timestamp}] [LICENSE VALIDATION] Error code: ${result.code}`);
                    console.log(`[${timestamp}] [LICENSE VALIDATION] Error message: ${result.message}`);
                    return {
                        success: false,
                        error: this.getErrorMessage(result.code, result.message),
                        clearSession: this.shouldClearSession(result.code)
                    };
                }
                else {
                    console.log(`[${timestamp}] [LICENSE VALIDATION] ⚠️ UNEXPECTED response format:`, result);
                    return {
                        success: false,
                        error: 'Format response tidak valid dari server',
                        clearSession: false
                    };
                }

            } catch (error) {
                console.error(`[${timestamp}] [LICENSE VALIDATION] ❌ Attempt ${attempt} failed:`, error.message);

                if (attempt < this.maxRetryAttempts) {
                    console.log(`[${timestamp}] [LICENSE VALIDATION] ⏳ Retrying in ${this.retryDelay}ms...`);
                    await this.delay(this.retryDelay);
                } else {
                    console.log(`[${timestamp}] [LICENSE VALIDATION] ❌ All attempts failed`);
                    return {
                        success: false,
                        error: 'Gagal terhubung ke server license. Periksa koneksi internet Anda.',
                        clearSession: false
                    };
                }
            }
        }
    }

    async callLicenseAPI(licenseKey, pcid) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [API CALL] 🌐 Starting API call to license server`);

        const formData = new URLSearchParams();
        formData.append('key', licenseKey);
        formData.append('pcid', pcid);
        formData.append('apikey', this.apiKey);

        console.log(`[${timestamp}] [API CALL] 📤 Request URL: ${this.apiUrl}`);
        console.log(`[${timestamp}] [API CALL] 📤 Request Method: POST`);
        console.log(`[${timestamp}] [API CALL] 📤 Request Headers: Content-Type: application/x-www-form-urlencoded`);
        console.log(`[${timestamp}] [API CALL] 📤 Request Body: key=${licenseKey}, pcid=${pcid.substring(0, 20)}..., apikey=***${this.apiKey.slice(-4)}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            console.log(`[${timestamp}] [API CALL] ⏳ Waiting for server response...`);
            const startTime = Date.now();

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            console.log(`[${timestamp}] [API CALL] 📥 Response received in ${responseTime}ms`);
            console.log(`[${timestamp}] [API CALL] 📥 Response Status: ${response.status} ${response.statusText}`);
            console.log(`[${timestamp}] [API CALL] 📥 Response OK: ${response.ok}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[${timestamp}] [API CALL] 📦 Response Data:`, JSON.stringify(data, null, 2));
            return data;

        } catch (error) {
            clearTimeout(timeoutId);

            console.error(`[${timestamp}] [API CALL] ❌ API Call Error:`, error.message);

            if (error.name === 'AbortError') {
                console.error(`[${timestamp}] [API CALL] ⏱️ Request timeout after 15 seconds`);
                throw new Error('Timeout: Server tidak merespons dalam 15 detik');
            }

            console.error(`[${timestamp}] [API CALL] 🔌 Network error:`, error.message);
            throw new Error(`Network error: ${error.message}`);
        }
    }

    getErrorMessage(errorCode, apiMessage) {
        const messages = {
            0: 'License not found or invalid',
            1: 'License data is incomplete',
            2: 'License has expired',
            3: 'Login Successful',
            4: 'Submitted data is incomplete',
            5: 'License is already registered on another device',
            'default': apiMessage || 'An unknown error occurred'
        };

        return messages[errorCode] || messages['default'];
    }

    shouldClearSession(errorCode) {
        const clearSessionCodes = [0, 2, 5];
        return clearSessionCodes.includes(errorCode);
    }

    // PC ID Management Functions
    getStoredPcid() {
        try {
            return localStorage.getItem('fbautoposter_pcid');
        } catch (error) {
            console.error('Error getting stored PC ID:', error);
            return null;
        }
    }

    saveStoredPcid(pcid) {
        try {
            localStorage.setItem('fbautoposter_pcid', pcid);
            console.log('PC ID saved to localStorage:', pcid);
        } catch (error) {
            console.error('Error saving PC ID to localStorage:', error);
        }
    }


    async generateDeviceId() {
        try {
            // Check if we already have a PC ID stored
            let deviceId = this.getStoredPcid();

            if (!deviceId) {
                // Generate new PC ID
                const components = [
                    navigator.userAgent,
                    navigator.platform,
                    navigator.hardwareConcurrency?.toString() || 'unknown',
                    `${screen.width}x${screen.height}`,
                    navigator.language,
                    new Date().getTimezoneOffset().toString(),
                    navigator.deviceMemory?.toString() || 'unknown',
                    navigator.maxTouchPoints?.toString() || 'unknown'
                ].join('|');

                let hash = 0;
                for (let i = 0; i < components.length; i++) {
                    const char = components.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }

                const timestamp = Date.now().toString(36);
                const randomStr = Math.random().toString(36).substring(2, 10);
                deviceId = `fbap_${Math.abs(hash).toString(36)}_${timestamp}_${randomStr}`;

                // Save to localStorage
                this.saveStoredPcid(deviceId);
                console.log('Generated and stored new PC ID:', deviceId);
            } else {
                console.log('Using stored PC ID:', deviceId);
            }

            return deviceId.substring(0, 100);

        } catch (error) {
            console.error('PC ID generation error:', error);
            const fallbackId = `fbap_fallback_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
            console.log('Using fallback PC ID:', fallbackId);
            return fallbackId;
        }
    }

    async saveLoginSession(licenseKey, pcid) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [SAVE SESSION] 💾 Saving login session...`);

        const loginTime = Date.now();
        const expiredTime = loginTime + this.sessionDuration;

        const sessionData = {
            license: licenseKey,
            pcid: pcid,
            loginTime: loginTime.toString(),
            expiredTime: expiredTime.toString()
        };

        console.log(`[${timestamp}] [SAVE SESSION] 📋 Session data:`);
        console.log(`[${timestamp}] [SAVE SESSION]    - License: ${licenseKey}`);
        console.log(`[${timestamp}] [SAVE SESSION]    - PC ID: ${pcid}`);
        console.log(`[${timestamp}] [SAVE SESSION]    - Login Time: ${new Date(loginTime).toISOString()}`);
        console.log(`[${timestamp}] [SAVE SESSION]    - Expire Time: ${new Date(expiredTime).toISOString()}`);
        console.log(`[${timestamp}] [SAVE SESSION]    - Duration: 3 days (259200000ms)`);

        try {
            const result = await window.electronAPI.saveLoginSession(sessionData);
            if (result.success) {
                console.log(`[${timestamp}] [SAVE SESSION] ✅ Session saved successfully via IPC`);
            } else {
                console.error(`[${timestamp}] [SAVE SESSION] ❌ Failed to save session via IPC: ${result.error}`);
            }
        } catch (error) {
            console.error(`[${timestamp}] [SAVE SESSION] ❌ Error saving session:`, error);
        }
    }

    async clearSession() {
        try {
            const result = await window.electronAPI.clearLoginSession();
            if (result.success) {
                console.log('Session cleared via IPC');
                // Note: PC ID is preserved in localStorage for future use
            } else {
                console.error('Failed to clear session via IPC:', result.error);
            }
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    prefillLicenseField(license) {
        const licenseInput = document.getElementById('licenseKey');

        if (license && licenseInput) {
            licenseInput.value = license;
            console.log('Prefilled license field');
        }
    }

    setButtonLoading(button, isLoading, originalText = 'Launch Facebook Auto Poster') {
        if (isLoading) {
            button.innerHTML = 'Validating...';
            button.classList.add('btn-loading');
            button.disabled = true;
        } else {
            button.innerHTML = originalText;
            button.classList.remove('btn-loading');
            button.disabled = false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showNotification(message, type = 'info', duration = 5000) {
        let notificationContainer = document.getElementById('notificationContainer');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notificationContainer';
            notificationContainer.style.cssText = `
                position: fixed;
                top: 0;
                right: 0;
                z-index: 10000;
                padding: 20px;
                max-width: 400px;
            `;
            document.body.appendChild(notificationContainer);
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        notification.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas ${icons[type]} mr-3"></i>
                    <span class="font-medium">${message}</span>
                </div>
                <button class="ml-4 text-white hover:text-gray-200 transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        const closeBtn = notification.querySelector('button');
        closeBtn.onclick = () => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        };

        notificationContainer.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, duration);
    }

    async logout() {
        if (confirm('Apakah Anda yakin ingin logout?')) {
            console.log('User initiated logout');
            await this.clearSession();
            // PC ID is preserved for next login session
            window.location.href = 'login.html';
        }
    }

    isLoggedIn() {
        return this.validateSession().isValid;
    }

    getRemainingSessionTime() {
        const session = this.validateSession();
        if (session.isValid) {
            return session.remainingTime;
        }
        return 0;
    }
}

// Initialize Login System when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Facebook Auto Poster Login System...');
    window.loginSystem = new LoginSystem();

    // Add global logout function
    window.logout = () => {
        window.loginSystem.logout();
    };

    // Add global login check function
    window.isLoggedIn = () => {
        return window.loginSystem.isLoggedIn();
    };

    console.log('Facebook Auto Poster Login System initialized successfully');
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoginSystem;
}
