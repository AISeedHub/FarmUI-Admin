import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, LayoutGrid, Cpu } from 'lucide-react';
import './AdminLayout.css';

interface AdminLayoutProps {
    onLogout: () => void;
}

export default function AdminLayout({ onLogout }: AdminLayoutProps) {
    const { t, i18n } = useTranslation();

    const toggleLang = () => {
        i18n.changeLanguage(i18n.language === 'en' ? 'ko' : 'en');
    };

    return (
        <div className="layout-container">
            {/* Top Header Navigation */}
            <header className="top-nav panel">
                <div className="nav-brand">
                    <Cpu className="brand-logo" size={24} />
                    <h3>AISEED Corp. <span className="subtitle">| FarmUI</span></h3>
                </div>

                <nav className="nav-links">
                    <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} end>
                        <LayoutGrid size={18} />
                        <span>{t('nav.farms')}</span>
                    </NavLink>
                </nav>

                <div className="nav-actions">
                    <button className="nav-btn" onClick={toggleLang}>
                        {i18n.language === 'en' ? 'KO' : 'EN'}
                    </button>
                    <button className="nav-btn logout-btn" onClick={onLogout}>
                        <LogOut size={16} />
                        <span>{t('nav.logout')}</span>
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
