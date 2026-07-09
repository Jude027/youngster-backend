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
                paymentGateway: gatewayName,
                provider:       paymentData.provider,
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
                    packageName:     paymentData.packageName || '',
                    bundle_size:     paymentData.bundle_size || '',
                    storeSlug:       paymentData.storeSlug   || '',
                    clientType:      paymentData.clientType  || '',
                    // packageProvider is the actual data network (e.g. "AT Ishare", "MTN EXPRESS").
                    // paymentData.provider is the MoMo payment network used for Moolre channel
                    // mapping — they can differ when someone buys AT data and pays with MTN MoMo.
                    packageProvider: paymentData.packageProvider || paymentData.provider || '',
                }
            });
            await transaction.save();
            console.log('✅ PaymentTransaction saved:', { transactionId, status: 'processing' });

            // ── Moolre USSD Direct Debit ───────────────────────────────────────────
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

            // USSD prompt sent — poll for status (no webhook needed)
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
        const CHANNEL_MAP = {
            'MTN':         '13',
            'MTN EXPRESS': '13',
            'TELECEL':     '6',
            'AT':          '7',
            'AT ISHARE':   '7',
            'AT BIGTIME':  '7',
            'AIRTELTIGO':  '7',
        };
        const providerKey = (paymentData.provider || '').toUpperCase().trim();
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

        // TP14 = OTP required — Moolre sent SMS to customer, frontend must collect it
        if (data.code === 'TP14') {
            console.log('🔐 Moolre requires OTP verification — SMS sent to customer');
            return {
                success:      true,
                requiresOtp:  true,
                transactionId,
                message:      data.message || 'OTP sent to your phone. Please enter it to continue.',
            };
        }

        const statusStr = String(data.status ?? '');
        const isSuccess = statusStr === '1';

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
     *
     * Moolre's 3-step flow:
     *   1. POST /open/transact/payment (no otpcode)  → TP14 (OTP SMS sent)
     *   2. POST /open/transact/payment (with otpcode) → TP17 (phone verified)
     *   3. POST /open/transact/payment (no otpcode, same externalref) → USSD push sent
     *
     * This function handles steps 2 and 3.
     */
    static async verifyOtp(transactionId, otpCode) {
        const transaction = await PaymentTransaction.findOne({ transactionId });
        if (!transaction) throw new Error('Transaction not found');

        const gateway = await PaymentGateway.findOne({ name: transaction.paymentGateway, enabled: true });
        if (!gateway) throw new Error('Payment gateway not found');

        const CHANNEL_MAP = {
            'MTN': '13', 'MTN EXPRESS': '13',
            'TELECEL': '6',
            'AT': '7', 'AT ISHARE': '7', 'AT BIGTIME': '7', 'AIRTELTIGO': '7',
        };
        const providerKey   = (transaction.provider || '').toUpperCase().trim();
        const channelCode   = CHANNEL_MAP[providerKey] || '13';
        const accountnumber = gateway.accountNumber || gateway.apiKey || '';
        const baseUrl       = (gateway.apiBaseUrl || 'https://api.moolre.com').replace(/\/+$/, '');
        const url           = `${baseUrl}/open/transact/payment`;
        const headers       = this.getMoolreHeaders(gateway);

        const baseBody = {
            type:          1,
            channel:       channelCode,
            currency:      'GHS',
            payer:         transaction.phoneNumber,
            amount:        parseFloat(transaction.totalAmount.toFixed(2)),
            externalref:   transactionId,
            reference:     transaction.description || `${transaction.provider} Bundle`,
            accountnumber: accountnumber,
        };

        // ── Step 2: submit OTP (phone verification) ───────────────────────────
        console.log('🔐 Submitting OTP to Moolre (step 2 — phone verify)', { transactionId });

        const otpResponse = await fetch(url, {
            method:  'POST',
            headers,
            body:    JSON.stringify({ ...baseBody, otpcode: String(otpCode).trim() }),
        });

        const otpRaw = await otpResponse.text();
        console.log('Moolre OTP response:', otpRaw.substring(0, 500));

        let otpData;
        try { otpData = JSON.parse(otpRaw); } catch {
            throw new Error(`Moolre returned non-JSON: ${otpRaw.substring(0, 200)}`);
        }

        if (otpData.code === 'TP14') {
            throw new Error('Incorrect OTP. Please check the SMS and try again.');
        }

        if (String(otpData.status ?? '') !== '1') {
            throw new Error(otpData.message || otpData.code || 'OTP verification failed');
        }

        // ── Step 3: re-submit WITHOUT otpcode — this triggers the USSD push ──
        console.log('💳 Submitting payment request to Moolre (step 3 — USSD push)', { transactionId });

        const payResponse = await fetch(url, {
            method:  'POST',
            headers,
            body:    JSON.stringify(baseBody),   // no otpcode
        });

        const payRaw = await payResponse.text();
        console.log('Moolre payment request response:', payRaw.substring(0, 500));

        let payData;
        try { payData = JSON.parse(payRaw); } catch {
            throw new Error(`Moolre returned non-JSON on payment request: ${payRaw.substring(0, 200)}`);
        }

        debugLog('📡 Moolre step-3 payment response', { status: payResponse.status, data: payData });

        // TP14 here means the externalref was reused and Moolre wants a fresh OTP —
        // this should not happen but guard it just in case.
        if (payData.code === 'TP14') {
            throw new Error('Payment request failed: Moolre requires a new OTP. Please start over.');
        }

        if (String(payData.status ?? '') !== '1') {
            throw new Error(payData.message || payData.code || 'Payment request failed after OTP verification');
        }

        // Capture Moolre's own transaction ID if present in step-3 response
        const gatewayRef = payData.data?.transactionid || payData.data?.id
            || otpData.data?.transactionid || otpData.data?.id || '';

        // Stamp otpVerifiedAt via updateOne so it persists even if the schema
        // doesn't declare the field (bypasses Mongoose strict mode).
        const updateFields = { otpVerifiedAt: new Date() };
        if (gatewayRef) updateFields.gatewayTransactionId = gatewayRef;

        await PaymentTransaction.updateOne(
            { transactionId },
            { $set: updateFields }
        );

        console.log('✅ OTP verified + USSD push sent to customer phone');
        return {
            success: true,
            message: payData.message || 'Payment prompt sent to your phone. Enter your MoMo PIN to approve.',
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
            const { txstatus, externalref, transactionid, amount, payer, message } = callbackData;

            console.log('🔔 [PaymentService] handlePaymentCallback called', {
                externalref,
                moolreTransactionId: transactionid,
                txstatus,
                amount,
                timestamp: new Date().toISOString()
            });

            // Look up our transaction by the externalref we sent in the request
            const transaction = await PaymentTransaction.findOne({ transactionId: externalref });
            if (!transaction) {
                console.error('❌ [PaymentService] Transaction not found for externalref:', externalref);
                throw new Error(`Transaction not found: ${externalref}`);
            }

            console.log('✅ [PaymentService] Found transaction:', {
                transactionId: transaction.transactionId,
                currentStatus: transaction.status,
                phoneNumber:   transaction.phoneNumber
            });

            const txStatus = Number(txstatus);

            if (txStatus === 1) {
                transaction.status               = 'success';
                transaction.gatewayTransactionId = String(transactionid || '');
                transaction.completedAt          = new Date();
                console.log('✅ [PaymentService] Transaction marked SUCCESS');

            } else if (txStatus === 2) {
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
     * Check payment status.
     * Since we are not using webhooks (main site owns the callback URL),
     * we poll Moolre's status endpoint directly every time this is called.
     * The frontend calls this every 5 seconds after OTP verification.
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

            // Already finalised — return immediately
            if (transaction.status === 'success' || transaction.status === 'failed') {
                return { success: true, status: transaction.status, transaction };
            }

            // Poll Moolre directly for pending/processing transactions.
            //
            // Use otpVerifiedAt as the reference point when it exists — that is the
            // moment Moolre actually received the final payment request and issued the
            // USSD push.  Moolre needs ~10 s to register the transaction before its
            // status endpoint will return anything other than SS07 ("not found").
            //
            // Fall back to initiatedAt for non-OTP flows (direct USSD push), where
            // a 5-second head start is sufficient.
            //
            // Read as lean to pick up otpVerifiedAt even if the schema doesn't
            // declare it (Mongoose strict mode hides undeclared fields on hydrated docs).
            const txLean        = await PaymentTransaction.findOne({ transactionId }).lean();
            const referenceTime = txLean?.otpVerifiedAt || txLean?.initiatedAt || transaction.initiatedAt;
            const delaySeconds  = txLean?.otpVerifiedAt ? 10 : 5;
            const ageSeconds    = (Date.now() - new Date(referenceTime).getTime()) / 1000;

            if (ageSeconds >= delaySeconds) {
                const gateway = await PaymentGateway.findOne({ name: transaction.paymentGateway });

                if (gateway) {
                    console.log('🔄 [PaymentService] Polling Moolre status directly');
                    const gatewayStatus = await this.queryMoolreStatus(gateway, transaction);

                    if (gatewayStatus && gatewayStatus.definitive) {
                        console.log('✅ [PaymentService] Moolre returned definitive status:', gatewayStatus.status);
                        transaction.status = gatewayStatus.status;

                        if (gatewayStatus.status === 'success') {
                            transaction.completedAt = new Date();

                            // Auto-create the order when payment is confirmed
                            try {
                                const Order = require('./models/Order');
                                const existingOrder = await Order.findOne({ transactionId });
                                if (!existingOrder) {
                                    const beneficiary = transaction.metadata?.beneficiary
                                        || transaction.phoneNumber;
                                    // Use packageProvider (the actual data network, e.g. "AT Ishare")
                                    // rather than transaction.provider (the MoMo payment network,
                                    // e.g. "MTN") — they differ when paying cross-network.
                                    const orderProvider = transaction.metadata?.packageProvider
                                        || transaction.provider;
                                    await Order.create({
                                        userId:        transaction.userId || null,
                                        storeSlug:     transaction.storeSlug || null,
                                        beneficiary,
                                        phoneNumber:   beneficiary,
                                        package:       orderProvider,
                                        bundle_size:   transaction.metadata?.bundle_size || transaction.description,
                                        amount:        transaction.amount,
                                        status:        'pending',
                                        transactionId,
                                        created:       new Date(),
                                    });
                                    console.log('✅ Order auto-created for transaction', transactionId, { orderProvider });
                                }
                            } catch (orderErr) {
                                console.warn('⚠️ Could not auto-create order:', orderErr.message);
                            }
                        }

                        await transaction.save();
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
