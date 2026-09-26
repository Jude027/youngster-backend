// Universal Provider API Handler
// Handles orders for any provider with API configuration
// Note: Uses Node.js built-in fetch (available in Node 18+)

const Provider = require('../models/Provider');
const ProviderAPILog = require('../models/ProviderAPILog');

function getActiveApiConfig(provider) {
    const configs = Array.isArray(provider.apiConfigs) ? provider.apiConfigs : [];

    // The PRIMARY config is always index 0 (the first one in the array).
    // This is what the admin sees as "[Primary] Default" in the dropdown.
    // It handles VERIFIED numbers — DataHub for MTN, XpresPortal for AT Ishare etc.
    // Secondary configs (index 1, 2...) are for special routing only and are
    // NOT used for standard order processing.
    const primaryConfig = configs.find((c, i) => c && c.enabled && i === 0);
    if (primaryConfig) return primaryConfig;

    // If index-0 is not enabled, try the first enabled config regardless of position
    const firstEnabled = configs.find(c => c && c.enabled);
    if (firstEnabled) return firstEnabled;

    // Fall back to the legacy single apiConfig field
    if (provider.apiConfig?.enabled) return provider.apiConfig;

    return null;
}

/**
 * Normalise a Ghana phone number to international format (233XXXXXXXXX).
 * XpresPortal and some other APIs require this format.
 */
function formatGhanaPhone(phone, format = 'international') {
    const p = String(phone || '').replace(/\D/g, ''); // strip non-digits

    // Normalise to international form first (233XXXXXXXXX)
    let intl;
    if (p.startsWith('233')) intl = p;
    else if (p.startsWith('0')) intl = '233' + p.slice(1);
    else if (p.length === 9) intl = '233' + p;
    else intl = p;

    switch (format) {
        case 'national':
        case 'local':
            // 0XXXXXXXXX — required by iGet's recipientNumber field
            return intl.startsWith('233') ? '0' + intl.slice(3) : intl;

        case 'raw':
            // Digits only (XXXXXXXXX)
            return intl.startsWith('233') ? intl.slice(3) : p;

        case 'e164':
        case 'international':
        default:
            // +233XXXXXXXXX or 233XXXXXXXXX — required by most APIs
            return intl.startsWith('+') ? intl : (intl.startsWith('233') ? intl : '+' + intl);
    }
}

class UniversalAPIHandler {
    /**
     * Process order through provider's configured API
     * @param {string} providerName - Name of the provider
     * @param {object} orderData - Order details { phoneNumber, packageName, price, isUnverified, etc }
     * @returns {Promise<object>} - Response from external API or error
     */
    static async processOrder(providerName, orderData) {
        try {
            // Fetch provider configuration
            const provider = await Provider.findOne({ name: providerName });
            if (!provider) {
                throw new Error(`Provider ${providerName} not found`);
            }

            const activeApiConfig = getActiveApiConfig(provider);
            if (!activeApiConfig) {
                throw new Error(`API not configured for provider ${providerName}`);
            }

            // Build API request
            const apiRequest = this.buildAPIRequest(provider, orderData, activeApiConfig);

            // Log the request
            const log = new ProviderAPILog({
                providerId: provider._id,
                providerName: providerName,
                orderId: orderData.orderId || orderData._id,
                phoneNumber: orderData.phoneNumber,
                packageName: orderData.packageName,
                price: orderData.price,
                apiEndpoint: apiRequest.url,
                apiMethod: apiRequest.method,
                requestPayload: apiRequest.body,
                status: 'processing'
            });

            // Send request to external API
            const response = await this.sendAPIRequest(apiRequest);

            // Parse response
            const parsedResponse = this.parseAPIResponse(provider, response, activeApiConfig);

            // Update log
            log.responseStatus = response.status;
            log.responseData = parsedResponse;
            log.apiReference = parsedResponse.reference || parsedResponse.orderId;
            log.status = parsedResponse.success ? 'success' : 'failed';
            log.responseTime = new Date();

            if (!parsedResponse.success) {
                log.errorMessage = parsedResponse.message || 'Order failed';
            }

            await log.save();

            return {
                success: parsedResponse.success,
                message: parsedResponse.message,
                data: parsedResponse.data,
                apiReference: parsedResponse.reference,
                orderId: parsedResponse.orderId,
                orderStatus: parsedResponse.orderStatus,
                logId: log._id
            };
        } catch (error) {
            console.error('Error processing order:', error);

            return {
                success: false,
                message: error.message,
                error: error.toString()
            };
        }
    }

    /**
     * Build API request based on provider configuration
     */
    static buildAPIRequest(provider, orderData, activeApiConfig = null) {
        const config = activeApiConfig || getActiveApiConfig(provider) || provider.apiConfig;

        // Sanitize config values to remove any problematic Unicode characters
        const sanitizedConfig = {
            ...config,
            baseUrl: this.sanitizeString(config.baseUrl || ''),
            orderEndpoint: this.sanitizeString(config.orderEndpoint || ''),
            statusEndpoint: this.sanitizeString(config.statusEndpoint || ''),
            balanceEndpoint: this.sanitizeString(config.balanceEndpoint || ''),
            authHeaderName: this.sanitizeString(config.authHeaderName || ''),
            authHeaderValue: this.sanitizeString(config.authHeaderValue || ''),
            successField: this.sanitizeString(config.successField || ''),
            dataField: this.sanitizeString(config.dataField || '')
        };

        // Build full URL
        const baseUrl = this.cleanBaseUrl(sanitizedConfig.baseUrl);
        const endpoint = this.cleanEndpoint(sanitizedConfig.orderEndpoint);
        const url = `${baseUrl}${endpoint}`;

        // Map order data to API payload
        const mappedPayload = this.mapPayload(orderData, config.requestPayloadMapping, provider.packageMapping, sanitizedConfig);

        // ── Field-name case normalisation ──────────────────────────────────
        // Admin panel entries are typed by hand and may use wrong casing.
        // DataHub requires camelCase field names — correct silently here so
        // the admin doesn't need to reconfigure.
        const FIELD_ALIASES = {
            'networkkey': 'networkKey',   // "networkkey" → "networkKey"
            'network_key': 'networkKey',
            'Networkkey': 'networkKey',
            'NetworkKey': 'networkKey',
            'phonenumber': 'phoneNumber',
            'phone_number': 'phoneNumber',
            'recipient_number': 'recipient',
        };
        for (const [wrong, correct] of Object.entries(FIELD_ALIASES)) {
            if (wrong in mappedPayload && !(correct in mappedPayload)) {
                mappedPayload[correct] = mappedPayload[wrong];
                delete mappedPayload[wrong];
            }
        }

        console.log('[UniversalAPIHandler] Building API request:', {
            provider: provider.name,
            url,
            method: config.orderMethod,
            packageName: orderData.packageName,
            capacity: orderData.capacity,
            mappedPayload: JSON.stringify(mappedPayload),
            authHeader: sanitizedConfig.authHeaderName,
            authKeyPreview: sanitizedConfig.authHeaderValue
                ? `${String(sanitizedConfig.authHeaderValue).slice(0, 4)}...${String(sanitizedConfig.authHeaderValue).slice(-2)}`
                : '(none)',
        });

        // Build headers using sanitized config
        const headers = this.buildHeaders(sanitizedConfig);

        return {
            url,
            method: config.orderMethod,
            headers,
            body: config.orderMethod === 'GET' ? null : JSON.stringify(mappedPayload),
            fullConfig: sanitizedConfig
        };
    }

    /**
     * Normalise a package name so "5 GB", "5GB", "5gb", "5 gb" all resolve
     * to the same key for comparison against packageMapping entries.
     * Strips whitespace, lowercases, and collapses unit suffixes.
     */
    static normalizePackageName(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '')   // "5 GB" → "5gb"
            .replace(/gigabytes?/, 'gb')
            .replace(/megabytes?/, 'mb');
    }

    /**
     * Find the matching packageMapping entry using a normalised, case-insensitive
     * comparison so "5 GB", "5GB", "5gb" all resolve to the same entry.
     * Falls back to a numeric-GB-value comparison as a last resort.
     */
    static findPackageMap(packageMapping, packageName) {
        if (!packageMapping || packageMapping.length === 0) return null;

        const normTarget = this.normalizePackageName(packageName);

        // 1. Exact normalised match  e.g. "5 GB" === "5GB" after normalize
        let match = packageMapping.find(
            p => this.normalizePackageName(p.packageName) === normTarget
        );
        if (match) return match;

        // 2. Numeric-GB fallback: extract the leading number from both sides
        //    so "5 GB", "5GB", "5" all match a mapping entry of "5GB"
        const targetNum = normTarget.match(/^(\d+(?:\.\d+)?)/)?.[1];
        if (targetNum) {
            match = packageMapping.find(p => {
                const entryNum = this.normalizePackageName(p.packageName)
                    .match(/^(\d+(?:\.\d+)?)/)?.[1];
                return entryNum === targetNum;
            });
        }
        return match || null;
    }

    /**
     * Map internal order data to external API payload
     */
    static mapPayload(orderData, mapping, packageMapping, config) {
        const payload = {};

        // ── Mamsco Enterprise ────────────────────────────────────────────────
        // Mamsco uses one package ID for the MTN DATA package and the selected
        // data size is sent separately as "bundle".
        const isMamsco =
            config &&
            String(config.baseUrl || '').toLowerCase().includes('mamsco');

        if (isMamsco) {
            const MAMSCO_PACKAGE_ID = '65c63dd4b2acfce02a8f1ef5';

            const bundleNumber = parseFloat(
                String(orderData.capacity)
                    .match(/^(\d+(?:\.\d+)?)/)?.[1]
                ?? orderData.capacity
            );

            if (isNaN(bundleNumber)) {
                throw new Error(
                    `Invalid MTN bundle capacity for Mamsco: ${orderData.capacity}`
                );
            }

            const recipient = formatGhanaPhone(
                orderData.phoneNumber,
                'national'
            );

            return {
                orders: [
                    {
                        packageID: MAMSCO_PACKAGE_ID,
                        bundle: String(bundleNumber),
                        recipient,
                        ref: orderData.reference || `REF-${Date.now()}`
                    }
                ]
            };
        }

        // Default mappings if not provided
        const defaultMapping = {
            network: 'network',
            phoneNumber: 'msisdn',
            capacity: 'capacity',
            reference: 'reference'
        };

        const actualMapping = mapping && Object.keys(mapping).length > 0 ? mapping : defaultMapping;

        // Find package mapping to get API capacity (and, optionally, a fixed
        // network/bundleType string e.g. "Telecel-5959" for iGet).
        // Uses normalised comparison so "5 GB", "5GB", "5gb" all resolve
        // to the same entry — preventing the "No active bundle found" error.
        let apiCapacity = orderData.capacity;
        let pkgMap = null;
        if (packageMapping && packageMapping.length > 0) {
            pkgMap = this.findPackageMap(packageMapping, orderData.packageName);
            if (!pkgMap && orderData.capacity) {
                // Secondary fallback: match by raw capacity value
                // (e.g. orderData.capacity = 5 and entry packageName = "5GB")
                pkgMap = this.findPackageMap(packageMapping, String(orderData.capacity));
            }
            if (pkgMap) {
                // Prefer apiBundleId (custom bundle code) if available
                if (pkgMap.apiBundleId !== undefined) {
                    apiCapacity = pkgMap.apiBundleId;
                } else if (pkgMap.apiCapacity !== undefined) {
                    apiCapacity = pkgMap.apiCapacity;
                }
            }
        }

        if (!pkgMap) {
            console.warn(
                `[UniversalAPIHandler] No packageMapping entry found for "${orderData.packageName}"` +
                ` (capacity: ${orderData.capacity}). apiNetwork will not be applied —` +
                ` raw capacity "${apiCapacity}" will be sent. ` +
                `Check that the Provider's packageMapping contains an entry whose packageName matches.`
            );
        }

        // Build payload with mapped fields
        // Trim both key and value of each mapping entry to avoid trailing-space bugs
        // from copy-paste in the admin panel (e.g. "capacity " → "capacity")
        for (const [ourField, apiField] of Object.entries(actualMapping)) {
            const src  = String(ourField).trim();
            const dest = String(apiField).trim();
            if (!src || !dest) continue;

            if (src === 'capacity') {
                const numericCapacity = parseFloat(
                    String(apiCapacity).match(/^(\d+(?:\.\d+)?)/)?.[1] ?? apiCapacity
                );
                const useString = config && config.capacityAsString;
                payload[dest] = isNaN(numericCapacity)
                    ? apiCapacity
                    : (useString ? String(numericCapacity) : numericCapacity);

                if (pkgMap && pkgMap.apiNetwork && !(config && config.networkKeyFromMapping)) {
                    payload['bundleType'] = pkgMap.apiNetwork;
                }
            } else if (src === 'network') {
                payload[dest] = config.networkKey
                    || (pkgMap && pkgMap.apiNetwork)
                    || orderData.network
                    || orderData.provider;
            } else if (src === 'reference') {
                payload[dest] = orderData.reference || `REF-${Date.now()}`;
            } else if (orderData[src] !== undefined) {
                payload[dest] = orderData[src];
            }
        }

        // ── Phone number formatting ──────────────────────────────────────────
        // iGet's recipientNumber field requires local 0XXXXXXXXX format.
        // Auto-detect: if the mapped API field name is "recipientNumber", always
        // use national format regardless of the provider's phoneFormat setting.
        // For all other providers (XpresPortal etc.) use the configured format.
        const phoneFormat = (config && config.phoneFormat) || 'international';
        const phoneFields = ['phone', 'msisdn', 'phoneNumber', 'recipient', 'mobile', 'recipientNumber'];
        let hasPhoneField = false;
        for (const f of phoneFields) {
            if (payload[f]) {
                // recipientNumber always needs local (0XXXXXXXXX) format for iGet
                const fmt = f === 'recipientNumber' ? 'national' : phoneFormat;
                payload[f] = formatGhanaPhone(payload[f], fmt);
                hasPhoneField = true;
                break;
            }
        }
        if (!hasPhoneField && orderData.phoneNumber) {
            payload.msisdn = formatGhanaPhone(orderData.phoneNumber, phoneFormat);
        }

        // ── Provider-specific overrides ──────────────────────────────────────
        // XpresPortal AT Ishare — POST /api/v1/order/airteltigo
        // Required fields: type, phone (233XXXXXXXXX no +), volume (in MB), offerSlug, webhookUrl
        // Minimum volume: 50 MB. Capacity from orderData is in GB — convert to MB.
        const providerKey = (orderData.provider || orderData.network || '').toLowerCase().trim();
        if (providerKey === 'at ishare' || providerKey === 'at_ishare' || providerKey === 'airteltigo') {
            const phoneVal = payload.phone || payload.msisdn || payload.recipient || payload.phoneNumber || payload.recipientNumber || orderData.phoneNumber;

            // Convert GB → MB. orderData.capacity is in GB (e.g. 1 for 1GB → 1024 MB)
            const rawCapacity = payload.volume !== undefined ? payload.volume
                : (payload.capacity !== undefined ? payload.capacity : orderData.capacity);
            const capacityNum = parseFloat(String(rawCapacity).match(/^(\d+(?:\.\d+)?)/)?.[1] ?? rawCapacity);
            // If value is already in MB (≥ 50) leave it; otherwise treat as GB and convert
            const volumeMB = !isNaN(capacityNum)
                ? (capacityNum < 50 ? Math.round(capacityNum * 1024) : Math.round(capacityNum))
                : 1024;

            const offerSlugVal = payload.offerSlug || 'airteltigo_ishare_portal';

            // Clear all previous fields — XpresPortal rejects unknown fields
            for (const key in payload) delete payload[key];

            payload.type      = 'single';
            payload.phone     = formatGhanaPhone(phoneVal, 'international').replace(/^\+/, ''); // 233XXXXXXXXX no +
            payload.volume    = volumeMB;
            payload.offerSlug = offerSlugVal;
            payload.webhookUrl = process.env.XPRES_WEBHOOK_URL
                || `${process.env.BACKEND_URL || 'https://youngster-backend-production.up.railway.app'}/api/webhooks/xpresportal`;

            console.log('[UniversalAPIHandler] AT Ishare payload:', payload);
        }

        // XpresPortal AT Bigtime — POST /api/v1/order/airteltigo (same endpoint, different offerSlug)
        // Volume also in MB.
        if (providerKey === 'at bigtime' || providerKey === 'at_bigtime') {
            const phoneVal = payload.phone || payload.msisdn || payload.recipient || payload.phoneNumber || orderData.phoneNumber;
            const rawCap = payload.volume !== undefined ? payload.volume
                : (payload.capacity !== undefined ? payload.capacity : orderData.capacity);
            const capNum = parseFloat(String(rawCap).match(/^(\d+(?:\.\d+)?)/)?.[1] ?? rawCap);
            const volumeMB = !isNaN(capNum)
                ? (capNum < 50 ? Math.round(capNum * 1024) : Math.round(capNum))
                : 1024;

            for (const key in payload) delete payload[key];

            payload.type      = 'single';
            payload.phone     = formatGhanaPhone(phoneVal, 'international').replace(/^\+/, '');
            payload.volume    = volumeMB;
            payload.offerSlug = 'airteltigo_bigtime';
            payload.webhookUrl = process.env.XPRES_WEBHOOK_URL
                || `${process.env.BACKEND_URL || 'https://youngster-backend-production.up.railway.app'}/api/webhooks/xpresportal`;

            console.log('[UniversalAPIHandler] AT Bigtime payload:', payload);
        }

        // XpresPortal Telecel — POST /order/telecel
        if (providerKey === 'telecel' || providerKey === 'telecel data') {
            payload.type = payload.type || 'single';
            payload.webhookUrl = payload.webhookUrl
                || process.env.XPRES_WEBHOOK_URL
                || `${process.env.BACKEND_URL || 'https://youngster-backend.vercel.app'}/api/webhooks/xpresportal`;
            if (payload.msisdn && !payload.phone) { payload.phone = payload.msisdn; delete payload.msisdn; }
            if (payload.recipient && !payload.phone) { payload.phone = payload.recipient; delete payload.recipient; }
            if (payload.capacity !== undefined && payload.volume === undefined) {
                payload.volume = String(payload.capacity); delete payload.capacity;
            }
            if (payload.phone) payload.phone = formatGhanaPhone(payload.phone, 'international');
            // iGet Telecel bundleType hardcode only applies to iGet — skip for XpresPortal
        }

        // iGet Telecel — all bundle sizes use the same bundleType "Telecel-5959".
        // Only apply this hardcode when:
        //   1. The provider is Telecel, AND
        //   2. No config.networkKey was set (admin hasn't overridden it), AND
        //   3. The payload mapping actually maps something to "bundleType"
        //      (meaning this is an iGet-style config that expects bundleType).
        // This prevents injecting a spurious bundleType into DataHub or XpresPortal
        // payloads if Telecel is ever configured on a different API.
        const payloadHasBundleTypeField = Object.values(actualMapping).includes('bundleType');
        if (
            (providerKey === 'telecel' || providerKey === 'telecel data') &&
            !config.networkKey &&
            payloadHasBundleTypeField
        ) {
            payload.bundleType = 'Telecel-5959';
        }

        return payload;
    }

    /**
     * Build request headers with authentication
     */
    static buildHeaders(config) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Some APIs (XpresPortal, DataHub) restrict keys by domain and reject
            // requests without an Origin header from backend servers.
            'Origin': process.env.BACKEND_ORIGIN || 'https://youngster-backend.vercel.app',
            'Referer': process.env.BACKEND_ORIGIN || 'https://youngster-backend.vercel.app',
        };
        const authMethod = String(config.authMethod || config.type || '').toLowerCase();

        // Support header auth, api-key auth, bearer-token auth, and fallback
        if (
            (authMethod === 'header' ||
                authMethod === 'api-key' ||
                authMethod === 'bearer-token' ||
                !authMethod) &&
            config.authHeaderName &&
            config.authHeaderValue
        ) {
            // Sanitize header name and value to remove problematic Unicode characters
            const headerName = this.sanitizeString(config.authHeaderName);
            const headerValue = this.sanitizeString(config.authHeaderValue);
            headers[headerName] = headerValue;
        }

        // Add any additional headers
        if (
            config.additionalHeaders &&
            typeof config.additionalHeaders === 'object'
        ) {
            const sanitizedHeaders = this.sanitizeObject(config.additionalHeaders);
            Object.assign(headers, sanitizedHeaders);
        }

        return headers;
    }

    /**
     * Sanitize a string by removing problematic Unicode characters
     */
    static sanitizeString(str) {
        if (typeof str !== 'string') return str;
        return str
            .trim()                                                              // strip leading/trailing whitespace
            .replace(/[\u2022\u2023\u2024\u2025\u2043\u22C5]/g, '-')            // bullet points
            .replace(/[\u200B-\u200D\uFEFF]/g, '')                              // zero-width characters
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');                // control characters
    }

    /**
     * Clean base URL by removing trailing commas and slashes
     */
    static cleanBaseUrl(url) {
        if (typeof url !== 'string') return '';
        return url.trim().replace(/,+$/, '').replace(/\/+$/, '');
    }

    /**
     * Clean endpoint by trimming, removing duplicate slashes, and ensuring a leading slash
     */
    static cleanEndpoint(endpoint) {
        if (typeof endpoint !== 'string') return '';
        let cleaned = endpoint.trim();
        if (!cleaned) return '';
        cleaned = cleaned.replace(/^\/+/, '/');
        if (!cleaned.startsWith('/')) {
            cleaned = '/' + cleaned;
        }
        return cleaned;
    }

    /**
     * Send HTTP request to external API
     */
    static async sendAPIRequest(apiRequest) {
        const options = {
            method: apiRequest.method,
            headers: apiRequest.headers
        };

        if (apiRequest.body) {
            // Sanitize body to remove special Unicode characters that might cause encoding issues
            let body = apiRequest.body;
            try {
                // Parse, sanitize, and re-stringify
                const parsed = JSON.parse(body);
                const sanitized = this.sanitizeObject(parsed);
                options.body = JSON.stringify(sanitized);
            } catch (e) {
                // If parsing fails, just use the original body
                options.body = body;
            }
        }

        try {
            const response = await fetch(apiRequest.url, options);
            const text = await response.text();
            let data = {};
            try {
                data = JSON.parse(text);
            } catch (_) { }

            console.log('[UniversalAPIHandler] Raw API response:', {
                url: apiRequest.url,
                status: response.status,
                body: text.slice(0, 500)   // log first 500 chars to avoid flooding
            });

            return {
                status: response.status,
                headers: response.headers,
                body: data,
                text: text
            };
        } catch (error) {
            console.error('[UniversalAPIHandler] sendAPIRequest failed:', {
                message: error.message,
                cause: error.cause?.message,
                code: error.cause?.code,
                errno: error.cause?.errno,
                syscall: error.cause?.syscall,
                hostname: error.cause?.hostname
            });
        
            throw new Error(
                `API request failed: ${error.message}` +
                (error.cause?.code ? ` (${error.cause.code})` : '')
            );
        }
    }

    /**
     * Sanitize object by removing/replacing problematic Unicode characters
     */
    static sanitizeObject(obj) {
        if (typeof obj === 'string') {
            return this.sanitizeString(obj);
        } else if (obj && typeof obj === 'object') {
            if (Array.isArray(obj)) {
                return obj.map(item => this.sanitizeObject(item));
            }
            const sanitized = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    sanitized[key] = this.sanitizeObject(obj[key]);
                }
            }
            return sanitized;
        }
        return obj;
    }

    /**
     * Parse API response based on provider configuration
     */
    static parseAPIResponse(provider, response, activeApiConfig = null) {
        const config = activeApiConfig || getActiveApiConfig(provider) || provider.apiConfig || {};

        // Declare all variables before use
        const successField = config.successField || 'success';
        const dataField = config.dataField || '';

        // Get success status (handle nested fields like "data.success")
        let isSuccess = false;
        if (successField.includes('.')) {
            isSuccess = this.getNestedValue(response.body, successField);
        } else {
            isSuccess = response.body[successField];
        }

        // Get response data (handle nested fields)
        let responseData = response.body;
        if (dataField && dataField.includes('.')) {
            responseData = this.getNestedValue(response.body, dataField) || response.body;
        } else if (dataField && response.body[dataField]) {
            responseData = response.body[dataField];
        }

        return {
            success:
                isSuccess === true ||
                (response.status >= 200 && response.status < 300),
            message:
                response.body.message ||
                response.body.data?.message ||
                responseData?.failureReason ||
                (isSuccess ? 'Order successful' : 'Order failed'),
            data: responseData,
            reference:
                response.body.reference ||
                response.body.data?.reference ||          // DataHub: { success, data: { reference } }
                response.body.order?.reference ||
                response.body.order?.orderReference ||
                responseData?.reference ||
                responseData?.orderReference,
            orderId:
                response.body.orderId ||
                response.body.data?.orderId ||            // DataHub nested orderId
                response.body.data?.orderNumber ||        // DataHub orderNumber alias
                response.body.order?.id ||
                responseData?.orderId ||
                responseData?.orderNumber ||
                responseData?.id,

            orderStatus:
                response.body.data?.status ||             // DataHub: { data: { status } }
                response.body.order?.status ||
                responseData?.status,
            status: response.status
        };
    }

    /**
     * Get nested object value using dot notation
     */
    static getNestedValue(obj, path) {
        return path.split('.').reduce((current, prop) => current?.[prop], obj);
    }

    /**
     * Check order status from external API
     */
    static async checkOrderStatus(providerName, reference) {
        try {
            const provider = await Provider.findOne({ name: providerName });
            const config = provider ? getActiveApiConfig(provider) : null;
            if (!provider || !config || !config.statusEndpoint) {
                throw new Error('Provider or status endpoint not configured');
            }

            const baseUrl = this.cleanBaseUrl(config.baseUrl);
            const endpoint = config.statusEndpoint
                .replace(':reference', reference)
                .replace(':identifier', reference);
            const endpointWithSlash = this.cleanEndpoint(endpoint);
            const url = `${baseUrl}${endpointWithSlash}`;

            const headers = this.buildHeaders(config);

            console.log('STATUS REQUEST', {
                url,
                reference,
                headers: { ...headers, [config.authHeaderName]: '***' }
            });

            const response = await fetch(url, {
                method: config.statusMethod || 'GET',
                headers
            });

            const text = await response.text();
            let data = {};
            try {
                data = JSON.parse(text);
            } catch (e) {
                return {
                    success: false,
                    message: `API returned status ${response.status}: ${text.slice(0, 200)}`
                };
            }

            return this.parseAPIResponse(provider, { status: response.status, body: data }, config);
        } catch (error) {
            console.error('Error checking order status:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Get wallet balance from external API
     */
    static async getBalance(providerName) {
        try {
            const provider = await Provider.findOne({ name: providerName });
            if (!provider) {
                throw new Error('Provider not found');
            }

            const config = getActiveApiConfig(provider);

            // Balance endpoint is optional - if not configured, just return success with no balance
            if (!config || !config.balanceEndpoint) {
                return {
                    success: true,
                    message: 'Balance endpoint not configured for this provider',
                    balance: null,
                    currency: 'GHS'
                };
            }

            const baseUrl = this.cleanBaseUrl(config.baseUrl);
            const endpoint = this.cleanEndpoint(config.balanceEndpoint);
            const url = `${baseUrl}${endpoint}`;

            const headers = this.buildHeaders(config);

            console.log('[UniversalAPIHandler] Fetching balance:', {
                providerName,
                url,
                headers: { ...headers, [config.authHeaderName]: '***' }
            });

            const isXpresPortal = String(config.baseUrl || '').toLowerCase().includes('xpresportal');

            // AT Ishare / AT Bigtime (XpresPortal order-only endpoints) don't have
            // a dedicated balance endpoint — return a friendly message instead of
            // hitting an invalid URL and getting "Invalid request method".
            if (isXpresPortal && (!config.balanceEndpoint || config.balanceEndpoint.includes('order'))) {
                return {
                    success: true,
                    message: 'Balance check not available for this XpresPortal provider. Orders are working if configured correctly.',
                    balance: null,
                    currency: 'GHS'
                };
            }

            const method = isXpresPortal ? 'GET' : (config.balanceMethod && config.balanceMethod.toUpperCase() === 'POST' ? 'POST' : 'GET');

            const response = await fetch(url, {
                method,
                headers
            });

            const text = await response.text();
            let data = {};
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('[UniversalAPIHandler] Failed to parse balance response as JSON:', text);
                return {
                    success: false,
                    message: `API returned status ${response.status}. Expected JSON, got: ${text.slice(0, 200)}`
                };
            }

            if (response.status !== 200) {
                return {
                    success: false,
                    message: data.message || data.error || `API returned status ${response.status}`
                };
            }

            if (isXpresPortal) {
                return {
                    success: data.success === true,
                    balance: data.balance !== undefined ? data.balance : null,
                    currency: data.currency || 'GHS'
                };
            }

            return {
                success: true,
                balance: data.balance ?? data.data?.balance ?? null,
                currency: data.currency || 'GHS'
            };
        } catch (error) {
            console.error('Error getting balance:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = UniversalAPIHandler;
