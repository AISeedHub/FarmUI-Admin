import { useTranslation } from 'react-i18next';
import './AutomationsTab.css';

export default function AutomationsTab() {
    const { t } = useTranslation();

    const rules = [
        { name: t('auto.daytimeHumidityHold'), p: 'P3', target: 'auto-target · interval · humidity < 68%', fires24h: [2, 5, 8, 3, 1, 6], lastFired: '07:14', today: 14, enabled: true },
        { name: t('auto.heatHumidityVentFan'), p: 'P5', target: 'threshold · edge · temp > 28 AND humid > 70', fires24h: [0, 1, 0, 4, 2, 1], lastFired: '06:48', today: 9, enabled: true },
        { name: t('auto.ledSchedule'), p: 'P1', target: 'schedule · interval · 04:30-18:00', fires24h: [1, 1, 1, 1, 1, 1], lastFired: '04:30', today: 1, enabled: true },
        { name: t('auto.pulseCirculationFan'), p: 'P4', target: 'interval · interval · CO2 > 800', fires24h: [0, 0, 0, 0, 0, 0], lastFired: '-', today: 0, enabled: false },
        { name: t('auto.ventSolarSpike'), p: 'P4', target: 'threshold · edge · solar > 750 W/m²', fires24h: [1, 2, 4, 1, 0, 0], lastFired: '11:32', today: 6, enabled: true },
        { name: t('auto.nightFrostGuard'), p: 'P5', target: 'threshold · edge · temp < 8°C', fires24h: [4, 6, 2, 0, 0, 0], lastFired: '03:11', today: 2, enabled: true },
    ];

    return (
        <div className="automations-tab">
            <div className="metrics-row">
                <div className="metric-box">
                    <span className="label">{t('auto.rules')}</span>
                    <span className="value">6</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('auto.enabled')}</span>
                    <span className="value">5</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('auto.firesToday')}</span>
                    <span className="value">32</span>
                </div>
                <div className="metric-box alert">
                    <span className="label">{t('auto.failingRules')}</span>
                    <span className="value">1</span>
                </div>
            </div>

            <div className="rules-section panel">
                <div className="section-header">
                    <div>
                        <h3>{t('auto.title')}</h3>
                        <p>{t('auto.desc')}</p>
                    </div>
                    <div className="actions">
                        <button className="secondary-btn">{t('auto.exportYaml')}</button>
                        <button className="primary-btn">{t('auto.publishRules')}</button>
                    </div>
                </div>

                <div className="rules-table">
                    <div className="table-header">
                        <div className="col-rule">{t('auto.colRule')}</div>
                        <div className="col-fires24h">{t('auto.colFires24h')}</div>
                        <div className="col-lastFired">{t('auto.colLastFired')}</div>
                        <div className="col-today">{t('auto.colToday')}</div>
                        <div className="col-enabled">{t('auto.colEnabled')}</div>
                    </div>
                    {rules.map((rule, idx) => (
                        <div className="table-row" key={idx}>
                            <div className="col-rule">
                                <div className="rule-name">
                                    <span className={`dot ${rule.enabled ? 'active' : 'inactive'}`}></span>
                                    {rule.name}
                                </div>
                                <div className="rule-target">
                                    <span className="priority">{rule.p}</span> - {rule.target}
                                </div>
                            </div>
                            <div className="col-fires24h">
                                <div className="mini-chart">
                                    {rule.fires24h.map((val, i) => (
                                        <div key={i} className="bar" style={{ height: `${(val / 8) * 100}%`, opacity: rule.enabled ? 1 : 0.3 }}></div>
                                    ))}
                                </div>
                            </div>
                            <div className="col-lastFired">{rule.lastFired}</div>
                            <div className="col-today">{rule.today}</div>
                            <div className="col-enabled">
                                <div className={`toggle ${rule.enabled ? 'on' : 'off'}`}>
                                    <div className="knob"></div>
                                </div>
                                <button className="history-btn">{t('auto.history')}</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
