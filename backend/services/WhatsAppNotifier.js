/**
 * services/WhatsAppNotifier.js
 *
 * Sends WhatsApp messages to the owner's number when an order comes in that
 * needs manual fulfillment. When the owner reacts to the message with ✅,
 * the order is automatically marked as "completed" in the database.
 *
 * Uses Puppeteer + WhatsApp Web (web.whatsapp.com).
 *
 * FIRST-TIME SETUP:
 *   1. Run your server
 *   2. Place a test MTN order
 *   3. A browser window opens showing the WhatsApp Web QR code
 *   4. Scan it with your phone once
 *   5. Session is saved to ./whatsapp-edge-session/ and reused automatically
 *
 * REACTION COMPLETION:
 *   React to any order message with ✅ — the server polls every 2 minutes
 *   and automatically marks the matching order as "completed".
 */

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const EDGE_EXECUTABLE_PATH  = process.env.EDGE_EXECUTABLE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SESSION_DIR           = path.join(__dirname, '../whatsapp-edge-session');
const PENDING_FILE          = path.join(__dirname, '../whatsapp-pending-reactions.json');
const REACTION_POLL_MS      = Number(process.env.WHATSAPP_REACTION_POLL_MS || 2 * 60 * 1000); // 2 minutes
const SESSION_DELETE_RETRIES = 4;

// ── Browser state ─────────────────────────────────────────────────────────────
let _browser     = null;
let _page        = null;
let _isReady     = false;
let _initPromise = null;  // serialises concurrent sends + reaction checks
let _activeSessionDir = SESSION_DIR;

const CHAT_LIST_SELECTOR = '[data-testid="chat-list"], [aria-label="Chat list"]';
const MESSAGE_INPUT_SELECTOR = [
    '[data-testid="conversation-compose-box-input"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-tab]',
].join(', ');

// ── Pending reactions store ───────────────────────────────────────────────────
// Persisted to disk so server restarts don't lose the msgId → orderId mapping.
// Shape: { [whatsappMsgId]: { orderId, ownerNumber, sentAt } }

function loadPending() {
    try {
        if (fs.existsSync(PENDING_FILE)) {
            return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
        }
    } catch { /* corrupt file — start fresh */ }
    return {};
}

function savePending(map) {
    try { fs.writeFileSync(PENDING_FILE, JSON.stringify(map, null, 2)); } catch { }
}

let pendingReactions = loadPending();

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function uniqueSessionDir() {
    return path.join(path.dirname(SESSION_DIR), `whatsapp-edge-session-${Date.now()}`);
}

async function removeSessionDir(dir) {
    if (!fs.existsSync(dir)) return true;

    for (let attempt = 1; attempt <= SESSION_DELETE_RETRIES; attempt++) {
        try {
            fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 500 });
            return true;
        } catch (err) {
            console.warn(`[WhatsApp] Session cleanup attempt ${attempt}/${SESSION_DELETE_RETRIES} failed:`, err.message);
            await sleep(750);
        }
    }

    try {
        const retiredDir = `${dir}-locked-${Date.now()}`;
        fs.renameSync(dir, retiredDir);
        console.warn('[WhatsApp] Session directory was locked; moved it aside:', retiredDir);
        return true;
    } catch (err) {
        console.warn('[WhatsApp] Session directory is still locked; using a fresh temporary session instead:', err.message);
        return false;
    }
}

// ── Message formatters ────────────────────────────────────────────────────────
function formatBundleMessage(provider, order, orderId) {
    const phone    = (order.phoneNumber || order.beneficiary || '').replace(/\s+/g, '');
    const capacity = String(order.capacity || order.packageName || order.bundle_size || order.bundle || '')
        .match(/^(\d+(?:\.\d+)?)/)?.[1] || '';
    const network  = (order.network || provider || order.provider || order.package || '').trim();
    const ref      = orderId ? `\n#ref:${String(orderId).slice(-6)}` : '';
    return `${phone}${capacity ? ` ${capacity}` : ''}\n${network}${ref}`;
}

function formatCompactAfaMessage(order, orderId) {
    const ref = orderId ? `\n#ref:${String(orderId).slice(-6)}` : '';
    return [
        order.fullname  || order.customerName || 'N/A',
        order.phoneNumber || order.beneficiary || 'N/A',
        order.ghanaCard || order.ghanaCardId  || order.ghana_card || 'N/A',
        'Maize farmer',
        order.location  || 'N/A',
    ].join('\n') + ref;
}

// ── Session reset ─────────────────────────────────────────────────────────────
async function clearSession() {
    // Kill any open browser first
    if (_browser) {
        try { await _browser.close(); } catch { }
        _browser = null;
        _page    = null;
        _isReady = false;
    }
    // Delete the Edge session directory so the next launch shows a fresh QR
    _activeSessionDir = SESSION_DIR;
    if (fs.existsSync(SESSION_DIR)) {
        const cleared = await removeSessionDir(SESSION_DIR);
        if (!cleared) {
            _activeSessionDir = uniqueSessionDir();
            console.warn('[WhatsApp] Fresh session path selected:', _activeSessionDir);
        }
        console.log('[WhatsApp] Session directory cleared — next launch will show QR code.');
    }
    // Also clear the regular session dir if present
    const altSession = path.join(__dirname, '../whatsapp-session');
    if (fs.existsSync(altSession)) {
        await removeSessionDir(altSession);
    }
}

// ── Browser lifecycle ─────────────────────────────────────────────────────────
// Maximum time (ms) to wait for WhatsApp Web to become ready after launch.
// If the session is expired/corrupt, the page stalls forever — this cap ensures
// we fail fast instead of blocking every WhatsApp order indefinitely.
const WA_READY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

async function getBrowser() {
    if (_browser && _page && _isReady) return { browser: _browser, page: _page };

    // Already launched but waiting for QR — reuse and wait (with timeout)
    if (_browser && _page && !_isReady) {
        console.log('[WhatsApp] Browser already open — waiting for WhatsApp to become ready (scan QR if shown)...');
        try {
            await _page.waitForSelector(CHAT_LIST_SELECTOR, { timeout: WA_READY_TIMEOUT_MS });
            _isReady = true;
        } catch {
            // Timed out — session is likely stale; reset so next call tries fresh
            console.error('[WhatsApp] Timed out waiting for chat list — clearing session for fresh QR on next attempt.');
            await clearSession();
            throw new Error('WhatsApp session expired or not logged in. Please scan the QR code — the server will show a browser window on the next order.');
        }
        return { browser: _browser, page: _page };
    }

    // ── Fresh launch ──────────────────────────────────────────────────────────
    if (!fs.existsSync(_activeSessionDir)) fs.mkdirSync(_activeSessionDir, { recursive: true });
    const sessionExists = fs.readdirSync(_activeSessionDir).length > 0;
    const useEdge       = fs.existsSync(EDGE_EXECUTABLE_PATH);

    console.log('[WhatsApp] Launching browser...', sessionExists ? '(session found)' : '(first run — scan QR)',
        useEdge ? 'using Microsoft Edge' : 'using Puppeteer default', `session: ${_activeSessionDir}`);

    // On Railway/Linux there is no display — always run headless.
    // Locally (Windows/Mac) we run headed so the QR code is visible for first-time setup.
    const isHeadless = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || !process.env.DISPLAY && process.platform !== 'win32' && process.platform !== 'darwin';

    _browser = await puppeteer.launch({
        headless: isHeadless ? 'new' : false,
        ...(useEdge && !isHeadless ? { executablePath: EDGE_EXECUTABLE_PATH } : {}),
        userDataDir:   _activeSessionDir,
        handleSIGINT:  false,
        handleSIGTERM: false,
        handleSIGHUP:  false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--profile-directory=Default',
            '--unlimited-storage',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
        ],
        defaultViewport: { width: 1280, height: 800 },
    });

    _browser.on('disconnected', () => {
        console.warn('[WhatsApp] Browser disconnected — will relaunch on next order.');
        _browser = null;
        _page    = null;
        _isReady = false;
    });

    _page = await _browser.newPage();
    _page.setDefaultNavigationTimeout(0);
    _page.setDefaultTimeout(0);

    await _page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    _page.on('error',     err => console.warn('[WhatsApp] Page crashed:',  err.message));
    _page.on('pageerror', err => console.warn('[WhatsApp] Page JS error:', err.message));
    // Auto-dismiss "Leave site?" / "Leave page?" dialogs that WhatsApp Web
    // triggers via its beforeunload handler whenever we navigate between chats.
    _page.on('dialog', async (dialog) => {
        console.log('[WhatsApp] Auto-dismissing dialog:', dialog.message());
        await dialog.accept().catch(() => {});
    });
    _page.on('console',   msg => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // Suppress WhatsApp's own telemetry/CORS noise — not actionable
        if (text.includes('dit.whatsapp.net') || text.includes('deidentified_telemetry')) return;
        console.warn('[WhatsApp][page]', text);
    });
    _page.on('requestfailed', () => {});

    // Grant storage + clipboard so WhatsApp Web can initialise properly
    const context = _browser.defaultBrowserContext();
    await context.overridePermissions('https://web.whatsapp.com', [
        'persistent-storage',
        'notifications',
        'clipboard-read',
        'clipboard-write',
    ]);

    console.log('[WhatsApp] Opening WhatsApp Web...');
    try {
        await _page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 0 });
    } catch (err) {
        console.warn('[WhatsApp] Navigation warning (still waiting for chat list):', err.message);
    }

    // On Railway (headless), if session is not yet established, poll for a QR code
    // canvas and print it as ASCII to the logs so you can scan it from the dashboard.
    if (isHeadless && !sessionExists) {
        console.log('[WhatsApp] Headless mode — watching for QR code canvas to appear in logs...');
        let qrPrinted = false;
        for (let i = 0; i < 30 && !qrPrinted; i++) {
            await sleep(2000);
            try {
                const qrDataUrl = await _page.evaluate(() => {
                    // WhatsApp Web renders the QR as a <canvas> element
                    const canvas = document.querySelector('canvas');
                    if (!canvas) return null;
                    return canvas.toDataURL('image/png');
                });
                if (qrDataUrl) {
                    // Print instructions — user can use an online base64-to-QR tool
                    console.log('[WhatsApp] ══════════════════════════════════════════════');
                    console.log('[WhatsApp] QR CODE DETECTED — scan it with your phone:');
                    console.log('[WhatsApp] 1. Copy the data URL below');
                    console.log('[WhatsApp] 2. Paste it at https://base64.guru/tools/png-to-qr');
                    console.log('[WhatsApp] 3. Scan the QR with WhatsApp on your phone');
                    console.log('[WhatsApp] DATA URL (first 200 chars):', qrDataUrl.substring(0, 200));
                    console.log('[WhatsApp] FULL DATA URL:');
                    // Print in chunks so Railway logs don't truncate it
                    for (let j = 0; j < qrDataUrl.length; j += 500) {
                        console.log(qrDataUrl.substring(j, j + 500));
                    }
                    console.log('[WhatsApp] ══════════════════════════════════════════════');
                    qrPrinted = true;
                }
            } catch { /* keep trying */ }
        }
    }

    console.log(`[WhatsApp] Waiting for chat list (timeout: ${WA_READY_TIMEOUT_MS / 1000}s) — scan QR if shown. Browser stays open.`);
    try {
        await _page.waitForSelector(CHAT_LIST_SELECTOR, { timeout: WA_READY_TIMEOUT_MS });
    } catch (err) {
        // Session stale or QR never scanned — clear so next attempt shows fresh QR
        console.error('[WhatsApp] Timed out waiting for WhatsApp to load. Clearing session so next attempt shows a fresh QR code.');
        await clearSession();
        throw new Error('WhatsApp not logged in — session cleared. A fresh QR code will appear on the next order. Please scan it.');
    }

    _isReady = true;
    console.log('[WhatsApp] ✅ WhatsApp Web is ready.');
    return { browser: _browser, page: _page };
}

// ── Navigate to chat without waiting for compose box (for reading only) ────────
async function navigateToChatReadOnly(page, phoneNumber) {
    const url = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=&type=phone_number&app_absent=0`;
    await page.evaluate((u) => {
        window.onbeforeunload = null;
        try { window.removeEventListener('beforeunload', window.onbeforeunload); } catch (_) {}
        window.location.href = u;
    }, url);

    // Wait for chat messages to appear — don't require compose box
    for (let i = 1; i <= 60; i++) {
        await sleep(1000);
        const ready = await page.evaluate(() => {
            // Chat is loaded when we see message list or the pane itself
            return !!(
                document.querySelector('[data-testid="msg-container"]') ||
                document.querySelector('[class*="message-list"]') ||
                document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                document.querySelector('[role="application"][data-js-navbar]') ||
                document.querySelector('div[data-id]') // individual message bubbles
            );
        }).catch(() => false);
        if (ready) return;
        if (i % 15 === 0) console.log(`[WhatsApp] Still waiting for chat (read-only)... (${i}s)`);
    }
    // Don't throw — just proceed and try to read whatever is on screen
    console.warn(`[WhatsApp] Could not confirm chat loaded for ${phoneNumber} — attempting read anyway`);
}

// ── Navigate to a chat (safe — uses window.location, not page.goto) ───────────
async function navigateToChat(page, phoneNumber) {
    const url = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=&type=phone_number&app_absent=0`;
    await page.evaluate((u) => {
        window.onbeforeunload = null;
        try { window.removeEventListener('beforeunload', window.onbeforeunload); } catch (_) {}
        window.location.href = u;
    }, url);

    // Poll for compose box or network-error dialog
    for (let i = 1; i <= 300; i++) {
        await sleep(1000);

        const state = await page.evaluate((sel) => {
            if (document.querySelector(sel)) return 'ready';
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [data-testid="alert-dialog"]'));
            if (dialogs.some(d => (d.innerText || '').toLowerCase().includes('network error'))) return 'network-error';
            return 'loading';
        }, MESSAGE_INPUT_SELECTOR).catch(() => 'loading');

        if (state === 'ready') return;

        if (state === 'network-error') {
            console.log(`[WhatsApp] Network error dialog — dismissing and retrying...`);
            await page.evaluate(() => {
                document.querySelectorAll('[role="dialog"], [data-testid="alert-dialog"]').forEach(d => {
                    if ((d.innerText || '').toLowerCase().includes('network error')) {
                        const btn = d.querySelector('button');
                        if (btn) btn.click();
                    }
                });
            }).catch(() => {});
            await sleep(1500);
            await page.evaluate((u) => { window.location.href = u; }, url).catch(() => {});
        }

        if (i % 10 === 0) console.log(`[WhatsApp] Still waiting for compose box... (${i}s)`);
    }

    throw new Error(`Compose box did not appear after 5 minutes for ${phoneNumber}`);
}

// ── Send a message and register it for reaction tracking ─────────────────────
async function _sendMessageInternal(number, message, orderId, ownerNumber) {
    const { page } = await getBrowser();

    console.log(`[WhatsApp] Opening chat with ${number}...`);
    await navigateToChat(page, number);

    // Paste using ClipboardEvent — the only method that preserves \n in WhatsApp
    await page.evaluate((sel, msg) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error('Compose box not found');
        el.focus();
        const dt = new DataTransfer();
        dt.setData('text/plain', msg);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, MESSAGE_INPUT_SELECTOR, message);

    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(2500);

    // Register for reaction tracking using the #ref: we embedded in the message.
    // This is far more reliable than trying to capture WhatsApp's internal data-id.
    if (orderId) {
        const shortRef = String(orderId).slice(-6);
        pendingReactions[shortRef] = { orderId: String(orderId), ownerNumber, sentAt: Date.now() };
        savePending(pendingReactions);
        console.log(`[WhatsApp] Registered order ${orderId} for reaction tracking (ref: ${shortRef})`);
    }

    console.log(`[WhatsApp] ✅ Message sent to ${number}`);
    return { success: true };
}

// ── Public send with serialisation ───────────────────────────────────────────
async function sendMessage(toNumber, message, orderId = null, ownerNumber = null) {
    const number = String(toNumber).replace(/[^0-9]/g, '');
    if (!number) throw new Error('WhatsApp: invalid phone number');

    if (_initPromise) await _initPromise;
    _initPromise = _sendMessageInternal(number, message, orderId, ownerNumber);
    try {
        return await _initPromise;
    } finally {
        _initPromise = null;
    }
}

// ── Reaction poller ───────────────────────────────────────────────────────────
let _reactionPollerStarted = false;

async function switchToChat(page, phoneNumber) {
    // Use WhatsApp's search box to switch chats without a full page navigation.
    // This avoids the reload/wait-for-chat-load cycle entirely.
    try {
        // Click the search icon / search box
        const searchClicked = await page.evaluate(() => {
            const searchBtn = document.querySelector(
                '[data-testid="search"], [data-testid="menu-bar-search"], button[aria-label*="search" i], [class*="search-bar"]'
            );
            if (searchBtn) { searchBtn.click(); return true; }
            return false;
        });
        if (!searchClicked) return false;
        await sleep(500);

        // Type the phone number to find the contact
        const searchInput = await page.$('[data-testid="search-input"], input[type="text"][class*="search"]');
        if (!searchInput) return false;
        await searchInput.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await searchInput.type(phoneNumber.replace(/^233/, '0'), { delay: 30 });
        await sleep(1500);

        // Click the first search result
        const resultClicked = await page.evaluate(() => {
            const result = document.querySelector(
                '[data-testid="cell-frame-container"], [class*="chat-list"] [role="listitem"]'
            );
            if (result) { result.click(); return true; }
            return false;
        });
        await sleep(1500);
        return resultClicked;
    } catch { return false; }
}

async function scanPageForReactedRefs(page) {
    // WhatsApp Web renders emoji reactions as separate DOM elements —
    // they do NOT appear in message innerText. Two strategies:
    // 1. Look for reaction emoji elements near messages containing #ref: codes
    // 2. Fall back to innerText scan (catches cases where WhatsApp copies emoji into text)
    return page.evaluate(() => {
        const found = [];
        const CHECK_MARK = '✅';

        // Strategy 1: Find messages that have a ✅ reaction overlay
        // WhatsApp uses data-testid="reaction" or aria-label containing the emoji
        const reactionEls = Array.from(document.querySelectorAll(
            '[data-testid="reaction"], [data-testid="reaction-list-btn"], ' +
            '[aria-label*="✅"], [class*="reaction"]'
        ));

        for (const reactionEl of reactionEls) {
            const emojiText = reactionEl.textContent || reactionEl.getAttribute('aria-label') || '';
            if (!emojiText.includes(CHECK_MARK)) continue;

            // Walk up to find the parent message bubble
            let node = reactionEl;
            for (let i = 0; i < 10 && node; i++) {
                node = node.parentElement;
                const bubbleText = node?.innerText || node?.textContent || '';
                const refMatch = bubbleText.match(/#ref:([a-f0-9]{6})/i);
                if (refMatch) {
                    found.push(refMatch[1].toLowerCase());
                    break;
                }
            }
        }

        // Strategy 2: Scan all message text (catches copy-pasted ✅ in message text)
        document.querySelectorAll('[data-id], [class*="message-in"], [class*="message-out"]').forEach(el => {
            const text = el.innerText || el.textContent || '';
            if (!text.includes(CHECK_MARK)) return;
            const match = text.match(/#ref:([a-f0-9]{6})/i);
            if (match) found.push(match[1].toLowerCase());
        });

        return [...new Set(found)];
    }).catch(() => []);
}

async function checkReactions() {
    const entries = Object.entries(pendingReactions);
    if (entries.length === 0 || !_page || !_isReady) return;

    console.log(`[WhatsApp] Checking reactions for ${entries.length} pending order(s)...`);

    // Group by ownerNumber to minimise page navigations
    const byNumber = {};
    for (const [msgId, info] of entries) {
        const n = info.ownerNumber;
        if (!byNumber[n]) byNumber[n] = [];
        byNumber[n].push({ msgId, ...info });
    }

    const Order = require('../models/Order');

    for (const [ownerNumber, orders] of Object.entries(byNumber)) {
        try {
            // Check if we're already on this chat — if so, no navigation needed
            const alreadyOnChat = await _page.evaluate((num) => {
                const header = document.querySelector('[data-testid="conversation-header"], [class*="chat-header"]');
                const headerText = header?.innerText || header?.textContent || '';
                return headerText.includes(num.replace(/^233/, '0')) || headerText.includes(num);
            }, ownerNumber).catch(() => false);

            if (!alreadyOnChat) {
                // Try search-based switch first (no page reload)
                const switched = await switchToChat(_page, ownerNumber);
                if (!switched) {
                    // Fall back to full navigation
                    await navigateToChatReadOnly(_page, ownerNumber);
                }
                await sleep(2000); // let messages render
            }

            const reactedRefs = await scanPageForReactedRefs(_page);
            console.log(`[WhatsApp] Reaction scan found refs: ${reactedRefs.join(', ') || 'none'}`);

            for (const shortRef of reactedRefs) {
                const info = orders.find(o => String(o.orderId).slice(-6) === shortRef);
                if (!info) continue;

                console.log(`[WhatsApp] ✅ Reaction detected for ref ${shortRef} — marking order ${info.orderId} as completed`);
                try {
                    await Order.findByIdAndUpdate(info.orderId, {
                        status:           'Completed',
                        completed:        new Date(),
                        lastStatusUpdate: new Date(),
                    });
                    console.log(`[WhatsApp] Order ${info.orderId} updated to completed ✅`);
                } catch (dbErr) {
                    console.error(`[WhatsApp] DB update failed for order ${info.orderId}:`, dbErr.message);
                    continue;
                }
                delete pendingReactions[shortRef];
                savePending(pendingReactions);
            }
        } catch (err) {
            console.warn(`[WhatsApp] Reaction check failed for ${ownerNumber}:`, err.message);
        }
    }
}

async function checkReactionsLocked() {
    // Wait for any in-progress send before navigating
    if (_initPromise) await _initPromise;
    _initPromise = checkReactions();
    try {
        await _initPromise;
    } finally {
        _initPromise = null;
    }
}

function startReactionPoller() {
    if (_reactionPollerStarted) return;
    _reactionPollerStarted = true;

    const poll = async () => {
        try {
            await checkReactionsLocked();
        } catch (err) {
            console.warn('[WhatsApp] Reaction poller error:', err.message);
        }
        setTimeout(poll, REACTION_POLL_MS);
    };

    // First check after 30 seconds (give browser time to initialise)
    setTimeout(poll, 30 * 1000);
    console.log(`[WhatsApp] Reaction poller started — checking every ${REACTION_POLL_MS / 60000} minute(s)`);
}

// ── Main export ───────────────────────────────────────────────────────────────
async function notifyMtnOrder(provider, orderData) {
    const isAfa = provider.toLowerCase().includes('afa');

    const ownerNumber = isAfa
        ? process.env.MTN_AFA_WHATSAPP_NUMBER
        : (process.env.ORDER_WHATSAPP_NUMBER || process.env.MTN_WHATSAPP_NUMBER);

    if (!ownerNumber) {
        const envKey = isAfa ? 'MTN_AFA_WHATSAPP_NUMBER' : 'ORDER_WHATSAPP_NUMBER or MTN_WHATSAPP_NUMBER';
        console.error(`[WhatsApp] ${envKey} not set in .env`);
        return { success: false, message: `${envKey} not configured in .env` };
    }

    const orderId = orderData.orderId || orderData._id || null;

    const message = isAfa
        ? formatCompactAfaMessage(orderData, orderId)
        : formatBundleMessage(provider, orderData, orderId);

    try {
        // Normalise owner number to digits only for navigating to chat
        const ownerDigits = String(ownerNumber).replace(/[^0-9]/g, '');
        try {
            await sendMessage(ownerDigits, message, orderId, ownerDigits);
        } catch (err) {
            const shouldRetryWithFreshSession = /session expired|not logged in|session cleared|EPERM|EBUSY/i.test(err.message);
            if (!shouldRetryWithFreshSession) throw err;

            console.warn('[WhatsApp] Send failed because the browser session is stale or locked. Resetting session and retrying once:', err.message);
            await clearSession();
            await sendMessage(ownerDigits, message, orderId, ownerDigits);
        }

        // Start polling for ✅ reactions if not already running
        startReactionPoller();

        // Return the shortRef as apiReference so server.js saves it as
        // providerReference — the status updater uses this to identify
        // WhatsApp-fulfillment orders and skip API polling for them.
        const shortRef = orderId ? `WA-${String(orderId).slice(-6)}` : null;

        return {
            success:           true,
            message:           `Order notification sent to WhatsApp (${ownerNumber})`,
            orderStatus:       'Processing',
            actionRequired:    'MANUAL_FULFILLMENT',
            apiReference:      shortRef,   // saved as providerReference on the Order
            fulfillmentMethod: 'whatsapp',
        };
    } catch (err) {
        console.error('[WhatsApp] Failed to send notification:', err.message);
        return {
            success:     false,
            message:     `WhatsApp notification failed: ${err.message}`,
            orderStatus: 'Processing',
        };
    }
}

module.exports = { notifyMtnOrder, sendMessage, clearSession };
