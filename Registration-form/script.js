// Theme Management
    function initializeTheme() {
        const currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Tab switching (unchanged)
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    const showForgotPassword = document.getElementById('showForgotPassword');
    const showLoginFromForgot = document.getElementById('showLoginFromForgot');
    const authTabs = document.querySelector('.auth-tabs');

    if (showSignup) showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        if (authTabs) authTabs.classList.remove('hidden');
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        forgotPasswordForm.classList.add('hidden');
    });
    if (showLogin) showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        if (authTabs) authTabs.classList.remove('hidden');
        signupTab.classList.remove('active');
        loginTab.classList.add('active');
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        forgotPasswordForm.classList.add('hidden');
    });
    if (showForgotPassword) showForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.add('hidden');
        forgotPasswordForm.classList.remove('hidden');
        if (authTabs) authTabs.classList.add('hidden');
        loginTab.classList.remove('active');
        signupTab.classList.remove('active');
    });
    if (showLoginFromForgot) showLoginFromForgot.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        if (authTabs) authTabs.classList.remove('hidden');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
    });
    if (loginTab) loginTab.addEventListener('click', () => {
        if (authTabs) authTabs.classList.remove('hidden');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        forgotPasswordForm.classList.add('hidden');
    });
    if (signupTab) signupTab.addEventListener('click', () => {
        if (authTabs) authTabs.classList.remove('hidden');
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        forgotPasswordForm.classList.add('hidden');
    });

    const API_BASE = 'https://youngster-backend.vercel.app';

    // LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmailAddr').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            if (!email || !password) {
                alert('Please enter both email and password.');
                return;
            }
            const btn = document.getElementById('main-login-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Logging in... <i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('username', data.user.username);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    // Route based on role
                    if (data.user.role === 'admin') {
                        window.location.href = '../Admin/admin.html';
                    } else {
                        window.location.href = '../Referral Prices/dealers_referral_prices.html';
                    }
                } else {
                    alert(data.message || 'Login failed');
                }
            } catch (err) {
                console.error(err);
                alert('Network error. Is the backend running?');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }

    // SIGNUP
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('signupUsername').value.trim();
            const fullname = document.getElementById('signupFullName').value.trim();
            const businessName = document.getElementById('signupBusinessName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const phone = document.getElementById('signupPhone').value.trim();
            const password = document.getElementById('signupPassword').value;
            const confirm = document.getElementById('signupConfirmPassword').value;
            if (password !== confirm) {
                alert('Passwords do not match');
                return;
            }
            const btn = signupForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Creating account... <i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, fullname, businessName, email, phone, password })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('username', data.user.username);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    // Route based on role
                    if (data.user.role === 'admin') {
                        window.location.href = '../Admin/admin.html';
                    } else {
                        window.location.href = '../Referral Prices/dealers_referral_prices.html';
                    }
                } else {
                    alert(data.message || 'Signup failed');
                }
            } catch (err) {
                console.error(err);
                alert('Network error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }

    // Forgot password (demo – you can implement later)
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Password reset link would be sent to your email.');
            forgotPasswordForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            if (authTabs) authTabs.classList.remove('hidden');
            loginTab.classList.add('active');
            signupTab.classList.remove('active');
        });
    }

    initializeTheme();
