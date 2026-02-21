import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Login.css';

interface LoginProps {
    onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Fixed account authentication
        if (username === 'admin' && password === 'admin') {
            onLogin();
            navigate('/', { replace: true });
        } else {
            setError('Invalid credentials. Use admin/admin');
        }
    };

    const toggleLang = () => {
        i18n.changeLanguage(i18n.language === 'en' ? 'ko' : 'en');
    };

    return (
        <div className="login-container">
            <div className="login-panel panel">
                <div className="login-header">
                    <h2>{t('farms.title')}</h2>
                    <button className="lang-toggle" onClick={toggleLang}>
                        {i18n.language === 'en' ? '한' : 'EN'}
                    </button>
                </div>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>{t('username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
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

                    <button type="submit" className="primary full-width mt-4">
                        {t('login')}
                    </button>
                </form>
            </div>
        </div>
    );
}
