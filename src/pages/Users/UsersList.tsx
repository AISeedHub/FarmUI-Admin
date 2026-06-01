import { useTranslation } from 'react-i18next';

export default function UsersList() {
    const { t } = useTranslation();

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>{t('nav.users')}</h2>
            </div>
            <div className="panel" style={{ padding: '24px' }}>
                <p>{t('placeholder.usersComingSoon')}</p>
            </div>
        </div>
    );
}
