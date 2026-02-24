import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/services';
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
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.login({
                email: username,
                password
            });

            localStorage.setItem('access_token', response.access_token);
            onLogin();
            navigate('/', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
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
                            placeholder="email@example.com"
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
