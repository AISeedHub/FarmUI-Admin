import { useState, useEffect } from 'react';
import { Activity, Wifi, Users, LayoutGrid, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { farmsApi, usersApi, automationsApi } from '../../api/services';
import { FleetFrequencyResponse } from '../../types';
import './Overview.css';

export default function Overview() {
    const { t } = useTranslation();

    const [farmCount, setFarmCount] = useState(0);
    const [userCount, setUserCount] = useState(0);
    const [heatmapData, setHeatmapData] = useState<FleetFrequencyResponse | null>(null);
    const [loadingHeatmap, setLoadingHeatmap] = useState(true);

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [farms, users] = await Promise.all([
                    farmsApi.getAll(),
                    usersApi.getAll()
                ]);
                setFarmCount(farms.length);
                setUserCount(users.length);
            } catch (err) {
                console.error("Failed to load counts in Overview", err);
            }
        };
        fetchCounts();
    }, []);

    useEffect(() => {
        const fetchHeatmap = async () => {
            try {
                const data = await automationsApi.getFleetFrequency('hour', 24);
                setHeatmapData(data);
            } catch (err) {
                console.error("Failed to load fleet heatmap data in Overview", err);
            } finally {
                setLoadingHeatmap(false);
            }
        };
        fetchHeatmap();
    }, []);

    return (
        <div className="overview-container">
            <div className="overview-header">
                <span className="subtitle">AGX-1000 · {t('overview.fleet')}</span>
                <h2>{t('overview.title')}</h2>
                <div className="header-actions">
                    <button className="fleet-alerts-btn"><span className="dot"></span> {t('overview.alertsCount', { count: 12 })}</button>
                    <button className="status-page-btn">{t('overview.statusPage')}</button>
                </div>
            </div>

            <div className="metrics-grid">
                <div className="metric-card panel">
                    <div className="metric-title"><LayoutGrid size={14} /> {t('nav.farms').toUpperCase()}</div>
                    <div className="metric-value">{farmCount}</div>
                    <div className="metric-trend positive">{t('overview.healthyCount')}</div>
                </div>
                <div className="metric-card panel">
                    <div className="metric-title"><Users size={14} /> {t('nav.users').toUpperCase()}</div>
                    <div className="metric-value">{userCount}</div>
                    <div className="metric-trend positive">{t('overview.activeCount')}</div>
                </div>
                <div className="metric-card panel">
                    <div className="metric-title"><Wifi size={14} /> {t('overview.connectedDevices')}</div>
                    <div className="metric-value">170</div>
                    <div className="metric-trend">{t('overview.sensorsAndActuators')}</div>
                </div>
                <div className="metric-card panel">
                    <div className="metric-title"><Zap size={14} /> {t('overview.automationFires')}</div>
                    <div className="metric-value">93</div>
                    <div className="metric-trend positive">{t('overview.activeRulesCount')}</div>
                </div>
            </div>

            <div className="middle-row">
                <div className="farm-health-section panel">
                    <div className="section-header">
                        <div>
                            <h3>{t('overview.farmHealth')}</h3>
                            <p>{t('overview.uptimeAlertsDesc')}</p>
                        </div>
                        <button className="manage-btn">{t('overview.manageFarms')}</button>
                    </div>
                    <div className="farm-list">
                        {[
                            { name: 'Saigon Rooftop', code: 'SAIGON-01', loc: 'Hồ Chí Minh', zones: 2, uptime: '99.9%', status: 'Healthy' },
                            { name: 'Mekong Greens', code: 'MEKONG-02', loc: 'Cần Thơ', zones: 5, uptime: '99.4%', status: 'Healthy' },
                            { name: 'Delta Rice Co-op', code: 'DELTA-03', loc: 'An Giang', zones: 12, uptime: '97.1%', status: 'Warning' },
                            { name: 'Highland Berries', code: 'DALAT-04', loc: 'Đà Lạt', zones: 4, uptime: '99.8%', status: 'Healthy' },
                            { name: 'Mekong Shrimp + Rice', code: 'SHRIMP-05', loc: 'Sóc Trăng', zones: 8, uptime: '88.2%', status: 'Critical' },
                            { name: 'Central Coffee Estate', code: 'COFFEE-06', loc: 'Đắk Lắk', zones: 7, uptime: '99.9%', status: 'Healthy' },
                        ].map((farm, idx) => (
                            <div className="farm-list-item" key={idx}>
                                <div className="farm-icon"><LayoutGrid size={16} /></div>
                                <div className="farm-info">
                                    <span className="name">{farm.name} <span className="code">{farm.code}</span></span>
                                    <span className="loc">{farm.loc} · {farm.zones} {t('detail.zones').toLowerCase()}</span>
                                </div>
                                <div className="farm-stats">
                                    <span className="uptime-label">{t('overview.uptime')}</span>
                                    <span className={`uptime-val ${farm.status.toLowerCase()}`}>{farm.uptime}</span>
                                    <span className={`status-badge ${farm.status.toLowerCase()}`}>
                                        <span className="dot"></span> {t(`nav.status${farm.status}`)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="recent-activity-section panel">
                    <div className="section-header">
                        <div>
                            <h3>{t('overview.recentActivity')}</h3>
                            <p>{t('overview.acrossFleet')}</p>
                        </div>
                    </div>
                    <div className="activity-list">
                        {[
                            { type: 'alert', title: 'SHRIMP-05 gateway offline', desc: 'Mekong Shrimp · 7 alerts', time: '12m' },
                            { type: 'user', title: 'New user invited', desc: 'sang@centralcoffee.vn · operator', time: '1h' },
                            { type: 'system', title: 'Plan upgraded to Enterprise', desc: 'DELTA-03 Delta Rice', time: '3h' },
                            { type: 'farm', title: 'Farm provisioned', desc: 'DALAT-04 · 11 sensors paired', time: '1d' },
                            { type: 'security', title: '2FA enforced for managers', desc: 'Policy update', time: '2d' }
                        ].map((act, idx) => (
                            <div className="activity-item" key={idx}>
                                <div className={`act-icon ${act.type}`}><Activity size={14} /></div>
                                <div className="act-info">
                                    <span className="title">{act.title}</span>
                                    <span className="desc">{act.desc}</span>
                                </div>
                                <div className="act-time">{act.time}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="heatmap-section panel">
                <div className="section-header">
                    <div>
                        <h3>{t('overview.heatmapTitle')}</h3>
                        <p>{t('overview.heatmapDesc')}</p>
                    </div>
                    <button className="text-btn">{t('overview.fullAnalytics')}</button>
                </div>
                <div className="heatmap-grid">
                    {loadingHeatmap ? (
                        Array.from({ length: 6 }).map((_, idx) => (
                            <div className="heatmap-row" key={idx}>
                                <div className="row-label skeleton-text"></div>
                                <div className="blocks">
                                    {Array.from({ length: 24 }).map((_, i) => (
                                        <div key={i} className="block skeleton-block"></div>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : heatmapData && heatmapData.farms && heatmapData.farms.length > 0 ? (
                        heatmapData.farms.map(farm => (
                            <div className="heatmap-row" key={farm.farm_id}>
                                <span className="row-label" title={farm.farm_name}>{farm.farm_code}</span>
                                <div className="blocks">
                                    {farm.counts.map((count, i) => {
                                        const timestamp = heatmapData.bucket_starts[i];
                                        const date = new Date(timestamp);
                                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                                        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                        
                                        let valClass = 'val-0';
                                        if (count > 0 && count <= 2) valClass = 'val-1';
                                        else if (count > 2 && count <= 5) valClass = 'val-2';
                                        else if (count > 5 && count <= 10) valClass = 'val-3';
                                        else if (count > 10) valClass = 'val-4';

                                        return (
                                            <div className="block-wrapper" key={i}>
                                                <div className={`block ${valClass}`}></div>
                                                <div className="tooltip">
                                                    <span className="farm-name">{farm.farm_name}</span>
                                                    <span className="time">{dateStr} {timeStr}</span>
                                                    <span className="count">{t('overview.firesCount', { count })}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="heatmap-empty">
                            {t('overview.noHeatmapData')}
                        </div>
                    )}
                    
                    {!loadingHeatmap && heatmapData && heatmapData.bucket_starts && heatmapData.farms && heatmapData.farms.length > 0 && (
                        <div className="heatmap-x-axis">
                            {heatmapData.bucket_starts.map((start, idx) => {
                                const date = new Date(start);
                                const hour = date.getHours();
                                const shouldShowLabel = idx % 6 === 0 || idx === 23;
                                return (
                                    <span 
                                        key={idx} 
                                        className="x-axis-label" 
                                        style={{ visibility: shouldShowLabel ? 'visible' : 'hidden' }}
                                    >
                                        {hour}:00
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
