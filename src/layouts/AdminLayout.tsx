import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    LayoutGrid,
    Users,
    Shield,
    BarChart3,
    Activity,
    Cpu
} from 'lucide-react';
import { farmsApi, usersApi } from '../api/services';
import LanguageSelector from '../components/LanguageSelector';
import './AdminLayout.css';

interface AdminLayoutProps {
    onLogout: () => void;
}

export default function AdminLayout({ onLogout }: AdminLayoutProps) {
    const { t } = useTranslation();

    const [farmCount, setFarmCount] = useState(6);
    const [userCount, setUserCount] = useState(13);

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

    return (
        <div className="admin-layout-wrapper">
            {/* Top Bar Area for Logo and Profile/Lang */}
            <header className="admin-topbar">
                <div className="brand-section">
                    <Cpu className="brand-logo" size={24} />
                    <div className="brand-text">
                        <h3>AISEED Corp. <span className="subtitle">· Admin</span></h3>
                        <p className="brand-meta">{t('brand.meta', { farms: farmCount, users: userCount })}</p>
                    </div>
                </div>

                <div className="topbar-actions">
                    <button className="dashboard-link-btn">
                        <LayoutGrid size={16} /> {t('nav.farmDashboard')}
                    </button>
                    <LanguageSelector onLanguageChange={() => { }} />
                    <button className="user-profile-btn" onClick={onLogout} title={t('nav.logout')}>
                        HN
                    </button>
                </div>
            </header>

            <div className="admin-body">
                {/* Left Sidebar */}
                <aside className="admin-sidebar">
                    <div className="nav-group">
                        <h4 className="nav-group-title">{t('nav.manage')}</h4>
                        <NavLink to="/overview" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                            <LayoutDashboard size={18} />
                            <span>{t('nav.overview')}</span>
                        </NavLink>
                        <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} end>
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
