const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const https = require('https')

class LicenseManager {
    constructor(dataDir) {
        this.apiUrl = 'https://api2.solvy.cloud/Fboomx/check'
        this.apiKey = 'dc85d4d8-9b5f-466a-ba47-b7c66aa43b7f'
        this.sessionDuration = 3 * 24 * 60 * 60 * 1000 // 3 days
        this.sessionPath = path.join(dataDir, 'session.json')
        this.maxRetries = 3
        this.retryDelay = 2000
    }

    // Generate machine-specific PC ID using hardware info
    generatePcId() {
        const components = [
            os.hostname(),
            os.platform(),
            os.arch(),
            os.cpus()[0]?.model || 'unknown',
            os.cpus().length.toString(),
            os.totalmem().toString(),
            os.homedir()
        ].join('|')
        return 'fboomx_' + crypto.createHash('sha256').update(components).digest('hex').substring(0, 32)
    }

    // Get PC ID — reuse from saved session or generate new
    getPcId() {
        const session = this._loadRaw()
        if (session && session.pcid) return session.pcid
        return this.generatePcId()
    }

    _loadRaw() {
        try {
            if (fs.existsSync(this.sessionPath)) {
                return JSON.parse(fs.readFileSync(this.sessionPath, 'utf8'))
            }
        } catch (e) { }
        return null
    }

    saveSession(license, pcid) {
        const now = Date.now()
        const data = {
            license,
            pcid,
            loginTime: now.toString(),
            expiredTime: (now + this.sessionDuration).toString()
        }
        const dir = path.dirname(this.sessionPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(this.sessionPath, JSON.stringify(data, null, 2))
        return data
    }

    clearSession() {
        try {
            if (fs.existsSync(this.sessionPath)) fs.unlinkSync(this.sessionPath)
        } catch (e) { }
    }

    // Check local session validity (returns license even if expired for prefill)
    checkSession() {
        const session = this._loadRaw()
        if (!session || !session.license || !session.pcid || !session.loginTime) {
            return { valid: false }
        }
        const elapsed = Date.now() - parseInt(session.loginTime)
        const remaining = Math.max(0, this.sessionDuration - elapsed)
        return {
            valid: remaining > 0,
            license: session.license,
            pcid: session.pcid,
            remainingMs: remaining,
            remainingMinutes: Math.ceil(remaining / 60000)
        }
    }

    // Validate license key with remote API (with retries)
    async validateLicense(licenseKey, pcid) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await this._callAPI(licenseKey, pcid)
                if (result.status === true) {
                    return { success: true, data: result }
                } else if (result.status === false) {
                    return {
                        success: false,
                        error: this._errorMessage(result.code, result.message),
                        clearSession: [0, 2, 5].includes(result.code)
                    }
                } else {
                    return { success: false, error: 'Invalid response format from server', clearSession: false }
                }
            } catch (err) {
                if (attempt >= this.maxRetries) {
                    return { success: false, error: 'Failed to connect to server: ' + err.message, clearSession: false }
                }
                await new Promise(r => setTimeout(r, this.retryDelay))
            }
        }
    }

    _callAPI(licenseKey, pcid) {
        return new Promise((resolve, reject) => {
            const postData = new URLSearchParams({
                key: licenseKey,
                pcid: pcid,
                apikey: this.apiKey
            }).toString()

            const url = new URL(this.apiUrl)
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }

            const req = https.request(options, (res) => {
                let body = ''
                res.on('data', chunk => body += chunk)
                res.on('end', () => {
                    try { resolve(JSON.parse(body)) }
                    catch (e) { reject(new Error('Invalid JSON response')) }
                })
            })

            req.on('error', reject)
            req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout (15s)')) })
            req.write(postData)
            req.end()
        })
    }

    _errorMessage(code, apiMsg) {
        const messages = {
            0: 'License not found or invalid',
            1: 'License data is incomplete',
            2: 'License has expired',
            3: 'Login successful',
            4: 'Submitted data is incomplete',
            5: 'License is already registered on another device'
        }
        return messages[code] || apiMsg || 'An unknown error occurred'
    }

    // Reset device registration via API
    async resetDevice(licenseKey) {
        return new Promise((resolve, reject) => {
            const postData = new URLSearchParams({
                apikey: this.apiKey,
                key: licenseKey,
                software: 'fboom'
            }).toString()

            const url = new URL('https://api2.solvy.cloud/api/resetdevice')
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }

            const req = https.request(options, (res) => {
                let body = ''
                res.on('data', chunk => body += chunk)
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body)
                        resolve({ success: true, data: result })
                    } catch (e) {
                        resolve({ success: true }) // Still consider it a success for local cleanup
                    }
                })
            })

            req.on('error', (err) => {
                resolve({ success: false, error: err.message })
            })
            req.setTimeout(15000, () => {
                req.destroy()
                resolve({ success: false, error: 'Request timeout' })
            })
            req.write(postData)
            req.end()
        })
    }
}

module.exports = LicenseManager
