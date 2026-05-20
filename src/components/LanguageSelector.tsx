import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import './LanguageSelector.css';

interface LanguageSelectorProps {
    onLanguageChange?: (lang: string) => void;
}

export default function LanguageSelector({ onLanguageChange }: LanguageSelectorProps) {
    const { i18n } = useTranslation();

    const toggleLanguage = () => {
        const nextLang = i18n.language === 'en' ? 'ko' : 'en';
        i18n.changeLanguage(nextLang);
        if (onLanguageChange) {
            onLanguageChange(nextLang);
        }
    };

    return (
        <button className="lang-toggle-btn" onClick={toggleLanguage} title="Switch Language / Ngôn ngữ">
            <Globe size={14} />
            <span>{i18n.language === 'en' ? 'EN' : 'KO'}</span>
        </button>
    );
}
