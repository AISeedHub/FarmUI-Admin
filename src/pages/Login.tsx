import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/services';
import LanguageSelector from '../components/LanguageSelector';
import './Login.css';

interface LoginProps {
    onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.login({
                username,
                password
            });

            localStorage.setItem('access_token', response.access_token);
            onLogin();
            navigate('/overview', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    const [isScanning, setIsScanning] = useState(false);

    const handleLanguageChange = () => {
        setIsScanning(true);
        setTimeout(() => {
            setIsScanning(false);
        }, 1000);
    };

    return (
        <div className={`login-container ${isScanning ? 'scanning-active' : ''}`}>
            {isScanning && <div className="cyber-scanner-beam" />}
            {isScanning && <div className="cyber-scanner-grid" />}

            <div className="login-panel panel">
                <div className="login-header">
                    <h2>{t('farms.title')}</h2>
                    <LanguageSelector onLanguageChange={handleLanguageChange} />
                </div>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>{t('username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('password')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="admin"
                        />
                    </div>

                    {error && <div className="error-text">{error}</div>}

                    <button type="submit" className="primary full-width mt-4" disabled={isLoading}>
                        {isLoading ? 'Logging in...' : t('login')}
                    </button>
                </form>
            </div>
        </div>
    );
}
