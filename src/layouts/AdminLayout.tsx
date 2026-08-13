import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    LayoutGrid,
    Users,
    Shield,
    BarChart3,
    Activity,
    Cpu,
    Bell,
    Menu,
    X
} from 'lucide-react';
import { farmsApi, usersApi } from '../api/services';
import LanguageSelector from '../components/LanguageSelector';
import './AdminLayout.css';

// Member-facing Dashboard deployment; per-stage via env (Vite only exposes VITE_* vars).
const DASHBOARD_URL: string = import.meta.env.VITE_DASHBOARD_URL || '';

interface AdminLayoutProps {
    onLogout: () => void;
}

export default function AdminLayout({ onLogout }: AdminLayoutProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();

    const [farmCount, setFarmCount] = useState(6);
    const [userCount, setUserCount] = useState(13);
    // Dưới 900px sidebar là drawer trượt từ trái; từ 900px trở lên nó luôn hiện và
    // state này bị CSS bỏ qua hoàn toàn.
    const [navOpen, setNavOpen] = useState(false);

    // Mock fleet status for the sidebar
    const fleetStatus = {
        healthy: 4,
        warning: 1,
        critical: 1
    };

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [farms, users] = await Promise.all([
                    farmsApi.getAll(),
                    usersApi.getAll()
                ]);
                setFarmCount(farms.length);
                setUserCount(users.length);
            } catch (err) {
                console.error("Failed to load counts in AdminLayout", err);
            }
        };
        fetchCounts();
    }, []);

    // Điều hướng xong thì đóng drawer, nếu không nó che luôn trang vừa mở.
    useEffect(() => setNavOpen(false), [pathname]);

    // Esc để đóng — drawer là lớp phủ, phải thoát được bằng bàn phím.
    useEffect(() => {
        if (!navOpen) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navOpen]);

    return (
        <div className="admin-layout-wrapper">
            {/* Top Bar Area for Logo and Profile/Lang */}
            <header className="admin-topbar">
                <div className="brand-section">
                    {/* Chỉ hiện dưới 900px (CSS) — từ 900px sidebar đã luôn hiển thị. */}
                    <button
                        className="nav-toggle-btn"
                        onClick={() => setNavOpen(v => !v)}
                        aria-label={t('nav.manage')}
                        aria-expanded={navOpen}
                        aria-controls="admin-sidebar"
                    >
                        {navOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                    <Cpu className="brand-logo" size={24} />
                    <div className="brand-text">
                        <h3>AISEED Corp. <span className="subtitle">· Admin</span></h3>
                        <p className="brand-meta">{t('brand.meta', { farms: farmCount, users: userCount })}</p>
                    </div>
                </div>

                <div className="topbar-actions">
                    <button
                        className="dashboard-link-btn"
                        disabled={!DASHBOARD_URL}
                        title={DASHBOARD_URL || t('detail.dashboardNotConfigured')}
                        onClick={() => DASHBOARD_URL && window.open(DASHBOARD_URL, '_blank', 'noopener')}
                    >
                        <LayoutGrid size={16} />
                        {/* Nhãn ẩn dưới 640px, nút còn lại icon — xem AdminLayout.css */}
                        <span className="dashboard-link-label">{t('nav.farmDashboard')}</span>
                    </button>
                    <LanguageSelector onLanguageChange={() => { }} />
                    <button className="user-profile-btn" onClick={onLogout} title={t('nav.logout')}>
                        HN
                    </button>
                </div>
            </header>

            <div className="admin-body">
                {/* Nền mờ sau drawer: bấm ra ngoài để đóng. Chỉ tồn tại khi drawer mở. */}
                {navOpen && (
                    <div
                        className="admin-nav-backdrop"
                        onClick={() => setNavOpen(false)}
                        aria-hidden="true"
                    />
                )}

                {/* Left Sidebar */}
                <aside
                    id="admin-sidebar"
                    className={navOpen ? 'admin-sidebar open' : 'admin-sidebar'}
                >
                    <div className="nav-group">
                        <h4 className="nav-group-title">{t('nav.manage')}</h4>
                        <NavLink to="/overview" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <LayoutDashboard size={18} />
                            <span>{t('nav.overview')}</span>
                        </NavLink>
                        <NavLink to="/farms" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <LayoutGrid size={18} />
                            <span>{t('nav.farms')}</span>
                            <span className="badge">{farmCount}</span>
                        </NavLink>
                        <NavLink to="/users" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <Users size={18} />
                            <span>{t('nav.users')}</span>
                            <span className="badge">{userCount}</span>
                        </NavLink>
                    </div>

                    <div className="nav-group">
                        <h4 className="nav-group-title">{t('nav.platform')}</h4>
                        <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <Bell size={18} />
                            <span>{t('nav.notifications')}</span>
                        </NavLink>
                        <NavLink to="/roles" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <Shield size={18} />
                            <span>{t('nav.roles')}</span>
                        </NavLink>
                        <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <BarChart3 size={18} />
                            <span>{t('nav.analytics')}</span>
                        </NavLink>
                        <NavLink to="/health" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <Activity size={18} />
                            <span>{t('nav.health')}</span>
                        </NavLink>
                    </div>

                    <div className="fleet-status-panel">
                        <h4 className="nav-group-title flex-center"><Activity size={14} className="mr-1" /> {t('nav.fleetStatus')}</h4>
                        <div className="status-row">
                            <span className="status-dot healthy"></span>
                            <span className="status-label">{t('nav.statusHealthy')}</span>
                            <span className="status-count">{fleetStatus.healthy}</span>
                        </div>
                        <div className="status-row">
                            <span className="status-dot warning"></span>
                            <span className="status-label">{t('nav.statusWarning')}</span>
                            <span className="status-count">{fleetStatus.warning}</span>
                        </div>
                        <div className="status-row">
                            <span className="status-dot critical"></span>
                            <span className="status-label">{t('nav.statusCritical')}</span>
                            <span className="status-count">{fleetStatus.critical}</span>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="admin-main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
