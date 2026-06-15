import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Send, Loader2, AlertTriangle, RefreshCw, X, Activity, CheckCircle, Clock, Cpu, Zap, User, Plus, Pencil, Trash2 } from 'lucide-react';
import { automationsApi, usersApi } from '../../../api/services';
import { AutomationScene, AutomationActivityMap, ExecutionHistoryRow, UserResponse } from '../../../types';
import AutomationEditorModal from './AutomationEditorModal';
import './AutomationsTab.css';

interface AutomationsTabProps {
    farmId: string;
}

export default function AutomationsTab({ farmId }: AutomationsTabProps) {
    const { t } = useTranslation();

    const [rules, setRules] = useState<AutomationScene[]>([]);
    const [originalRules, setOriginalRules] = useState<AutomationScene[]>([]);
    const [activity, setActivity] = useState<AutomationActivityMap>({});
    const [users, setUsers] = useState<Record<string, UserResponse>>({});
    const [frequency, setFrequency] = useState<Record<string, Array<{ bucket_start: string; count: number }>>>({});
    const [weeklyFrequency, setWeeklyFrequency] = useState<Record<string, Array<{ bucket_start: string; count: number }>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const get24hData = (buckets: Array<{ bucket_start: string; count: number }> = []) => {
        const result: number[] = [];
        const now = new Date();
        for (let i = 23; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 60 * 60 * 1000);
            d.setMinutes(0, 0, 0);
            const timeKey = d.getTime();
            
            const match = buckets.find(b => {
                const bDate = new Date(b.bucket_start);
                bDate.setMinutes(0, 0, 0);
                return bDate.getTime() === timeKey;
            });
            
            result.push(match ? match.count : 0);
        }
        return result;
    };

    const get7dData = (buckets: Array<{ bucket_start: string; count: number }> = []) => {
        const result: number[] = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            d.setHours(0, 0, 0, 0);
            const timeKey = d.getTime();
            
            const match = buckets.find(b => {
                const bDate = new Date(b.bucket_start);
                bDate.setHours(0, 0, 0, 0);
                return bDate.getTime() === timeKey;
            });
            
            result.push(match ? match.count : 0);
        }
        return result;
    };

    const renderSparklineSVG = (buckets: Array<{ bucket_start: string; count: number }> = [], isEnabled: boolean) => {
        const data = get24hData(buckets);
        const maxVal = Math.max(...data, 1);
        const width = 48;
        const height = 14;
        const padding = 1;
        
        const points = data.map((val, index) => {
            const x = (index / (data.length - 1)) * width;
            const y = height - padding - (val / maxVal) * (height - 2 * padding);
            return { x, y };
        });

        const pathD = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const fillPoints = `0,${height} ${pathD} ${width},${height}`;

        return (
            <svg 
                width={width} 
                height={height} 
                className="sparkline-svg"
                style={{ opacity: isEnabled ? 1 : 0.4 }}
            >
                <defs>
                    <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                    </linearGradient>
                </defs>
                <polygon points={fillPoints} fill="url(#sparklineGrad)" />
                <polyline 
                    points={pathD} 
                    fill="none" 
                    stroke="#10B981" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                />
            </svg>
        );
    };

    // Dynamic actions status
    const [exporting, setExporting] = useState(false);
    const [publishing, setPublishing] = useState(false);

    // History drawer state
    const [historyRule, setHistoryRule] = useState<AutomationScene | null>(null);
    const [historyLogs, setHistoryLogs] = useState<ExecutionHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Create / edit editor state (null editId = create)
    const [editorOpen, setEditorOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    const openCreate = () => { setEditId(null); setEditorOpen(true); };
    const openEdit = (rule: AutomationScene) => { setEditId(rule.id); setEditorOpen(true); };
    const handleEditorSaved = () => { setEditorOpen(false); loadData(); };

    const handleDeleteRule = async (rule: AutomationScene) => {
        if (!window.confirm(t('auto.deleteConfirm'))) return;
        try {
            await automationsApi.delete(rule.id);
            alert(t('auto.deleteSuccess'));
            loadData();
        } catch (err: any) {
            alert(t('auto.deleteFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    useEffect(() => {
        if (farmId) {
            loadData();
        }
    }, [farmId]);

    useEffect(() => {
        if (!historyRule) {
            setHistoryLogs([]);
            return;
        }

        const fetchLogs = async () => {
            setHistoryLoading(true);
            try {
                const logs = await automationsApi.getExecutions(historyRule.id, 20);
                setHistoryLogs(logs);
            } catch (err) {
                console.error('Failed to load executions history:', err);
            } finally {
                setHistoryLoading(false);
            }
        };

        fetchLogs();
    }, [historyRule]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use Promise.allSettled for telemetry indicators (activity/frequency) so that even if
            // those fail or return empty, the main scenes listing doesn't block loading.
            const rulesPromise = automationsApi.getByFarm(farmId);
            const activityPromise = automationsApi.getActivity(farmId).catch(err => {
                console.warn('Failed to load activity summary:', err);
                return {} as AutomationActivityMap;
            });
            const frequencyPromise = automationsApi.getFrequency(farmId, 'hour', 24).catch(err => {
                console.warn('Failed to load frequency sparklines:', err);
                return {} as Record<string, Array<{ bucket_start: string; count: number }>>;
            });
            const weeklyFrequencyPromise = automationsApi.getFrequency(farmId, 'day', 7).catch(err => {
                console.warn('Failed to load weekly frequency:', err);
                return {} as Record<string, Array<{ bucket_start: string; count: number }>>;
            });
            // Users directory to resolve created_by/updated_by ids → name + role.
            // May 403 for non-admins; degrade gracefully (no creator shown).
            const usersPromise = usersApi.getAll().then(list => {
                const map: Record<string, UserResponse> = {};
                list.forEach(u => { map[u.id] = u; });
                return map;
            }).catch(err => {
                console.warn('Failed to load users directory:', err);
                return {} as Record<string, UserResponse>;
            });

            const [rulesResult, activityResult, frequencyResult, weeklyFrequencyResult, usersResult] = await Promise.all([
                rulesPromise,
                activityPromise,
                frequencyPromise,
                weeklyFrequencyPromise,
                usersPromise
            ]);

            setRules(rulesResult);
            setOriginalRules(JSON.parse(JSON.stringify(rulesResult)));
            setActivity(activityResult);
            setFrequency(frequencyResult);
            setWeeklyFrequency(weeklyFrequencyResult);
            setUsers(usersResult);
        } catch (err: any) {
            console.error('Failed to load automation data:', err);
            setError(err?.message || 'Failed to load automations');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (rule: AutomationScene) => {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r));
    };

    const handleSubmitChanges = async () => {
        setPublishing(true);
        try {
            // Find all rules where is_enabled changed
            const changedRules = rules.filter(r => {
                const orig = originalRules.find(o => o.id === r.id);
                return orig && orig.is_enabled !== r.is_enabled;
            });

            if (changedRules.length > 0) {
                // Call API updates in parallel
                await Promise.all(
                    changedRules.map(r => automationsApi.update(r.id, { is_enabled: r.is_enabled }))
                );
            }

            // Call compile and publish rules
            const res = await automationsApi.publishRules(farmId);
            alert(res.message || 'Changes saved & rules published successfully!');

            // Sync original rules
            setOriginalRules(JSON.parse(JSON.stringify(rules)));
        } catch (err: any) {
            alert(`Failed to save changes: ${err?.message || 'Unknown error'}`);
        } finally {
            setPublishing(false);
        }
    };

    const handleExportYaml = async () => {
        setExporting(true);
        try {
            const yamlStr = await automationsApi.exportRules(farmId);
            const blob = new Blob([yamlStr], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rules_farm_${farmId}.yaml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(`Failed to export rules: ${err?.message || 'Unknown error'}`);
        } finally {
            setExporting(false);
        }
    };

    // Calculate aggregated metrics
    const rulesCount = rules.length;
    const enabledCount = rules.filter(r => r.is_enabled).length;
    const firesToday = rules.reduce((acc, rule) => acc + (activity[rule.id]?.count_today || 0), 0);
    const failingRules = rules.filter(rule => (activity[rule.id]?.recent_failed || 0) > 0).length;

    const changedRulesCount = rules.filter(r => {
        const orig = originalRules.find(o => o.id === r.id);
        return orig && orig.is_enabled !== r.is_enabled;
    }).length;

    if (loading) {
        return (
            <div className="automations-tab loading-state">
                <Loader2 className="spinner" size={24} />
                <span>{t('common.loading')}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="automations-tab error-state">
                <AlertTriangle size={24} />
                <span>{error}</span>
                <button className="secondary-btn" onClick={loadData}>
                    <RefreshCw size={14} /> Retry
                </button>
            </div>
        );
    }

    return (
        <div className="automations-tab">
            <div className="metrics-row">
                <div className="metric-box">
                    <span className="label">{t('auto.rules')}</span>
                    <span className="value">{rulesCount}</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('auto.enabled')}</span>
                    <span className="value">{enabledCount}</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('auto.firesToday')}</span>
                    <span className="value">{firesToday}</span>
                </div>
                <div className="metric-box alert">
                    <span className="label">{t('auto.failingRules')}</span>
                    <span className="value">{failingRules}</span>
                </div>
            </div>

            <div className="rules-section panel">
                <div className="section-header">
                    <div>
                        <h3>{t('auto.title')}</h3>
                        <p>{t('auto.desc')}</p>
                    </div>
                    <div className="actions">
                        <button
                            className="primary-btn flex-center"
                            onClick={openCreate}
                        >
                            <Plus size={14} />
                            {t('auto.newRule')}
                        </button>
                        <button
                            className="secondary-btn flex-center"
                            onClick={handleExportYaml}
                            disabled={exporting}
                        >
                            {exporting ? (
                                <Loader2 className="spinner" size={14} />
                            ) : (
                                <Download size={14} />
                            )}
                            {t('auto.exportYaml')}
                        </button>
                        <button
                            className="primary-btn flex-center"
                            onClick={handleSubmitChanges}
                            disabled={publishing}
                        >
                            {publishing ? (
                                <Loader2 className="spinner" size={14} />
                            ) : (
                                <Send size={14} />
                            )}
                            {t('auto.publishRules')}{changedRulesCount > 0 ? ` (${changedRulesCount})` : ''}
                        </button>
                    </div>
                </div>

                <div className="rules-table">
                    <div className="table-header">
                        <div className="col-rule">{t('auto.colRule')}</div>
                        <div className="col-fires24h">{t('auto.colFires24h')}</div>
                        <div className="col-lastFired">{t('auto.colLastFired')}</div>
                        <div className="col-today">{t('auto.colToday')}</div>
                        <div className="col-enabled" style={{ gap: '12px' }}>
                            <div style={{ width: '36px', display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                                {t('auto.colEnabled')}
                            </div>
                            <button className="history-btn" style={{ visibility: 'hidden', pointerEvents: 'none' }}>
                                <Clock size={12} />
                                <span>{t('auto.history')}</span>
                            </button>
                        </div>
                    </div>
                    {rules.map((rule) => {
                        const act = activity[rule.id] || { last_execution: null, recent_failed: 0, count_today: 0 };
                        const lastFiredStr = act.last_execution?.triggered_at
                            ? new Date(act.last_execution.triggered_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '-';
                        const creator = rule.created_by ? users[rule.created_by] : undefined;
                        const creatorIsAdmin = creator?.global_role === 'super_admin';

                        return (
                            <div className="table-row" key={rule.id}>
                                <div className="col-rule">
                                    <div className="rule-name-row">
                                        <span className={`dot ${rule.is_enabled ? 'active' : 'inactive'}`}></span>
                                        <span className="rule-name">{rule.name}</span>
                                        <span className="priority-tag">P{rule.priority}</span>
                                    </div>
                                    <div className="rule-description">
                                        {rule.description || t('detail.noDescription')}
                                    </div>
                                    {creator && (
                                        <div className="rule-creator" title={`${t('auto.createdByLabel')} ${creator.username}`}>
                                            <User size={11} />
                                            <span>{t('auto.createdByLabel')} {creator.username}</span>
                                            <span className={`role-badge ${creatorIsAdmin ? 'admin' : 'user'}`}>
                                                {creatorIsAdmin ? t('auto.roleAdmin') : t('auto.roleUser')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="col-fires24h">
                                    {renderSparklineSVG(frequency[rule.id] || [], rule.is_enabled)}
                                </div>
                                <div className="col-lastFired">{lastFiredStr}</div>
                                <div className="col-today">
                                    <span className={`today-badge ${act.count_today > 0 ? 'active' : 'zero'}`}>
                                        {act.count_today}
                                    </span>
                                </div>
                                <div className="col-enabled">
                                    <div
                                        className={`toggle ${rule.is_enabled ? 'on' : 'off'}`}
                                        onClick={() => handleToggle(rule)}
                                    >
                                        <div className="knob"></div>
                                    </div>
                                    <button
                                        className="history-btn"
                                        onClick={() => setHistoryRule(rule)}
                                    >
                                        <Clock size={12} />
                                        <span>{t('auto.history')}</span>
                                    </button>
                                    <button
                                        className="history-btn icon-only"
                                        title={t('auto.editTooltip')}
                                        onClick={() => openEdit(rule)}
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button
                                        className="history-btn icon-only danger"
                                        title={t('auto.deleteTooltip')}
                                        onClick={() => handleDeleteRule(rule)}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Execution History Popup Modal */}
            {historyRule && (
                <div className="modal-overlay" onClick={() => setHistoryRule(null)}>
                    <div className="history-modal panel" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title-row">
                                    <h3>{historyRule.name}</h3>
                                    <span className={`status-badge ${historyRule.is_enabled ? 'enabled' : 'disabled'}`}>
                                        {historyRule.is_enabled ? t('auto.historyActive') : t('auto.historyInactive')}
                                    </span>
                                    <span className="priority-badge">{t('auto.historyPriority', { priority: historyRule.priority })}</span>
                                </div>
                                <p className="modal-desc">{historyRule.description || t('auto.noDescription')}</p>
                            </div>
                            <button className="close-btn" onClick={() => setHistoryRule(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {historyLoading ? (
                                <div className="modal-loading">
                                    <Loader2 className="spinner" size={28} />
                                    <span>{t('auto.loadingHistory')}</span>
                                </div>
                            ) : (
                                <div className="modal-layout">
                                    {/* Left Panel: Analytics & Chart */}
                                    <div className="modal-left-panel">
                                        <div className="stats-grid">
                                            <div className="stat-card">
                                                <div className="stat-icon runs">
                                                    <Activity size={18} />
                                                </div>
                                                <div className="stat-info">
                                                    <span className="stat-label">{t('auto.totalRuns')}</span>
                                                    <span className="stat-value">
                                                        {get7dData(weeklyFrequency[historyRule.id] || []).reduce((a, b) => a + b, 0)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="stat-card">
                                                <div className="stat-icon rate">
                                                    <CheckCircle size={18} />
                                                </div>
                                                <div className="stat-info">
                                                    <span className="stat-label">{t('auto.successRate')}</span>
                                                    <span className="stat-value">
                                                        {historyLogs.length > 0 
                                                            ? `${Math.round((historyLogs.filter(l => l.status === 'success').length / historyLogs.length) * 100)}%`
                                                            : '100%'
                                                        }
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="stat-card">
                                                <div className="stat-icon source">
                                                    <Zap size={18} />
                                                </div>
                                                <div className="stat-info">
                                                    <span className="stat-label">{t('auto.lastSource')}</span>
                                                    <span className="stat-value source-text">
                                                        {historyLogs[0]?.trigger_source || 'N/A'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chart section */}
                                        {(() => {
                                            const chartData = get7dData(weeklyFrequency[historyRule.id] || []);
                                            const maxVal = Math.max(...chartData, 1);
                                            const height = 140;
                                            const width = 400;
                                            const padding = 15;
                                            
                                            const points = chartData.map((val, index) => {
                                                const x = padding + (index / (chartData.length - 1 || 1)) * (width - 2 * padding);
                                                const y = height - padding - (val / maxVal) * (height - 2 * padding);
                                                return { x, y, val };
                                            });

                                            const pathD = points.length > 0 
                                                ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                                                : '';
                                            const areaD = points.length > 0
                                                ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
                                                : '';

                                            return (
                                                <div className="history-chart-card">
                                                    <h4 className="chart-header">{t('auto.freqChartTitle')}</h4>
                                                    {chartData.length === 0 ? (
                                                        <div className="no-chart-data">{t('auto.noChartData')}</div>
                                                    ) : (
                                                        <div className="chart-wrapper">
                                                            <svg viewBox={`0 0 ${width} ${height}`} className="history-svg-chart">
                                                                <defs>
                                                                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
                                                                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                                                                    </linearGradient>
                                                                </defs>
                                                                <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--border-input)" strokeDasharray="3,3" />
                                                                <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--border-input)" strokeDasharray="3,3" />
                                                                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-input)" />

                                                                {areaD && <path d={areaD} fill="url(#chartGradient)" />}
                                                                {pathD && <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                                                                {points.map((p, idx) => (
                                                                    <g key={idx} className="chart-dot-group">
                                                                        <circle cx={p.x} cy={p.y} r="4" fill="var(--panel-bg)" stroke="var(--primary)" strokeWidth="2" />
                                                                        <title>{`Day -${7 - idx}d: ${p.val} runs`}</title>
                                                                    </g>
                                                                ))}
                                                            </svg>
                                                            <div className="chart-x-labels">
                                                                <span>{t('auto.7daysAgo')}</span>
                                                                <span>{t('auto.4daysAgo')}</span>
                                                                <span>{t('auto.todayLabel')}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Right Panel: Execution Timeline */}
                                    <div className="modal-right-panel">
                                        <h4 className="timeline-section-title">{t('auto.timelineTitle')}</h4>
                                        {historyLogs.length === 0 ? (
                                            <div className="drawer-empty">
                                                {t('auto.noHistoryLogs')}
                                            </div>
                                        ) : (
                                            <div className="history-timeline-scroll">
                                                <div className="history-timeline">
                                                    {historyLogs.map((log) => {
                                                        const dateStr = log.triggered_at ? new Date(log.triggered_at).toLocaleString() : '-';
                                                        const isSuccess = log.status === 'success';
                                                        
                                                        // Determine source icon
                                                        let SourceIcon = Zap;
                                                        if (log.trigger_source === 'schedule') SourceIcon = Clock;
                                                        else if (log.trigger_source === 'manual') SourceIcon = User;

                                                        return (
                                                            <div
                                                                className={`timeline-item ${isSuccess ? 'success' : 'failed'}`}
                                                                key={log.id}
                                                            >
                                                                <div className="timeline-badge">
                                                                    <SourceIcon size={12} className="source-icon-svg" />
                                                                </div>
                                                                <div className="timeline-content">
                                                                    <div className="timeline-header">
                                                                        <div className="timeline-time-info">
                                                                            <span className="timestamp">{dateStr}</span>
                                                                            <span className="source-tag">{log.trigger_source || 'sensor'}</span>
                                                                        </div>
                                                                        <span className={`status-tag ${isSuccess ? 'success' : 'failed'}`}>
                                                                            {log.status.toUpperCase()}
                                                                        </span>
                                                                    </div>

                                                                    {log.trigger_snapshot && Object.keys(log.trigger_snapshot).length > 0 && (
                                                                        <div className="trigger-snapshot">
                                                                            <span className="snapshot-title">{t('auto.snapshotTitle')}</span>
                                                                            <div className="snapshot-tags">
                                                                                {Object.entries(log.trigger_snapshot).map(([key, val]) => (
                                                                                    <span className="snapshot-tag" key={key}>
                                                                                        <span className="key">{key}:</span>
                                                                                        <span className="value">{String(val)}</span>
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {!isSuccess && log.error_message && (
                                                                        <div className="error-message">
                                                                            {log.error_message}
                                                                        </div>
                                                                    )}

                                                                    {log.actuator_writes && log.actuator_writes.length > 0 && (
                                                                        <div className="actuator-writes">
                                                                            <h6>{t('auto.actuatorActions')}</h6>
                                                                            <ul>
                                                                                {log.actuator_writes.map((write, widx) => (
                                                                                    <li key={widx}>
                                                                                        <span className="device-cmd">
                                                                                            <Cpu size={12} className="device-icon" />
                                                                                            <strong>{write.device_name}</strong> · {write.register_code} = <code>{String(write.value)}</code>
                                                                                        </span>
                                                                                        <span className={`write-status ${write.status.toLowerCase()}`}>
                                                                                            {write.status}
                                                                                        </span>
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editorOpen && (
                <AutomationEditorModal
                    farmId={farmId}
                    automationId={editId}
                    automations={rules}
                    onClose={() => setEditorOpen(false)}
                    onSaved={handleEditorSaved}
                />
            )}
        </div>
    );
}
