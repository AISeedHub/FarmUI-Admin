import { useTranslation } from 'react-i18next';
import './AnalyticsTab.css';

export default function AnalyticsTab() {
    const { t } = useTranslation();

    return (
        <div className="analytics-tab">
            <div className="analytics-main panel">
                <div className="section-header">
                    <div>
                        <h3>{t('analytics.executions')}</h3>
                        <p>{t('analytics.allRules24h')}</p>
                    </div>
                </div>
                <div className="chart-placeholder">
                    {/* Mock Chart Area */}
                    <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgba(21, 128, 61, 0.2)" />
                                <stop offset="100%" stopColor="rgba(21, 128, 61, 0)" />
                            </linearGradient>
                        </defs>
                        <path d="M0,180 L100,140 L200,160 L300,140 L400,100 L450,40 L500,90 L600,110 L700,160 L800,140 L800,200 L0,200 Z" fill="url(#fillArea)" />
                        <path d="M0,180 L100,140 L200,160 L300,140 L400,100 L450,40 L500,90 L600,110 L700,160 L800,140" fill="none" stroke="#15803D" strokeWidth="3" />
                        
                        {/* Grid Lines */}
                        <line x1="0" y1="50" x2="800" y2="50" stroke="#E5E7EB" strokeDasharray="4 4" />
                        <line x1="0" y1="100" x2="800" y2="100" stroke="#E5E7EB" strokeDasharray="4 4" />
                        <line x1="0" y1="150" x2="800" y2="150" stroke="#E5E7EB" strokeDasharray="4 4" />
                        
                        {/* Y-Axis Labels */}
                        <text x="10" y="55" fill="#6B7280" fontSize="12">13</text>
                        <text x="10" y="105" fill="#6B7280" fontSize="12">9</text>
                        <text x="10" y="155" fill="#6B7280" fontSize="12">4</text>
                        <text x="10" y="195" fill="#6B7280" fontSize="12">0</text>
                    </svg>
                    <div className="x-axis-labels">
                        <span>-24h</span>
                        <span>-18h</span>
                        <span>-12h</span>
                        <span>-6h</span>
                        <span>-0h</span>
                    </div>
                </div>
            </div>

            <div className="analytics-split">
                <div className="panel split-card">
                    <div className="section-header">
                        <div>
                            <h3>{t('analytics.cmdsBySource')}</h3>
                            <p>{t('analytics.cmdsSourceDesc')}</p>
                        </div>
                    </div>
                    <div className="donut-chart-mock">
                        <div className="donut-ring">
                            <span className="center-val">14<br/><small>{t('analytics.centerCmds')}</small></span>
                        </div>
                        <div className="legend">
                            <div className="item"><span className="dot user"></span> {t('analytics.sourceUser')}: 21%</div>
                            <div className="item"><span className="dot auto"></span> {t('analytics.sourceAuto')}: 71%</div>
                            <div className="item"><span className="dot api"></span> {t('analytics.sourceApi')}: 7%</div>
                        </div>
                    </div>
                </div>
                
                <div className="panel split-card">
                    <div className="section-header">
                        <div>
                            <h3>{t('analytics.cmdDelivery')}</h3>
                            <p>{t('analytics.deliveryDesc')}</p>
                        </div>
                    </div>
                    <div className="donut-chart-mock">
                        <div className="donut-ring delivery">
                            <span className="center-val">11<br/><small>{t('analytics.centerAcked')}</small></span>
                        </div>
                        <div className="legend">
                            <div className="item"><span className="dot ack"></span> {t('analytics.statusAcked')}: 79%</div>
                            <div className="item"><span className="dot sent"></span> {t('analytics.statusSent')}: 0%</div>
                            <div className="item"><span className="dot pend"></span> {t('analytics.statusPending')}: 7%</div>
                            <div className="item"><span className="dot fail"></span> {t('analytics.statusFailed')}: 14%</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
