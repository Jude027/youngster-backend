// Universal Provider API Handler
// Handles orders for any provider with API configuration
// Note: Uses Node.js built-in fetch (available in Node 18+)

const Provider = require('../models/Provider');
const ProviderAPILog = require('../models/ProviderAPILog');

function getActiveApiConfig(provider) {
    const activeConfig = Array.isArray(provider.apiConfigs)
        ? provider.apiConfigs.find(config => config && config.enabled)
        : null;

    if (activeConfig) return activeConfig;
    return provider.apiConfig && provider.apiConfig.enabled ? provider.apiConfig : null;
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
     * @param {object} orderData - Order details { phoneNumber, packageName, price, etc }
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
        const baseUrl = sanitizedConfig.baseUrl.endsWith('/') ? sanitizedConfig.baseUrl.slice(0, -1) : sanitizedConfig.baseUrl;
        const endpoint = sanitizedConfig.orderEndpoint.startsWith('/') ? sanitizedConfig.orderEndpoint : `/${sanitizedConfig.orderEndpoint}`;
        const url = `${baseUrl}${endpoint}`;
        
        // Map order data to API payload
        const mappedPayload = this.mapPayload(orderData, config.requestPayloadMapping, provider.packageMapping, sanitizedConfig);
        
        console.log('[UniversalAPIHandler] Building API request:', {
            provider: provider.name,
            packageName: orderData.packageName,
            capacity: orderData.capacity,
            mappedPayload: JSON.stringify(mappedPayload),
            packageMapping: provider.packageMapping
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
        for (const [ourField, apiField] of Object.entries(actualMapping)) {
            if (ourField === 'capacity') {
                // Extract the leading numeric value from whatever apiCapacity resolved to.
                // Most APIs (iGet) want a plain number.  DataHub wants a string ("1", "2"…).
                // If the config sets capacityAsString: true, keep it as a string.
                const numericCapacity = parseFloat(
                    String(apiCapacity).match(/^(\d+(?:\.\d+)?)/)?.[1] ?? apiCapacity
                );
                const useString = config && config.capacityAsString;
                payload[apiField] = isNaN(numericCapacity)
                    ? apiCapacity
                    : (useString ? String(numericCapacity) : numericCapacity);

                // iGet API also requires a separate bundleType field alongside capacity.
                // e.g. { capacity: 5, bundleType: "Telecel-5959" }
                // Store apiNetwork on the packageMapping entry to supply this value.
                // Skip this for providers that use apiNetwork for the network key itself
                // (DataHub) — it will be applied in the 'network' branch instead.
                if (pkgMap && pkgMap.apiNetwork && !(config && config.networkKeyFromMapping)) {
                    payload['bundleType'] = pkgMap.apiNetwork;
                }
            } else if (ourField === 'network') {
                // Use config.networkKey if set (e.g. DataHub requires "YELLO" for MTN).
                // Falls back to pkgMap.apiNetwork, then the raw provider/network name.
                payload[apiField] = config.networkKey
                    || (pkgMap && pkgMap.apiNetwork)
                    || orderData.network
                    || orderData.provider;
            } else if (ourField === 'reference') {
                payload[apiField] = orderData.reference || `REF-${Date.now()}`;
            } else if (orderData[ourField] !== undefined) {
                payload[apiField] = orderData[ourField];
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
        // XpresPortal AT Ishare requires type + offerSlug
        const providerKey = (orderData.provider || orderData.network || '').toLowerCase().trim();
        if (providerKey === 'at ishare' || providerKey === 'at_ishare') {
            payload.type = 'single';
            payload.offerSlug = 'airteltigo_ishare_portal';

            if (process.env.XPRES_WEBHOOK_URL) {
                payload.webhookUrl = process.env.XPRES_WEBHOOK_URL;
            } else {
                console.warn('XPRES_WEBHOOK_URL is not set; XpresPortal webhook callbacks may not reach this server.');
            }
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
            'Accept': 'application/json'
        };
        const authMethod = String(config.authMethod || '').toLowerCase();

        // Support both header auth and api-key auth
        if (
            (authMethod === 'header' ||
            authMethod === 'api-key') &&
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
            .replace(/[\u2022\u2023\u2024\u2025\u2043\u22C5]/g, '-') // bullet points
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width characters
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // control characters
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
            const data = await response.json().catch(() => ({}));
            
            return {
                status: response.status,
                headers: response.headers,
                body: data
            };
        } catch (error) {
            console.error('[UniversalAPIHandler] sendAPIRequest failed:', error.message);
            throw new Error(`API request failed: ${error.message}`);
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
        const dataField    = config.dataField    || '';

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
                responseData?.failureReason ||
                (isSuccess ? 'Order successful' : 'Order failed'),
            data: responseData,
            reference:
                response.body.reference ||
                response.body.order?.reference ||
                response.body.order?.orderReference ||
                responseData?.reference ||
                responseData?.orderReference,
            orderId:
                response.body.orderId ||
                response.body.order?.id ||
                responseData?.orderId ||
                responseData?.id,

            orderStatus:
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

            const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
            const endpoint = config.statusEndpoint
                .replace(':reference', reference)
                .replace(':identifier', reference);            
            const url = `${baseUrl}${endpoint}`;

            const headers = this.buildHeaders(config);
            
            console.log('STATUS REQUEST', {
                url,
                reference,
                headers
            });

            const response = await fetch(url, {
                method: config.statusMethod || 'GET',
                headers
            });

            const data = await response.json();
            
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

            const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
            const url = `${baseUrl}${config.balanceEndpoint}`;

            const headers = this.buildHeaders(config);

            const response = await fetch(url, {
                method: config.balanceMethod,
                headers
            });

            const data = await response.json();
            
            return {
                success: response.status === 200,
                balance: data.data?.balance || data.balance,
                currency: 'GHS'
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
