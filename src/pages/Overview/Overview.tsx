import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Wifi, Users, LayoutGrid, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { farmsApi, usersApi, devicesApi, zonesApi, automationsApi } from '../../api/services';
import { Farm, Zone, Device, AutomationScene, FleetFrequencyResponse } from '../../types';
import './Overview.css';

interface FarmHealthRow {
    farm: Farm;
    zoneCount: number;
}

interface FarmScaleData {
    farm: Farm;
    zones: number;
    devices: number;
    automations: number;
}

export default function Overview() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [farmCount, setFarmCount] = useState(0);
    const [userCount, setUserCount] = useState(0);
    const [deviceCount, setDeviceCount] = useState(0);
    const [automationFiresToday, setAutomationFiresToday] = useState(0);
    const [enabledRulesCount, setEnabledRulesCount] = useState(0);
    const [heatmapData, setHeatmapData] = useState<FleetFrequencyResponse | null>(null);
    const [loadingHeatmap, setLoadingHeatmap] = useState(true);
    const [farmHealthRows, setFarmHealthRows] = useState<FarmHealthRow[]>([]);
    const [loadingFarmHealth, setLoadingFarmHealth] = useState(true);
    const [farmScaleData, setFarmScaleData] = useState<FarmScaleData[]>([]);
    const [loadingScale, setLoadingScale] = useState(true);

    // Fetch farms, users, devices, and automation counts
    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [farms, users] = await Promise.all([
                    farmsApi.getAll(),
                    usersApi.getAll()
                ]);
                setFarmCount(farms.length);
                setUserCount(users.length);

                // Fetch devices, zones, and automations per farm in parallel
                const perFarmResults = await Promise.all(
                    farms.map(async (farm) => {
                        const [devices, zones, automations] = await Promise.all([
                            devicesApi.getByFarm(farm.id).catch(() => [] as Device[]),
                            zonesApi.getByFarm(farm.id).catch(() => [] as Zone[]),
                            automationsApi.getByFarm(farm.id).catch(() => [] as AutomationScene[])
                        ]);
                        return { farm, devices, zones, automations };
                    })
                );

                // Total device count
                const totalDevices = perFarmResults.reduce((sum, r) => sum + r.devices.length, 0);
                setDeviceCount(totalDevices);

                // Enabled automation rules count
                const totalEnabled = perFarmResults.reduce(
                    (sum, r) => sum + r.automations.filter(a => a.is_enabled).length, 0
                );
                setEnabledRulesCount(totalEnabled);

                // Farm health rows (farm + zone count)
                const healthRows: FarmHealthRow[] = perFarmResults.map(r => ({
                    farm: r.farm,
                    zoneCount: r.zones.length
                }));
                setFarmHealthRows(healthRows);
                setLoadingFarmHealth(false);

                // Farm scale comparison data
                const scaleData: FarmScaleData[] = perFarmResults.map(r => ({
                    farm: r.farm,
                    zones: r.zones.length,
                    devices: r.devices.length,
                    automations: r.automations.length
                }));
                setFarmScaleData(scaleData);
                setLoadingScale(false);

            } catch (err) {
                console.error("Failed to load counts in Overview", err);
                setLoadingFarmHealth(false);
                setLoadingScale(false);
            }
        };
        fetchCounts();
    }, []);

    // Fetch heatmap data + compute today's fires
    useEffect(() => {
        const fetchHeatmap = async () => {
            try {
                const data = await automationsApi.getFleetFrequency('hour', 24);
                setHeatmapData(data);

                // Sum the last bucket (most recent hour) totals across all farms as "fires today"
                // Actually, sum ALL counts across all farms for the 24h window
                if (data?.farms) {
                    const totalFires = data.farms.reduce((sum, farm) => sum + farm.total, 0);
                    setAutomationFiresToday(totalFires);
                }
            } catch (err) {
                console.error("Failed to load fleet heatmap data in Overview", err);
            } finally {
                setLoadingHeatmap(false);
            }
        };
        fetchHeatmap();
    }, []);

    // Compute max value for bar chart scaling
    const maxScaleValue = farmScaleData.length > 0
        ? Math.max(...farmScaleData.flatMap(d => [d.zones, d.devices, d.automations]), 1)
        : 1;

    const activeFarms = farmHealthRows.filter(r => r.farm.is_active).length;

    return (
        <div className="overview-container">
            <div className="overview-header">
                <span className="subtitle">AGX-1000 · {t('overview.fleet')}</span>
                <h2>{t('overview.title')}</h2>
                <div className="header-actions">
                    {/* TODO: Alert count requires a fleet alerts API — hardcoded for now */}
                    <button className="fleet-alerts-btn"><span className="dot"></span> {t('overview.alertsCount', { count: 12 })}</button>
                    <button className="status-page-btn">{t('overview.statusPage')}</button>
                </div>
            </div>

            <div className="metrics-grid">
                <div className="metric-card panel">
                    <div className="metric-title"><LayoutGrid size={14} /> {t('nav.farms').toUpperCase()}</div>
                    <div className="metric-value">{farmCount}</div>
                    <div className="metric-trend positive">{activeFarms} {t('nav.statusHealthy').toLowerCase()}</div>
                </div>
                <div className="metric-card panel">
                    <div className="metric-title"><Users size={14} /> {t('nav.users').toUpperCase()}</div>
                    <div className="metric-value">{userCount}</div>
                    <div className="metric-trend positive">{t('overview.activeCount')}</div>
                </div>
                <div className="metric-card panel">
                    <div className="metric-title"><Wifi size={14} /> {t('overview.connectedDevices')}</div>
                    <div className="metric-value">{deviceCount}</div>
                    <div className="metric-trend">{t('overview.sensorsAndActuators')}</div>
                </div>
                <div className="metric-card panel">
                    <div className="metric-title"><Zap size={14} /> {t('overview.automationFires')}</div>
                    <div className="metric-value">{automationFiresToday}</div>
                    <div className="metric-trend positive">{enabledRulesCount} {t('overview.activeRules')}</div>
                </div>
            </div>

            <div className="middle-row">
                <div className="farm-health-section panel">
                    <div className="section-header">
                        <div>
                            <h3>{t('overview.farmHealth')}</h3>
                            <p>{t('overview.uptimeAlertsDesc')}</p>
                        </div>
                        <button className="manage-btn" onClick={() => navigate('/farms')}>{t('overview.manageFarms')}</button>
                    </div>
                    <div className="farm-list">
                        {loadingFarmHealth ? (
                            Array.from({ length: 4 }).map((_, idx) => (
                                <div className="farm-list-item" key={idx}>
                                    <div className="farm-icon"><LayoutGrid size={16} /></div>
                                    <div className="farm-info">
                                        <span className="name"><span className="skeleton-text" style={{ width: 120 }}></span></span>
                                        <span className="loc"><span className="skeleton-text" style={{ width: 80 }}></span></span>
                                    </div>
                                </div>
                            ))
                        ) : farmHealthRows.length > 0 ? (
                            farmHealthRows.map((row) => (
                                <div className="farm-list-item" key={row.farm.id}>
                                    <div className="farm-icon"><LayoutGrid size={16} /></div>
                                    <div className="farm-info">
                                        <span className="name">
                                            {row.farm.name} <span className="code">{row.farm.code}</span>
                                        </span>
                                        <span className="loc">
                                            {row.farm.location || '—'} · {row.zoneCount} {t('detail.zones').toLowerCase()}
                                        </span>
                                    </div>
                                    <div className="farm-stats">
                                        <span className={`status-badge ${row.farm.is_active ? 'healthy' : 'critical'}`}>
                                            <span className="dot"></span> {row.farm.is_active ? t('nav.statusHealthy') : t('farms.inactive')}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="farm-list-empty">{t('overview.noFarms')}</div>
                        )}
                    </div>
                </div>

                <div className="farm-scale-section panel">
                    <div className="section-header">
                        <div>
                            <h3>{t('overview.farmScale')}</h3>
                            <p>{t('overview.farmScaleDesc')}</p>
                        </div>
                    </div>
                    <div className="scale-chart">
                        {loadingScale ? (
                            Array.from({ length: 3 }).map((_, idx) => (
                                <div className="scale-row" key={idx}>
                                    <div className="scale-label skeleton-text"></div>
                                    <div className="scale-bars">
                                        <div className="scale-bar skeleton-block" style={{ width: '60%' }}></div>
                                    </div>
                                </div>
                            ))
                        ) : farmScaleData.length > 0 ? (
                            farmScaleData.map((d) => (
                                <div className="scale-row" key={d.farm.id}>
                                    <div className="scale-label" title={d.farm.name}>{d.farm.code}</div>
                                    <div className="scale-bars">
                                        <div className="scale-bar-group">
                                            <div
                                                className="scale-bar bar-zones"
                                                style={{ width: `${(d.zones / maxScaleValue) * 100}%` }}
                                            >
                                                <span className="bar-value">{d.zones}</span>
                                            </div>
                                            <div
                                                className="scale-bar bar-devices"
                                                style={{ width: `${(d.devices / maxScaleValue) * 100}%` }}
                                            >
                                                <span className="bar-value">{d.devices}</span>
                                            </div>
                                            <div
                                                className="scale-bar bar-automations"
                                                style={{ width: `${(d.automations / maxScaleValue) * 100}%` }}
                                            >
                                                <span className="bar-value">{d.automations}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="scale-empty">{t('overview.noFarms')}</div>
                        )}
                        {!loadingScale && farmScaleData.length > 0 && (
                            <div className="scale-legend">
                                <span className="legend-item"><span className="legend-dot zones"></span> {t('detail.zones')}</span>
                                <span className="legend-item"><span className="legend-dot devices"></span> {t('detail.devices')}</span>
                                <span className="legend-item"><span className="legend-dot automations"></span> {t('overview.automationsLabel')}</span>
                            </div>
                        )}
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
