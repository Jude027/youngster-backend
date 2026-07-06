* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

:root {
    --primary: #2c3e50;
    --secondary: #3498db;
    --danger: #e74c3c;
    --success: #2ecc71;
    --warning: #f39c12;
    --light: #ecf0f1;
    --dark: #2c3e50;
    --bg: #f5f7fa;
}

body {
    background: var(--bg);
}

.admin-container {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

/* Sidebar */
.admin-sidebar {
    width: 260px;
    background: var(--primary);
    color: white;
    display: flex;
    flex-direction: column;
    box-shadow: 2px 0 10px rgba(0,0,0,0.1);
}

.sidebar-header {
    padding: 20px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.sidebar-header h2 {
    font-size: 1.3rem;
    display: flex;
    align-items: center;
    gap: 10px;
}

.admin-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 0;
}

.nav-btn {
    background: none;
    border: none;
    color: rgba(255,255,255,0.7);
    padding: 12px 20px;
    text-align: left;
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.2s;
}

.nav-btn:hover, .nav-btn.active {
    background: rgba(255,255,255,0.1);
    color: white;
    border-left: 3px solid var(--secondary);
}

.nav-btn i {
    width: 20px;
}

.logout-btn {
    margin-top: auto;
    border-top: 1px solid rgba(255,255,255,0.1);
    color: #e74c3c;
}

/* Main content */
.admin-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.admin-header {
    background: white;
    padding: 15px 25px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #ddd;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.admin-header h1 {
    font-size: 1.5rem;
    color: var(--primary);
}

.admin-user {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--light);
    padding: 6px 12px;
    border-radius: 20px;
}

.admin-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
    height: 0; /* forces overflow-y:auto to actually scroll within the flex column */
}

/* Tabs */
.tab-content {
    display: none;
}
.tab-content.active {
    display: block;
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.stat-info h3 {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--primary);
}
.stat-info p {
    color: #7f8c8d;
    margin-top: 5px;
}
.stat-icon i {
    font-size: 2.5rem;
    color: var(--secondary);
    opacity: 0.7;
}

/* Tables */
.search-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}
.search-bar input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
}
.search-bar button {
    background: var(--secondary);
    border: none;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
}
.table-responsive {
    overflow-x: auto;
}
.admin-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.admin-table th, .admin-table td {
    padding: 12px 10px;
    text-align: left;
    border-bottom: 1px solid #eee;
}
.admin-table th {
    background: #f8f9fa;
    font-weight: 600;
    color: var(--primary);
}
.admin-table tr:hover {
    background: #fafafa;
}
.status-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
}
.status-pending { background: #fff3cd; color: #856404; }
.status-approved { background: #d4edda; color: #155724; }
.status-complete { background: #d4edda; color: #155724; }
.status-completed { background: #d4edda; color: #155724; }
.status-rejected { background: #f8d7da; color: #721c24; }
.action-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    margin: 0 2px;
    border-radius: 4px;
}
.edit-btn { background: #3498db; color: white; }
.delete-btn { background: #e74c3c; color: white; }
.approve-btn { background: #2ecc71; color: white; }
.reject-btn { background: #e67e22; color: white; }

/* Modal */
.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
}
.modal-content {
    background: white;
    margin: 5% auto;
    width: 90%;
    max-width: 500px;
    max-height: 85vh;
    overflow-y: auto;
    border-radius: 12px;
    padding: 20px;
}
.modal-content .close {
    float: right;
    font-size: 24px;
    cursor: pointer;
}
#modalFields {
    margin: 20px 0;
}
.input-group {
    margin-bottom: 15px;
}
.input-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
}
.input-group input, .input-group select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
}
.btn-save {
    background: var(--success);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    width: 100%;
}

@media (max-width: 768px) {
    .admin-sidebar { 
        width: 100px; 
    }
    
    .sidebar-header {
        padding: 12px;
    }
    
    .sidebar-header h2 {
        font-size: 0.75rem;
        gap: 6px;
    }
    
    .sidebar-header i {
        font-size: 1.2rem;
    }
    
    .admin-nav {
        padding: 10px 0;
    }
    
    .nav-btn {
        padding: 10px;
        font-size: 0.7rem;
        justify-content: center;
        flex-direction: column;
        gap: 4px;
    }
    
    .nav-btn i {
        font-size: 1.3rem;
        width: auto;
        margin: 0;
    }
    
    .nav-btn:hover, .nav-btn.active {
        border-left: 3px solid var(--secondary);
    }
    
    .logout-btn {
        padding: 10px;
        font-size: 0.7rem;
        justify-content: center;
        flex-direction: column;
        gap: 4px;
    }
    
    .logout-btn i {
        font-size: 1.3rem;
        width: auto;
        margin: 0;
    }
    
    .admin-header h1 { 
        font-size: 1.2rem; 
    }
    
    .admin-header {
        padding: 12px 15px;
    }
    
    .admin-content {
        padding: 12px 15px;
    }
    
    .stats-grid { 
        grid-template-columns: 1fr; 
    }
    
    .stat-card {
        padding: 12px;
        flex-direction: column;
    }
    
    .stat-icon i {
        font-size: 1.8rem;
    }
    
    .search-bar {
        flex-direction: column;
        gap: 8px;
    }
    
    .search-bar input,
    .search-bar button {
        min-height: 36px;
        font-size: 0.9rem;
    }
    
    .table-responsive {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    
    .admin-table {
        font-size: 0.85rem;
    }
    
    .admin-table th, .admin-table td {
        padding: 8px;
    }
    
    .form-section {
        padding: 16px;
    }
    
    .form-section h3 {
        font-size: 1rem;
    }
    
    .form-section h4 {
        font-size: 0.9rem;
    }
    
    .form-group input,
    .form-group select,
    .form-group textarea {
        padding: 8px 10px;
        font-size: 16px;
    }
    
    .btn-primary,
    .btn-success {
        padding: 10px 16px;
        font-size: 0.9rem;
        width: 100%;
    }
    
    .btn-edit {
        padding: 6px 8px;
        font-size: 0.75rem;
    }
    
    .action-btn {
        padding: 4px 6px;
        font-size: 0.75rem;
    }
    
    .modal-content {
        width: 90%;
        margin: 10% auto;
        max-height: 80vh;
        padding: 16px;
    }
    
    .content-header h2 {
        font-size: 1.1rem;
    }
    
    .admin-card {
        padding: 12px;
    }
}

@media (max-width: 480px) {
    .admin-sidebar {
        width: 80px;
    }
    
    .sidebar-header {
        padding: 10px;
    }
    
    .sidebar-header h2 {
        font-size: 0.65rem;
    }
    
    .sidebar-header i {
        font-size: 1rem;
    }
    
    .nav-btn {
        padding: 8px;
        font-size: 0.65rem;
        gap: 3px;
    }
    
    .nav-btn i {
        font-size: 1.1rem;
    }
    
    .logout-btn {
        padding: 8px;
        font-size: 0.65rem;
        gap: 3px;
    }
    
    .logout-btn i {
        font-size: 1.1rem;
    }
    
    .admin-header h1 {
        font-size: 1rem;
    }
    
    .admin-header {
        padding: 10px 12px;
    }
    
    .admin-content {
        padding: 10px 12px;
    }
    
    .stats-grid {
        gap: 10px;
    }
    
    .stat-card {
        padding: 10px;
    }
    
    .stat-icon i {
        font-size: 1.5rem;
    }
    
    .stat-info h3 {
        font-size: 1.2rem;
    }
    
    .admin-table {
        font-size: 0.8rem;
        min-width: 450px;
    }
    
    .admin-table th, .admin-table td {
        padding: 6px;
    }
    
    .form-section {
        padding: 12px;
    }
    
    .form-section h3 {
        font-size: 0.95rem;
    }
    
    .btn-primary,
    .btn-success {
        padding: 8px 12px;
        font-size: 0.85rem;
    }
    
    .btn-edit {
        padding: 4px 6px;
        font-size: 0.7rem;
    }
    
    .modal-content {
        width: 95%;
        margin: 20% auto;
        padding: 12px;
    }
}

/* ========== Provider API / Form Sections ========== */
.content-header {
    margin-bottom: 24px;
}
.content-header h2 {
    font-size: 1.4rem;
    color: var(--primary);
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
}
.content-header p {
    color: #7f8c8d;
    font-size: 0.9rem;
}

.admin-card {
    background: white;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    margin-bottom: 20px;
}

.form-section {
    background: white;
    border-radius: 10px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    max-width: 700px;
}
.form-section h3 {
    font-size: 1.1rem;
    color: var(--primary);
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--light);
}
.form-section h4 {
    font-size: 0.95rem;
    color: var(--primary);
    margin: 20px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--light);
}

.form-group {
    margin-bottom: 16px;
}
.form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #34495e;
    font-size: 0.9rem;
}
.form-group input[type="text"],
.form-group input[type="password"],
.form-group input[type="number"],
.form-group input[type="email"],
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #dce1e7;
    border-radius: 6px;
    font-size: 0.9rem;
    color: var(--dark);
    background: #fafbfc;
    transition: border-color 0.2s;
}
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--secondary);
    background: white;
}
.form-group textarea {
    resize: vertical;
    min-height: 80px;
    font-family: monospace;
    font-size: 0.85rem;
}
.form-group input[type="checkbox"] {
    width: auto;
    margin-right: 8px;
    accent-color: var(--secondary);
}

/* Buttons */
.btn-primary {
    background: var(--secondary);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s;
}
.btn-primary:hover {
    background: #2980b9;
}
.btn-success {
    background: var(--success);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s;
}
.btn-success:hover {
    background: #27ae60;
}
.btn-edit {
    background: var(--secondary);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.2s;
}
.btn-edit:hover {
    background: #2980b9;
}

/* Status badge extras */
.status-success { background: #d4edda; color: #155724; }
.status-failed  { background: #f8d7da; color: #721c24; }
.status-live    { background: #e8f5e9; color: #1b5e20; }
.status-test    { background: #fff3e0; color: #e65100; }

/* Configured Providers Display */
#configuredProvidersList {
    background: #f0f7ff;
    border-left: 4px solid var(--secondary);
    padding: 16px;
    border-radius: 6px;
    margin-bottom: 20px;
}
#configuredProvidersList h4 {
    color: var(--primary);
    margin-bottom: 12px;
    font-size: 0.9rem;
}
#configuredProvidersContainer {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}
#configuredProvidersContainer > div {
    display: inline-flex;
    align-items: center;
    background: white;
    border: 1px solid #4caf50;
    border-radius: 20px;
    padding: 8px 15px;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 0.9rem;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
#configuredProvidersContainer > div:hover {
    background: #e8f5e9;
    box-shadow: 0 2px 6px rgba(76, 175, 80, 0.2);
    transform: translateY(-2px);
}
#configuredProvidersContainer > div i {
    color: #4caf50;
    margin-right: 6px;
    font-size: 0.85rem;
}
#configuredProvidersContainer > p {
    color: #999;
    font-style: italic;
    font-size: 0.9rem;
}