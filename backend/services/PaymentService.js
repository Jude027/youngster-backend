// Payment Gateway Service
// Handles payment processing through Moolre payment gateway

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PaymentGateway = require('../models/PaymentGateway');
const PaymentTransaction = require('../models/PaymentTransaction');

// File-based logger for debugging
function debugLog(label, data) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${label}: ${JSON.stringify(data, null, 2)}\n`;
    const logFile = path.join(__dirname, '../payment-debug.log');
    fs.appendFileSync(logFile, message);
    console.log(label, data);
}

class PaymentService {

    /**
     * Build Moolre auth headers.
     * Per Moolre API docs, only X-API-USER and X-API-PUBKEY are required.
     */
    static getMoolreHeaders(gateway) {
        return {
            'Content-Type': 'application/json',
            'X-API-USER':   gateway.apiUser || '',
            'X-API-PUBKEY': gateway.pubKey  || '',
        };
    }

    /**
     * Initiate a payment transaction
     */
    static async initiatePayment(gatewayName, paymentData) {
        try {
            console.log('\n' + '='.repeat(80));
            console.log('💳 PAYMENT INITIATION START', {
                gatewayName,
                phoneNumber: paymentData.phoneNumber,
                amount: paymentData.amount,
                provider: paymentData.provider,
                userId: paymentData.userId,
                timestamp: new Date().toISOString()
            });

            const gateway = await PaymentGateway.findOne({ name: gatewayName, enabled: true });
            if (!gateway) {
                throw new Error(`Payment gateway "${gatewayName}" not found or not enabled`);
            }

            console.log('✅ Gateway found:', {
                name:         gateway.name,
                enabled:      gateway.enabled,
                type:         gateway.type,
                isTestMode:   gateway.isTestMode,
                callbackUrl:  gateway.callbackUrl || '(NOT SET)',
                hasApiUser:   !!gateway.apiUser,
                hasApiKey:    !!gateway.apiKey,
                hasPubKey:    !!gateway.pubKey,
                hasVasKey:    !!gateway.vasKey,
            });

            // Validate amount
            if (paymentData.amount < gateway.minAmount || paymentData.amount > gateway.maxAmount) {
                throw new Error(`Amount must be between GHS ${gateway.minAmount} and GHS ${gateway.maxAmount}`);
            }

            // Fee calculation
            const transactionFee = this.calculateFee(paymentData.amount, gateway);
            const totalAmount    = paymentData.amount + transactionFee;

            // Unique transaction reference
            const transactionId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            console.log('📋 Transaction ID:', { transactionId, totalAmount, transactionFee });

            // Save pending transaction record
            const transaction = new PaymentTransaction({
                userId:         paymentData.userId,
                storeSlug:      paymentData.storeSlug || paymentData.metadata?.storeSlug || '',
                clientType:     paymentData.clientType || paymentData.metadata?.clientType || '',
                paymentGateway: gatewayName,
                provider:       paymentData.orderProvider || paymentData.provider,
                paymentNetwork: paymentData.paymentNetwork || paymentData.provider,
                phoneNumber:    paymentData.phoneNumber,
                amount:         paymentData.amount,
                transactionFee: transactionFee,
                totalAmount:    totalAmount,
                transactionId:  transactionId,
                status:         'processing',
                description:    paymentData.description || `Payment for ${paymentData.provider}`,
                packageName:    paymentData.packageName || '',
                bundle:         paymentData.bundle_size || paymentData.bundle || '',
                metadata:       {
                    ...(paymentData.metadata || {}),
                    packageName: paymentData.packageName || '',
                    bundle_size: paymentData.bundle_size || '',
                    storeSlug:   paymentData.storeSlug   || '',
                    clientType:  paymentData.clientType  || '',
                    guestSessionId: paymentData.guestSessionId || paymentData.metadata?.guestSessionId || null,
                    beneficiary: paymentData.beneficiary || paymentData.recipientPhoneNumber || '',
                    paymentNetwork: paymentData.paymentNetwork || paymentData.provider || '',
                    orderProvider: paymentData.orderProvider || paymentData.provider || '',
                }
            });
            await transaction.save();
            console.log('✅ PaymentTransaction saved:', { transactionId, status: 'processing' });

            if (gateway.type === 'hosted-checkout' || gateway.posLink) {
                const redirectUrl = this.buildHostedCheckoutUrl(gateway, paymentData, transactionId, totalAmount);
                transaction.redirectUrl = redirectUrl;
                await transaction.save();

                console.log('🔗 Hosted checkout payment created:', { transactionId, redirectUrl });
                console.log('='.repeat(80) + '\n');

                return {
                    success: true,
                    transactionId,
                    redirectUrl,
                    hostedCheckout: true,
                    message: 'Redirecting to secure payment page',
                    transaction
                };
            }

            // ── Moolre USSD Direct Debit ───────────────────────────────────────────
            // Call Moolre collections API — sends a USSD prompt to the customer's phone.
            // If Moolre responds with TP14, an OTP was sent to the customer first.
            const result = await this.processMoolreCollection(gateway, paymentData, transactionId, totalAmount);

            if (!result.success) {
                transaction.status       = 'failed';
                transaction.errorMessage = result.message;
                await transaction.save();
                return { success: false, message: result.message, transactionId };
            }

            // TP14: OTP required — keep transaction processing, tell frontend to show OTP page
            if (result.requiresOtp) {
                transaction.status = 'processing';
                await transaction.save();
                console.log('🔐 OTP required for transaction:', transactionId);
                console.log('='.repeat(80) + '\n');
                return {
                    success:       true,
                    requiresOtp:   true,
                    transactionId: transactionId,
                    message:       result.message,
                    transaction:   transaction,
                };
            }

            // USSD prompt sent — webhook will update status when customer approves/rejects
            if (result.gatewayTransactionId) {
                transaction.gatewayTransactionId = result.gatewayTransactionId;
                await transaction.save();
            }

            console.log('✅ USSD prompt sent to customer phone');
            console.log('='.repeat(80) + '\n');

            return {
                success:       true,
                transactionId: transactionId,
                message:       result.message || 'Payment prompt sent to your phone',
                transaction:   transaction,
            };

        } catch (error) {
            console.error('❌ Payment initiation error:', error.message);
            console.error('Stack:', error.stack);
            console.log('='.repeat(80) + '\n');
            return {
                success: false,
                message: error.message,
                error:   error.toString()
            };
        }
    }

    static buildHostedCheckoutUrl(gateway, paymentData, transactionId, amount) {
        const configuredUrl = gateway.posLink || gateway.redirectUrl;
        if (!configuredUrl) {
            throw new Error('Hosted checkout is enabled but no POS/redirect payment link is configured');
        }

        try {
            const url = new URL(configuredUrl);
            const params = {
                externalref: transactionId,
                reference: transactionId,
                amount: parseFloat(amount.toFixed(2)),
                phone: paymentData.phoneNumber,
                payer: paymentData.phoneNumber,
                description: paymentData.description || `${paymentData.provider} Bundle`,
                callback_url: gateway.callbackUrl || '',
                redirect_url: gateway.redirectUrl || ''
            };

            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
            return url.toString();
        } catch (_) {
            return configuredUrl;
        }
    }

    /**
     * Process payment through Moolre Collections API
     *
     * Endpoint : POST https://api.moolre.com/open/transact/payment
     * Headers  : X-API-USER, X-API-PUBKEY
     * Body     : { type, channel, currency, payer, amount, externalref,
     *              reference, accountnumber }
     *
     * Channel codes: 13=MTN, 6=Telecel, 7=AT
     */
    static async processMoolreCollection(gateway, paymentData, transactionId, amount) {
        // Map provider name → Moolre numeric channel code (from Moolre docs)
        // 13=MTN, 6=Telecel, 7=AT
        const CHANNEL_MAP = {
            'MTN':         '13',
            'MTN EXPRESS': '13',
            'TELECEL':     '6',
            'AT':          '7',
            'AT ISHARE':   '7',
            'AT BIGTIME':  '7',
            'AIRTELTIGO':  '7',
        };
        const providerKey = (paymentData.paymentNetwork || paymentData.provider || '').toUpperCase().trim();
        const channelCode = CHANNEL_MAP[providerKey] || '13';

        const baseUrl = (gateway.apiBaseUrl || 'https://api.moolre.com').replace(/\/+$/, '');
        const url     = `${baseUrl}/open/transact/payment`;

        // accountnumber is the merchant's Moolre wallet account number.
        // Stored in gateway.accountNumber; falls back to gateway.apiKey for
        // backwards-compat with configs that stored it there.
        const accountnumber = gateway.accountNumber || gateway.apiKey || '';

        const requestBody = {
            type:          1,
            channel:       channelCode,
            currency:      'GHS',
            payer:         paymentData.phoneNumber,
            amount:        parseFloat(amount.toFixed(2)),
            externalref:   transactionId,          // our unique ref — returned in webhook
            reference:     paymentData.description || `${paymentData.provider} Bundle`,
            accountnumber: accountnumber,
        };

        const headers = this.getMoolreHeaders(gateway);

        console.log('=== MOOLRE COLLECTION DEBUG ===');
        console.log('URL:', url);
        console.log('Channel:', channelCode, '(provider:', providerKey, ')');
        console.log('Amount:', requestBody.amount);
        console.log('Externalref:', transactionId);
        console.log('Headers (keys only):', Object.keys(headers));
        console.log('Request body:', JSON.stringify(requestBody));

        const response = await fetch(url, {
            method:  'POST',
            headers: headers,
            body:    JSON.stringify(requestBody),
        });

        const rawText = await response.text();
        console.log('Moolre raw response (status ' + response.status + '):', rawText.substring(0, 500));

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            throw new Error(`Moolre returned non-JSON (HTTP ${response.status}): ${rawText.substring(0, 300)}`);
        }

        debugLog('📡 Moolre collection response', { status: response.status, data });

        // ── TP14: OTP verification required ──────────────────────────────────────
        // Moolre sent an OTP SMS to the customer. The frontend must collect it
        // and re-submit via POST /api/payment/verify-otp.
        if (data.code === 'TP14') {
            console.log('🔐 Moolre requires OTP verification — SMS sent to customer');
            return {
                success:     true,
                requiresOtp: true,
                transactionId,
                message:     data.message || 'OTP sent to customer. Please enter it to continue.',
            };
        }

        // Moolre returns status:"0" for errors, status:"1" for success.
        const statusStr = String(data.status ?? '');
        const isSuccess = statusStr === '1';

        // Moolre's own transaction ID comes back in data.data.transactionid
        const gatewayRef = data.data?.transactionid
            || data.data?.id
            || transactionId;

        if (!isSuccess) {
            const errMsg = data.message || data.code || `HTTP ${response.status}`;
            throw new Error(`Moolre error: ${errMsg}`);
        }

        return {
            success:              true,
            gatewayTransactionId: gatewayRef,
            response:             data,
            message:              data.message || 'Payment prompt sent to customer phone',
        };
    }

    /**
     * Submit OTP for Moolre payment verification (called after TP14 response).
     * Re-calls the same collections endpoint with the otpcode added.
     * On success Moolre sends the USSD payment prompt to the customer's phone.
     */
    static async verifyOtp(transactionId, otpCode) {
        console.log('🔐 verifyOtp called', { transactionId, otpCodeLength: otpCode?.length });

        const transaction = await PaymentTransaction.findOne({ transactionId });
        if (!transaction) throw new Error('Transaction not found');

        const gateway = await PaymentGateway.findOne({ name: transaction.paymentGateway, enabled: true });
        if (!gateway) throw new Error('Payment gateway not found');

        const CHANNEL_MAP = {
            'MTN': '13', 'MTN EXPRESS': '13',
            'TELECEL': '6',
            'AT': '7', 'AT ISHARE': '7', 'AT BIGTIME': '7', 'AIRTELTIGO': '7',
        };
        const providerKey   = (transaction.paymentNetwork || transaction.metadata?.paymentNetwork || transaction.provider || '').toUpperCase().trim();
        const channelCode   = CHANNEL_MAP[providerKey] || '13';
        const accountnumber = gateway.accountNumber || gateway.apiKey || '';
        const baseUrl       = (gateway.apiBaseUrl || 'https://api.moolre.com').replace(/\/+$/, '');

        // Safely resolve amount — totalAmount may be null/undefined on older transactions
        const resolvedAmount = parseFloat(
            (Number(transaction.totalAmount ?? transaction.amount ?? 0)).toFixed(2)
        );

        console.log('🔐 verifyOtp amounts', {
            totalAmount: transaction.totalAmount,
            amount: transaction.amount,
            resolvedAmount
        });

        const body = {
            type:          1,
            channel:       channelCode,
            currency:      'GHS',
            payer:         transaction.phoneNumber,
            amount:        resolvedAmount,
            externalref:   transactionId,
            otpcode:       String(otpCode).trim(),
            reference:     transaction.description || `${transaction.provider} Bundle`,
            accountnumber: accountnumber,
        };

        console.log('🔐 Submitting OTP to Moolre', { transactionId, url: `${baseUrl}/open/transact/payment` });

        const response = await fetch(`${baseUrl}/open/transact/payment`, {
            method:  'POST',
            headers: this.getMoolreHeaders(gateway),
            body:    JSON.stringify(body),
        });

        const rawText = await response.text();
        console.log('Moolre OTP response:', rawText.substring(0, 500));

        let data;
        try { data = JSON.parse(rawText); } catch {
            throw new Error(`Moolre returned non-JSON: ${rawText.substring(0, 200)}`);
        }

        // TP14 again = wrong OTP
        if (data.code === 'TP14') {
            throw new Error('Incorrect OTP. Please check the SMS and try again.');
        }

        const isSuccess = String(data.status ?? '') === '1';
        if (!isSuccess) {
            throw new Error(data.message || data.code || 'OTP verification failed');
        }

        let finalData = data;

        // Moolre returns TP17 when the OTP successfully registers the phone number.
        // However, this does NOT trigger the USSD prompt. We must immediately resend
        // the original payment request (without the otpcode) to actually trigger it.
        if (data.code === 'TP17') {
            console.log('🔄 Moolre returned TP17 (OTP Verified). Re-triggering collection...');
            
            delete body.otpcode; // Remove OTP code for the actual collection request
            
            const reResponse = await fetch(`${baseUrl}/open/transact/payment`, {
                method:  'POST',
                headers: this.getMoolreHeaders(gateway),
                body:    JSON.stringify(body),
            });
            
            const reText = await reResponse.text();
            console.log('Moolre re-trigger response:', reText.substring(0, 500));
            
            try { 
                finalData = JSON.parse(reText); 
            } catch {
                throw new Error(`Moolre returned non-JSON on re-trigger: ${reText.substring(0, 200)}`);
            }
            
            if (String(finalData.status ?? '') !== '1') {
                throw new Error(finalData.message || finalData.code || 'Payment initiation failed after OTP verification');
            }
        }

        // OTP accepted and payment re-triggered — USSD prompt is now being sent to the customer
        const gatewayRef = finalData.data?.transactionid || finalData.data?.id || finalData.transactionid || '';
        transaction.status = 'otp_verified';
        if (gatewayRef) transaction.gatewayTransactionId = gatewayRef;
        await transaction.save();

        console.log('✅ OTP verified — USSD prompt sent to customer phone. Full Moolre response:', JSON.stringify(finalData));
        return {
            success: true,
            message: finalData.message || 'OTP verified. Payment prompt sent to your phone.',
            transactionId,
        };
    }

    /**
     * Calculate transaction fee
     */
    static calculateFee(amount, gateway) {
        let fee = 0;
        if (gateway.transactionFee > 0)        fee += gateway.transactionFee;
        if (gateway.transactionFeePercent > 0) fee += (amount * gateway.transactionFeePercent) / 100;
        return parseFloat(fee.toFixed(2));
    }

    /**
     * Handle payment webhook callback from Moolre.
     *
     * Moolre webhook payload (from docs):
     * { txstatus, payer, terminalid, accountnumber, name, amount, value,
     *   transactionid, externalref, thirdpartyref, secret, ts }
     *
     * txstatus: 1=Successful, 0=Pending, 2=Failed
     * externalref: the value we sent as `externalref` (our transactionId)
     */
    static async handlePaymentCallback(callbackData) {
        try {
            // Moolre sends txstatus (int) and externalref (our TRX-xxx reference)
            const { txstatus, externalref, reference, transactionid, amount, payer, message } = callbackData;

            console.log('🔔 [PaymentService] handlePaymentCallback called', {
                externalref,
                moolreTransactionId: transactionid,
                txstatus,
                amount,
                timestamp: new Date().toISOString()
            });

            // Look up our transaction by the externalref we sent in the request,
            // but also fall back to txstatus transaction_id variations if needed.
            const transaction = await PaymentTransaction.findOne({
                $or: [
                    { transactionId: externalref },
                    { transactionId: reference },
                    { transactionId: transactionid },
                    { transactionId: externalref && String(externalref).trim() },
                    { transactionId: reference && String(reference).trim() },
                    { transactionId: transactionid && String(transactionid).trim() }
                ].filter(Boolean)
            });
            if (!transaction) {
                console.error('❌ [PaymentService] Transaction not found for callback:', {
                    externalref,
                    transactionid,
                    txstatus
                });
                throw new Error(`Transaction not found for callback: ${externalref || transactionid}`);
            }

            console.log('✅ [PaymentService] Found transaction:', {
                transactionId: transaction.transactionId,
                currentStatus: transaction.status,
                phoneNumber:   transaction.phoneNumber
            });

            const txStatus = Number(txstatus);
            const statusText = String(callbackData.status || '').trim().toLowerCase();
            const isSuccessStatus = txStatus === 1 || ['success', 'successful', 'completed', 'complete', 'paid', 'approved'].includes(statusText);
            const isFailedStatus = txStatus === 2 || ['failed', 'failure', 'cancelled', 'canceled', 'rejected', 'declined'].includes(statusText);

            if (isSuccessStatus) {
                transaction.status               = 'success';
                transaction.gatewayTransactionId = String(transactionid || '');
                transaction.completedAt          = new Date();
                console.log('✅ [PaymentService] Transaction marked SUCCESS');

            } else if (isFailedStatus) {
                transaction.status       = 'failed';
                transaction.errorMessage = message || 'Payment failed or rejected by customer';
                transaction.completedAt  = new Date();
                console.log('❌ [PaymentService] Transaction marked FAILED');

            } else {
                // txstatus === 0 → still pending — leave as-is
                console.log('⏳ [PaymentService] txstatus=0, still pending');
            }

            await transaction.save();
            console.log('✅ [PaymentService] Transaction saved to DB');

            return {
                success:       true,
                transactionId: externalref,
                status:        transaction.status
            };

        } catch (error) {
            console.error('❌ [PaymentService] Callback error:', error.message);
            console.error('Stack:', error.stack);
            return { success: false, message: error.message };
        }
    }

    /**
     * Check payment status (polls DB + optional Moolre status query fallback)
     */
    static async checkPaymentStatus(transactionId) {
        try {
            console.log('🔎 [PaymentService] checkPaymentStatus called', { transactionId });

            const transaction = await PaymentTransaction.findOne({ transactionId });
            if (!transaction) throw new Error('Transaction not found');

            console.log('📊 [PaymentService] DB status:', {
                status:      transaction.status,
                initiatedAt: transaction.initiatedAt
            });

            // Trigger fallback status query if still pending/otp_verified after 10 seconds
            if (transaction.status === 'pending' || transaction.status === 'processing' || transaction.status === 'otp_verified') {
                const ageSeconds = (Date.now() - new Date(transaction.initiatedAt).getTime()) / 1000;

                console.log('⏱️ [PaymentService] Fallback check', {
                    transactionId,
                    ageSeconds:        Math.round(ageSeconds),
                    shouldCallFallback: ageSeconds >= 10,
                    gateway:           transaction.paymentGateway
                });

                if (ageSeconds >= 10) {
                    console.log('🔄 [PaymentService] Triggering fallback status query');
                    const gateway = await PaymentGateway.findOne({ name: transaction.paymentGateway });

                    if (gateway) {
                        const gatewayStatus = await this.queryMoolreStatus(gateway, transaction);

                        if (gatewayStatus && gatewayStatus.definitive) {
                            console.log('✅ [PaymentService] Fallback returned definitive status:', gatewayStatus.status);
                            transaction.status = gatewayStatus.status;
                            if (gatewayStatus.status === 'success') transaction.completedAt = new Date();
                            await transaction.save();
                        }
                    } else {
                        console.log('❌ [PaymentService] Gateway not found:', transaction.paymentGateway);
                    }
                }
            }

            return {
                success:     true,
                status:      transaction.status,
                transaction: transaction
            };

        } catch (error) {
            console.error('Status check error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Query Moolre for live payment status (fallback if webhook doesn't arrive).
     *
     * Endpoint : POST https://api.moolre.com/open/transact/status
     * Body     : { type:1, idtype:1, id:<externalref>, accountnumber }
     * txstatus : 1=Successful, 0=Pending, 2=Failed
     */
    static async queryMoolreStatus(gateway, transaction) {
        try {
            console.log('🔍 [PaymentService] queryMoolreStatus START', {
                transactionId: transaction.transactionId,
                gateway:       gateway.name
            });

            const baseUrl       = (gateway.apiBaseUrl || 'https://api.moolre.com').replace(/\/$/, '');
            const url           = `${baseUrl}/open/transact/status`;
            const accountnumber = gateway.accountNumber || gateway.apiKey || '';
            const headers       = this.getMoolreHeaders(gateway);

            const body = {
                type:          1,
                idtype:        1,           // 1 = our unique externalref
                id:            transaction.transactionId,
                accountnumber: accountnumber,
            };

            console.log('🌐 [PaymentService] Querying Moolre status', { url, id: body.id });

            const response = await fetch(url, {
                method:  'POST',
                headers: headers,
                body:    JSON.stringify(body),
            });

            const rawText = await response.text();
            debugLog('📡 Moolre status response', { statusCode: response.status, raw: rawText.substring(0, 300) });

            if (!response.ok) {
                debugLog('❌ Moolre status error', { status: response.status, response: rawText.substring(0, 200) });
                return { definitive: false };
            }

            let data;
            try { data = JSON.parse(rawText); } catch { return { definitive: false }; }

            // txstatus: 1=Successful, 0=Pending, 2=Failed
            const txStatus = Number(data.data?.txstatus ?? -1);
            let internalStatus = 'pending';
            let definitive     = false;

            if (txStatus === 1) { internalStatus = 'success'; definitive = true; }
            if (txStatus === 2) { internalStatus = 'failed';  definitive = true; }

            debugLog('🔍 Status mapping', { txStatus, internalStatus, definitive });
            return { status: internalStatus, definitive };

        } catch (error) {
            console.error('❌ [PaymentService] queryMoolreStatus error:', error.message);
            return { definitive: false };
        }
    }

    /**
     * Get payment gateway public config (for client-side use)
     */
    static async getGatewayConfig(gatewayName) {
        try {
            const gateway = await PaymentGateway.findOne({ name: gatewayName });
            if (!gateway) throw new Error('Gateway not found');

            return {
                success: true,
                config: {
                    name:           gateway.name,
                    type:           gateway.type,
                    minAmount:      gateway.minAmount,
                    maxAmount:      gateway.maxAmount,
                    paymentMethods: gateway.paymentMethods,
                    isTestMode:     gateway.isTestMode,
                    networkMapping: gateway.networkMapping,
                }
            };
        } catch (error) {
            console.error('Gateway config error:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = PaymentService;
