import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, LayoutGrid, Cpu } from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';
import './AdminLayout.css';

interface AdminLayoutProps {
    onLogout: () => void;
}

export default function AdminLayout({ onLogout }: AdminLayoutProps) {
    const { t } = useTranslation();
    const [isScanning, setIsScanning] = useState(false);

    const handleLanguageChange = () => {
        setIsScanning(true);
        setTimeout(() => {
            setIsScanning(false);
        }, 1000);
    };

    return (
        <div className={`layout-container ${isScanning ? 'scanning-active' : ''}`}>
            {/* Holographic Cyber Scanner Overlay */}
            {isScanning && <div className="cyber-scanner-beam" />}
            {isScanning && <div className="cyber-scanner-grid" />}
            
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
                    <LanguageSelector onLanguageChange={handleLanguageChange} />
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
