import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Send, Loader2, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { automationsApi } from '../../../api/services';
import { AutomationScene, AutomationActivityMap, ExecutionHistoryRow } from '../../../types';
import './AutomationsTab.css';

interface AutomationsTabProps {
    farmId: string;
}

export default function AutomationsTab({ farmId }: AutomationsTabProps) {
    const { t } = useTranslation();

    const [rules, setRules] = useState<AutomationScene[]>([]);
    const [originalRules, setOriginalRules] = useState<AutomationScene[]>([]);
    const [activity, setActivity] = useState<AutomationActivityMap>({});
    const [frequency, setFrequency] = useState<Record<string, number[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Dynamic actions status
    const [exporting, setExporting] = useState(false);
    const [publishing, setPublishing] = useState(false);

    // History drawer state
    const [historyRule, setHistoryRule] = useState<AutomationScene | null>(null);
    const [historyLogs, setHistoryLogs] = useState<ExecutionHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

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
                return {} as Record<string, number[]>;
            });

            const [rulesResult, activityResult, frequencyResult] = await Promise.all([
                rulesPromise,
                activityPromise,
                frequencyPromise
            ]);

            setRules(rulesResult);
            setOriginalRules(JSON.parse(JSON.stringify(rulesResult)));
            setActivity(activityResult);
            setFrequency(frequencyResult);
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
    const firesToday = Object.values(activity).reduce((acc, curr) => acc + (curr?.today_count || 0), 0);
    const failingRules = Object.keys(activity).filter(id => (activity[id]?.failed_count || 0) > 0).length;

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
                        <div className="col-enabled">{t('auto.colEnabled')}</div>
                    </div>
                    {rules.map((rule) => {
                        const act = activity[rule.id] || { last_fired: null, failed_count: 0, today_count: 0 };
                        const fires24h = frequency[rule.id] || [0, 0, 0, 0, 0, 0, 0, 0];
                        const maxVal = Math.max(...fires24h, 1);
                        const lastFiredStr = act.last_fired
                            ? new Date(act.last_fired).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '-';

                        return (
                            <div className="table-row" key={rule.id}>
                                <div className="col-rule">
                                    <div className="rule-name">
                                        <span className={`dot ${rule.is_enabled ? 'active' : 'inactive'}`}></span>
                                        {rule.name}
                                    </div>
                                    <div className="rule-target">
                                        <span className="priority">{rule.priority}</span> - {rule.description || t('detail.noDescription')}
                                    </div>
                                </div>
                                <div className="col-fires24h">
                                    <div className="mini-chart">
                                        {fires24h.map((val, i) => (
                                            <div
                                                key={i}
                                                className="bar"
                                                style={{ height: `${(val / maxVal) * 100}%`, opacity: rule.is_enabled ? 1 : 0.3 }}
                                                title={`${val} fires`}
                                            ></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="col-lastFired">{lastFiredStr}</div>
                                <div className="col-today">{act.today_count}</div>
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
                                        {t('auto.history')}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Execution History Side Drawer */}
            {historyRule && (
                <div className="drawer-overlay" onClick={() => setHistoryRule(null)}>
                    <div className="history-drawer panel" onClick={(e) => e.stopPropagation()}>
                        <div className="drawer-header">
                            <div>
                                <h3>{historyRule.name}</h3>
                                <p className="drawer-desc">Execution logs & audit timeline</p>
                            </div>
                            <button className="close-btn" onClick={() => setHistoryRule(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="drawer-body">
                            {historyLoading ? (
                                <div className="drawer-loading">
                                    <Loader2 className="spinner" size={24} />
                                    <span>Loading logs...</span>
                                </div>
                            ) : historyLogs.length === 0 ? (
                                <div className="drawer-empty">
                                    No recent executions recorded for this rule.
                                </div>
                            ) : (
                                <div className="history-timeline">
                                    {historyLogs.map((log) => {
                                        const dateStr = new Date(log.executed_at).toLocaleString();
                                        return (
                                            <div
                                                className={`timeline-item ${log.success ? 'success' : 'failed'}`}
                                                key={log.id}
                                            >
                                                <div className="timeline-badge"></div>
                                                <div className="timeline-content">
                                                    <div className="timeline-header">
                                                        <span className="timestamp">{dateStr}</span>
                                                        <span className={`status-tag ${log.success ? 'success' : 'failed'}`}>
                                                            {log.success ? 'SUCCESS' : 'FAILED'}
                                                        </span>
                                                    </div>

                                                    {!log.success && log.error_message && (
                                                        <div className="error-message">
                                                            {log.error_message}
                                                        </div>
                                                    )}

                                                    {log.actuator_writes && log.actuator_writes.length > 0 && (
                                                        <div className="actuator-writes">
                                                            <h6>Actuator Commands:</h6>
                                                            <ul>
                                                                {log.actuator_writes.map((write, widx) => (
                                                                    <li key={widx}>
                                                                        <strong>{write.device_name}</strong> · {write.register_code} = <code>{String(write.value)}</code>
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
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
