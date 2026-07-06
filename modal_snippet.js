// ── Moolre Payment Modal ──────────────────────────────────────────────────────
// Shows a modal asking for the customer's MoMo number, initiates the
// Moolre USSD push via the backend, then polls for confirmation.

function showPaymentModal(orderDetails) {
    // Remove any existing modal
    const existing = document.getElementById('moolrePayModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'moolrePayModal';
    modal.innerHTML = `
        <div style="
            position:fixed; inset:0; background:rgba(0,0,0,0.6);
            display:flex; align-items:center; justify-content:center;
            z-index:99999; padding:16px;">
            <div style="
                background:#fff; border-radius:16px; padding:28px 24px;
                max-width:380px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.3);
                font-family:inherit;">

                <!-- Header -->
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="width:56px;height:56px;background:linear-gradient(135deg,#6a11cb,#2575fc);
                        border-radius:50%;display:flex;align-items:center;justify-content:center;
                        margin:0 auto 12px;">
                        <i class="fas fa-mobile-alt" style="color:#fff;font-size:22px;"></i>
                    </div>
                    <h2 style="margin:0;font-size:18px;color:#1a1a2e;">Mobile Money Payment</h2>
                    <p style="margin:6px 0 0;color:#666;font-size:13px;">
                        Enter the MoMo number to charge
                    </p>
                </div>

                <!-- Order summary -->
                <div style="background:#f8f9ff;border-radius:10px;padding:12px 16px;margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="color:#666;font-size:13px;">Bundle</span>
                        <span style="font-weight:600;font-size:13px;">${orderDetails.bundle_size}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="color:#666;font-size:13px;">Recipient</span>
                        <span style="font-weight:600;font-size:13px;">${orderDetails.beneficiary}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;border-top:1px solid #e0e0e0;padding-top:8px;margin-top:4px;">
                        <span style="color:#666;font-size:14px;font-weight:600;">Amount</span>
                        <span style="font-weight:700;font-size:16px;color:#6a11cb;">GHS ${parseFloat(orderDetails.amount).toFixed(2)}</span>
                    </div>
                </div>

                <!-- MoMo phone input -->
                <div id="payModalStep1">
                    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px;">
                        <div>
                            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">Select Network</label>
                            <select id="momoNetwork" style="width:100%;padding:12px 14px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;background:#fff;outline:none;">
                                <option value="MTN">MTN</option>
                                <option value="Telecel">Telecel</option>
                                <option value="AirtelTigo">AirtelTigo</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">MoMo Phone Number</label>
                            <input type="tel" id="momoPhone" placeholder="024 XXX XXXX"
                                inputmode="numeric" maxlength="10"
                                style="width:100%;padding:12px 14px;border:2px solid #e0e0e0;
                                border-radius:8px;font-size:15px;outline:none;">
                        </div>
                    </div>
                    <p style="font-size:12px;color:#888;margin:0 0 16px;">
                        A payment prompt will be sent to this number. Enter your MoMo PIN to confirm.
                    </p>
                    <button id="momoPayBtn" style="
                        width:100%;padding:14px;background:linear-gradient(135deg,#6a11cb,#2575fc);
                        color:#fff;border:none;border-radius:10px;font-size:15px;
                        font-weight:600;cursor:pointer;letter-spacing:0.3px;">
                        <i class="fas fa-paper-plane"></i> Send Payment Prompt
                    </button>
                    <button id="momoCancel" style="
                        width:100%;padding:10px;background:transparent;color:#888;
                        border:none;font-size:13px;cursor:pointer;margin-top:8px;">
                        Cancel
                    </button>
                </div>

                <!-- Waiting screen (hidden initially) -->
                <div id="payModalStep2" style="display:none;text-align:center;">
                    <div style="margin-bottom:16px;">
                        <i class="fas fa-spinner fa-spin" style="font-size:36px;color:#6a11cb;"></i>
                    </div>
                    <h3 style="margin:0 0 8px;color:#1a1a2e;">Waiting for payment...</h3>
                    <p id="payModalMsg" style="color:#666;font-size:13px;margin:0 0 16px;">
                        Check your phone and enter your MoMo PIN to approve the payment.
                    </p>
                    <button id="momoCancelWait" style="
                        padding:10px 24px;background:transparent;color:#e74c3c;
                        border:1px solid #e74c3c;border-radius:8px;font-size:13px;cursor:pointer;">
                        Cancel
                    </button>
                </div>

                <!-- Result screen (hidden initially) -->
                <div id="payModalStep3" style="display:none;text-align:center;">
                    <div id="payResultIcon" style="font-size:48px;margin-bottom:12px;"></div>
                    <h3 id="payResultTitle" style="margin:0 0 8px;"></h3>
                    <p id="payResultMsg" style="color:#666;font-size:13px;margin:0 0 20px;"></p>
                    <button id="payResultClose" style="
                        padding:12px 32px;background:linear-gradient(135deg,#6a11cb,#2575fc);
                        color:#fff;border:none;border-radius:10px;font-size:14px;
                        font-weight:600;cursor:pointer;">
                        Done
                    </button>
                </div>

            </div>
        </div>`;

    document.body.appendChild(modal);

    const step1 = document.getElementById('payModalStep1');
    const step2 = document.getElementById('payModalStep2');
    const step3 = document.getElementById('payModalStep3');
    const momoPhone = document.getElementById('momoPhone');
    const momoNetwork = document.getElementById('momoNetwork');

    // Pre-fill phone if beneficiary is on same network
    momoPhone.value = orderDetails.beneficiary || '';

    // Numeric only
    momoPhone.addEventListener('input', () => {
        momoPhone.value = momoPhone.value.replace(/[^0-9]/g, '');
    });

    // Cancel
    document.getElementById('momoCancel').addEventListener('click', () => modal.remove());
    document.getElementById('momoCancelWait').addEventListener('click', () => modal.remove());
    document.getElementById('payResultClose').addEventListener('click', () => modal.remove());

    // Send payment prompt
    document.getElementById('momoPayBtn').addEventListener('click', async () => {
        const phone = momoPhone.value.trim();
        const network = momoNetwork.value;

        if (!phone || phone.length !== 10) {
            momoPhone.style.border = '2px solid #e74c3c';
            momoPhone.focus();
            return;
        }
        momoPhone.style.border = '2px solid #e0e0e0';

        // Show waiting screen
        step1.style.display = 'none';
        step2.style.display = 'block';

        const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:5000/api' : `https://${window.location.hostname}/api`;

        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let transactionId = null;
        let pollTimer = null;

        try {
            const res = await fetch(`${API_BASE}/payment/initiate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    gatewayName:  'Moolre',
                    phoneNumber:  phone,
                    amount:       orderDetails.amount,
                    provider:     network,
                    description:  `${orderDetails.package} ${orderDetails.bundle_size}`,
                    packageName:  orderDetails.package,
                    bundle_size:  orderDetails.bundle_size,
                    storeSlug:    new URLSearchParams(window.location.search).get('store') || localStorage.getItem('storeSlug') || '',
                    clientType:   localStorage.getItem('clientType') || 'Customers',
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Payment initiation failed');
            }

            transactionId = data.transactionId;

            localStorage.setItem('paymentTransactionId', transactionId);
            localStorage.setItem('pendingOrderData', JSON.stringify({
                package:     orderDetails.package,
                bundle_size: orderDetails.bundle_size,
                amount:      orderDetails.amount,
                beneficiary: orderDetails.beneficiary,
                phoneNumber: phone,
                transactionId: transactionId,
                storeSlug:   new URLSearchParams(window.location.search).get('store') || localStorage.getItem('storeSlug') || '',
                clientType:  localStorage.getItem('clientType') || 'Customers'
            }));

            const returnUrl = `/Dashboard/payment-processing.html?transactionId=${transactionId}`;
            localStorage.setItem('otpTransactionId', transactionId);
            localStorage.setItem('otpPhoneNumber',   phone);
            localStorage.setItem('otpReturnUrl',     returnUrl);
            window.location.href = `../payment-otp.html?txid=${transactionId}&phone=${encodeURIComponent(phone)}&return=${encodeURIComponent(returnUrl)}`;

        } catch (err) {
            step2.style.display = 'none';
            step1.style.display = 'block';
            alert(err.message || 'Could not initiate payment. Please try again.');
        }

        function showResult(success, icon, title, message) {
            step2.style.display = 'none';
            step3.style.display = 'block';
            document.getElementById('payResultIcon').textContent = icon;
            document.getElementById('payResultTitle').textContent = title;
            document.getElementById('payResultTitle').style.color = success ? '#27ae60' : '#e74c3c';
            document.getElementById('payResultMsg').textContent = message;
        }
    });
}
