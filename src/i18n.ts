import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Translations
const resources = {
    en: {
        translation: {
            "login": "Login",
            "username": "Username",
            "password": "Password",
            "farms.title": "Farms Management",
            "nav.farms": "Farms",
            "nav.settings": "Settings",
            "nav.logout": "Logout",
            "btn.create": "Create",
            "btn.edit": "Edit",
            "btn.delete": "Delete",
            "btn.save": "Save",
            "btn.cancel": "Cancel",
        }
    },
    ko: {
        translation: {
            "login": "로그인",
            "username": "사용자 이름",
            "password": "비밀번호",
            "farms.title": "스마트팜 관리",
            "nav.farms": "스마트팜",
            "nav.settings": "설정",
            "nav.logout": "로그아웃",
            "btn.create": "생성",
            "btn.edit": "편집",
            "btn.delete": "삭제",
            "btn.save": "저장",
            "btn.cancel": "취소",
        }
    }
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: "en", // default language
        fallbackLng: "en",
        interpolation: {
            escapeValue: false
        }
    });

export default i18n;
