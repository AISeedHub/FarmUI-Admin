// src/constants/aiReport.ts — theo FarmBE src/services/ai_reports/context.py CROP_ALIASES
export const AI_REPORT_CROP_ALIASES = ['lemon', '레몬', 'citrus', 'eureka'];
export const AI_REPORT_CROP_OPTIONS = ['lemon'];
export const hasCropKnowledge = (c?: string | null) =>
  !!c && AI_REPORT_CROP_ALIASES.includes(c.trim().toLowerCase());

// Danh sách tên tỉnh của Hàn Quốc (tránh nhầm với huyện/đảo như 진도, 완도)
export const KMA_PROVINCE_NAMES = [
  '경기도',
  '강원도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전라북도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주도',
  '제주특별자치도',
];

export const isKoreanText = (text: string) => /[\uac00-\ud7a3]/.test(text);
