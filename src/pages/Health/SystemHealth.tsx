import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    RefreshCw,
    Database,
    Server,
    Radio,
    Cpu,
    MemoryStick,
    HardDrive,
    Clock,
    Plug,
    PlugZap,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Loader2,
    LineChart as LineChartIcon,
    X
} from 'lucide-react';
import { healthApi, farmsApi } from '../../api/services';
import {
    Farm,
    InfraHealthResponse,
    EdgeHealthFarm,
    EdgeHealthFleetResponse,
    EdgeHealthHistoryResponse
} from '../../types';
import './SystemHealth.css';

// Window options for the fleet overview + history (Influx-style durations).
const PERIOD_OPTIONS = ['1h', '6h', '24h', '7d', '30d'];

// Per-period default downsample resolution for the history chart.
const DEFAULT_AGGREGATE: Record<string, string> = {
    '1h': '',
    '6h': '',
    '24h': '5m',
    '7d': '1h',
    '30d': '6h'
};
const AGGREGATE_OPTIONS = ['', '5m', '15m', '1h', '6h'];

// Metrics rendered as 0–100% usage bars / chart lines.
const USAGE_FIELDS = [
    { key: 'cpu_usage_percent', labelKey: 'health.cpu', color: '#059669', icon: Cpu },
    { key: 'ram_usage_percent', labelKey: 'health.ram', color: '#0EA5E9', icon: MemoryStick },
    { key: 'disk_usage_percent', labelKey: 'health.disk', color: '#D97706', icon: HardDrive }
] as const;

// Friendly icon for an infra component (postgres / influxdb / mqtt → sensible default).
function componentIcon(name: string) {
    const n = name.toLowerCase();
    if (n.includes('postgres') || n.includes('sql') || n.includes('db')) return Database;
    if (n.includes('mqtt') || n.includes('broker')) return Radio;
    return Server;
}

// 0–100% → severity bucket used for bar / value coloring.
function usageLevel(pct: number): 'healthy' | 'warning' | 'critical' {
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'warning';
    return 'healthy';
}

function formatUptime(seconds: number): string {
    if (!seconds || seconds < 0) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatRelative(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '—';
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// Nearest index to `target` in an ascending-sorted array (binary search).
function nearestIdx(arr: number[], target: number): number {
    if (arr.length === 0) return -1;
    let lo = 0;
    let hi = arr.length - 1;
    if (target <= arr[0]) return 0;
    if (target >= arr[hi]) return hi;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] === target) return mid;
        if (arr[mid] < target) lo = mid + 1; else hi = mid - 1;
    }
    return Math.abs(arr[lo] - target) < Math.abs(arr[hi] - target) ? lo : hi;
}

// X-axis tick label — granularity adapts to the visible time span.
function formatAxisTime(ms: number, spanMs: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    if (spanMs <= 36 * 3600 * 1000) return `${p(d.getHours())}:${p(d.getMinutes())}`;
    if (spanMs <= 5 * 86400 * 1000) return `${p(d.getDate())} ${p(d.getHours())}h`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Tooltip header — compact absolute timestamp.
function formatTooltipTime(ms: number): string {
    return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Tiny multi-line SVG chart (0–100% fixed axis), time-scaled on X ─────────
interface Series {
    key: string;
    label: string;
    color: string;
    points: { t: number; v: number }[];
}

function UsageLineChart({ series }: { series: Series[] }) {
    const width = 700;
    const height = 240;
    const padTop = 14;
    const padBottom = 28;
    const padLeft = 40;
    const padRight = 16;

    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    // Unified time axis + per-series time→value lookups (built once per data change).
    const { tMin, tSpan, timeline, maps } = useMemo(() => {
        const tset = new Set<number>();
        series.forEach(s => s.points.forEach(p => tset.add(p.t)));
        const tl = Array.from(tset).sort((a, b) => a - b);
        const ms = series.map(s => {
            const m = new Map<number, number>();
            s.points.forEach(p => m.set(p.t, p.v));
            return m;
        });
        const lo = tl.length ? tl[0] : 0;
        const hi = tl.length ? tl[tl.length - 1] : 1;
        return { tMin: lo, tSpan: (hi - lo) || 1, timeline: tl, maps: ms };
    }, [series]);

    if (timeline.length === 0) return null;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const xOf = (t: number) => padLeft + ((t - tMin) / tSpan) * plotW;
    const yOf = (v: number) => padTop + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;

    const yGrid = [0, 25, 50, 75, 100];
    const tickCount = 5;
    const xTicks = Array.from({ length: tickCount }, (_, i) => tMin + (i / (tickCount - 1)) * tSpan);

    const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        const vx = ((e.clientX - rect.left) / rect.width) * width;
        const f = Math.max(0, Math.min(1, (vx - padLeft) / plotW));
        const idx = nearestIdx(timeline, tMin + f * tSpan);
        if (idx !== hoverIdx) setHoverIdx(idx); // only re-render when the snapped point changes
    };

    const hoverT = hoverIdx != null && hoverIdx < timeline.length ? timeline[hoverIdx] : null;
    const hoverXPct = hoverT != null ? (xOf(hoverT) / width) * 100 : 0;
    const tipTransform = hoverXPct < 28 ? 'translateX(0)' : hoverXPct > 72 ? 'translateX(-100%)' : 'translateX(-50%)';

    return (
        <div className="health-chart-wrap" onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} className="health-svg-chart" preserveAspectRatio="none">
                {/* y gridlines + labels */}
                {yGrid.map(g => (
                    <g key={`y${g}`}>
                        <line
                            x1={padLeft} y1={yOf(g)} x2={width - padRight} y2={yOf(g)}
                            stroke="var(--border-input)" strokeDasharray={g === 0 ? undefined : '3,3'} strokeWidth={g === 0 ? 1 : 0.75}
                        />
                        <text x={padLeft - 6} y={yOf(g) + 3} textAnchor="end" className="health-chart-axis-label">{g}</text>
                    </g>
                ))}
                {/* x ticks + time labels */}
                {xTicks.map((t, i) => (
                    <g key={`x${i}`}>
                        <line
                            x1={xOf(t)} y1={padTop} x2={xOf(t)} y2={height - padBottom}
                            stroke="var(--border-input)" strokeDasharray="3,3" strokeWidth={0.5} opacity={0.6}
                        />
                        <text x={xOf(t)} y={height - padBottom + 16} textAnchor="middle" className="health-chart-axis-label">
                            {formatAxisTime(t, tSpan)}
                        </text>
                    </g>
                ))}
                {/* one path per series */}
                {series.map(s => {
                    if (s.points.length === 0) return null;
                    const d = s.points
                        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`)
                        .join(' ');
                    return (
                        <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    );
                })}
                {/* hover guide line + per-series dots */}
                {hoverT != null && (
                    <g>
                        <line
                            x1={xOf(hoverT)} y1={padTop} x2={xOf(hoverT)} y2={height - padBottom}
                            stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4,3" opacity={0.55}
                        />
                        {series.map((s, i) => {
                            const v = maps[i].get(hoverT);
                            if (v == null) return null;
                            return <circle key={s.key} cx={xOf(hoverT)} cy={yOf(v)} r={3.5} fill="var(--panel-bg)" stroke={s.color} strokeWidth={2} />;
                        })}
                    </g>
                )}
            </svg>

            {/* HTML tooltip overlay — crisp text, positioned over the snapped point */}
            {hoverT != null && (
                <div className="health-chart-tooltip" style={{ left: `${hoverXPct}%`, transform: tipTransform }}>
                    <div className="hct-time">{formatTooltipTime(hoverT)}</div>
                    {series.map((s, i) => {
                        const v = maps[i].get(hoverT);
                        if (v == null) return null;
                        return (
                            <div className="hct-row" key={s.key}>
                                <span className="hct-dot" style={{ background: s.color }}></span>
                                <span className="hct-label">{s.label}</span>
                                <span className="hct-val">{Math.round(v)}%</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function SystemHealth() {
    const { t } = useTranslation();

    // Infra liveness (GET /health)
    const [infra, setInfra] = useState<InfraHealthResponse | null>(null);
    const [infraError, setInfraError] = useState(false);

    // Fleet edge-health (GET /admin/edge-health)
    const [fleet, setFleet] = useState<EdgeHealthFleetResponse | null>(null);
    const [fleetForbidden, setFleetForbidden] = useState(false);
    const [period, setPeriod] = useState('24h');

    // Farm catalog → map farm_id to name/code for nicer labels
    const [farms, setFarms] = useState<Farm[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // History modal
    const [historyFarm, setHistoryFarm] = useState<{ id: string; name: string; code: string } | null>(null);
    const [history, setHistory] = useState<EdgeHealthHistoryResponse | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPeriod, setHistoryPeriod] = useState('24h');
    const [historyAggregate, setHistoryAggregate] = useState('5m');

    const farmMap = useMemo(() => {
        const m: Record<string, Farm> = {};
        farms.forEach(f => { m[f.id] = f; });
        return m;
    }, [farms]);

    const loadAll = useCallback(async (selectedPeriod: string, isInitial = false) => {
        if (isInitial) setLoading(true); else setRefreshing(true);

        const [infraRes, fleetRes, farmsRes] = await Promise.allSettled([
            healthApi.getInfra(),
            healthApi.getFleetEdgeHealth(selectedPeriod),
            farmsApi.getAll()
        ]);

        if (infraRes.status === 'fulfilled') {
            setInfra(infraRes.value);
            setInfraError(false);
        } else {
            setInfra(null);
            setInfraError(true);
        }

        if (fleetRes.status === 'fulfilled') {
            setFleet(fleetRes.value);
            setFleetForbidden(false);
        } else {
            const msg = String(fleetRes.reason?.message || '');
            setFleetForbidden(msg.includes('403'));
            setFleet(null);
        }

        if (farmsRes.status === 'fulfilled') setFarms(farmsRes.value);

        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
    }, []);

    // Initial load + reload whenever the fleet period changes.
    useEffect(() => {
        loadAll(period, infra === null && fleet === null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period]);

    // Auto-refresh every 30s (skips while a history modal is open to avoid churn).
    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => {
            if (!historyFarm) loadAll(period);
        }, 30000);
        return () => clearInterval(id);
    }, [autoRefresh, period, historyFarm, loadAll]);

    // Load history for the selected farm whenever it / its period / resolution changes.
    useEffect(() => {
        if (!historyFarm) return;
        let cancelled = false;
        setHistoryLoading(true);
        setHistory(null);
        healthApi
            .getFarmEdgeHistory(historyFarm.id, historyPeriod, historyAggregate || undefined)
            .then(res => { if (!cancelled) setHistory(res); })
            .catch(() => { if (!cancelled) setHistory(null); })
            .finally(() => { if (!cancelled) setHistoryLoading(false); });
        return () => { cancelled = true; };
    }, [historyFarm, historyPeriod, historyAggregate]);

    const openHistory = (f: EdgeHealthFarm) => {
        const meta = farmMap[f.farm_id];
        setHistoryFarm({
            id: f.farm_id,
            name: meta?.name || f.farm_id,
            code: meta?.code || f.farm_id.slice(0, 8)
        });
        setHistoryPeriod('24h');
        setHistoryAggregate(DEFAULT_AGGREGATE['24h']);
    };

    // ── Fleet summary stats ─────────────────────────────────────────────────
    const fleetFarms = useMemo(() => fleet?.farms ?? [], [fleet]);
    const summary = useMemo(() => {
        const n = fleetFarms.length;
        if (n === 0) return { n: 0, online: 0, offline: 0, modbusDown: 0, cpu: 0, ram: 0, disk: 0 };
        const online = fleetFarms.filter(f => f.status === 'online').length;
        const modbusDown = fleetFarms.filter(f => !f.metrics.modbus_connected).length;
        const avg = (sel: (f: EdgeHealthFarm) => number) =>
            Math.round(fleetFarms.reduce((s, f) => s + (sel(f) || 0), 0) / n);
        return {
            n,
            online,
            offline: n - online,
            modbusDown,
            cpu: avg(f => f.metrics.cpu_usage_percent),
            ram: avg(f => f.metrics.ram_usage_percent),
            disk: avg(f => f.metrics.disk_usage_percent)
        };
    }, [fleetFarms]);

    // ── Pivot history records → per-field series ────────────────────────────
    const historySeries = useMemo<Series[]>(() => {
        if (!history) return [];
        const byField: Record<string, { t: number; v: number }[]> = {};
        history.records.forEach(r => {
            (byField[r.field] ||= []).push({ t: new Date(r.time).getTime(), v: Number(r.value) });
        });
        return USAGE_FIELDS
            .filter(f => byField[f.key]?.length)
            .map(f => ({
                key: f.key,
                label: t(f.labelKey),
                color: f.color,
                points: byField[f.key].sort((a, b) => a.t - b.t)
            }));
    }, [history, t]);

    const overallStatus = infra?.status;
    const statusBanner =
        infraError ? 'critical'
            : overallStatus === 'ok' ? 'healthy'
                : overallStatus === 'degraded' ? 'warning'
                    : 'unknown';

    return (
        <div className="health-container">
            {/* Header */}
            <div className="health-header">
                <div>
                    <span className="health-breadcrumbs">{t('health.breadcrumbs')}</span>
                    <h2>{t('health.title')}</h2>
                    <p className="health-subtitle">{t('health.subtitle')}</p>
                </div>
                <div className="health-header-actions">
                    {lastUpdated && (
                        <span className="health-updated">
                            {t('health.lastUpdated', { time: lastUpdated.toLocaleTimeString() })}
                        </span>
                    )}
                    <label className="health-autorefresh">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={e => setAutoRefresh(e.target.checked)}
                        />
                        <span>{t('health.autoRefresh')}</span>
                    </label>
                    <button className="health-refresh-btn" onClick={() => loadAll(period)} disabled={refreshing}>
                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> {t('health.refresh')}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="health-loading">
                    <Loader2 size={26} className="spin" />
                    <span>{t('health.loading')}</span>
                </div>
            ) : (
                <>
                    {/* ── Infrastructure liveness ────────────────────────────── */}
                    <div className="panel health-infra-panel">
                        <div className="health-section-head">
                            <div>
                                <h3><Server size={16} /> {t('health.infraTitle')}</h3>
                                <p>{t('health.infraDesc')}</p>
                            </div>
                            <span className={`health-status-banner ${statusBanner}`}>
                                {statusBanner === 'healthy' && <CheckCircle2 size={15} />}
                                {statusBanner === 'warning' && <AlertTriangle size={15} />}
                                {(statusBanner === 'critical' || statusBanner === 'unknown') && <XCircle size={15} />}
                                {infraError
                                    ? t('health.infraError')
                                    : overallStatus === 'ok' ? t('health.statusOk')
                                        : overallStatus === 'degraded' ? t('health.statusDegraded')
                                            : t('health.statusUnknown')}
                            </span>
                        </div>

                        {!infraError && infra && (
                            <div className="health-component-grid">
                                {Object.entries(infra.components).map(([name, comp]) => {
                                    const Icon = componentIcon(name);
                                    return (
                                        <div key={name} className={`health-component-card ${comp.ok ? 'ok' : 'fail'}`}>
                                            <div className="comp-icon"><Icon size={18} /></div>
                                            <div className="comp-body">
                                                <span className="comp-name">{name}</span>
                                                <span className="comp-detail" title={comp.detail || ''}>
                                                    {comp.detail || t('health.noDetail')}
                                                </span>
                                            </div>
                                            <span className={`comp-pill ${comp.ok ? 'ok' : 'fail'}`}>
                                                {comp.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                                {comp.ok ? t('health.componentOk') : t('health.componentFail')}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Edge gateway fleet ─────────────────────────────────── */}
                    <div className="health-fleet-block">
                        <div className="health-section-head bare">
                            <div>
                                <h3><Activity size={16} /> {t('health.fleetTitle')}</h3>
                                <p>{t('health.fleetDesc', { period })}</p>
                            </div>
                            <div className="health-period-pills">
                                {PERIOD_OPTIONS.map(p => (
                                    <button
                                        key={p}
                                        className={`health-pill ${period === p ? 'active' : ''}`}
                                        onClick={() => setPeriod(p)}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {fleetForbidden ? (
                            <div className="panel health-notice">
                                <AlertTriangle size={18} /> {t('health.forbidden')}
                            </div>
                        ) : (
                            <>
                                {/* Summary metric cards */}
                                <div className="health-metrics-grid">
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.farmsReporting')}</div>
                                        <div className="hm-value">{summary.n}<span className="hm-suffix"> / {farms.length}</span></div>
                                    </div>
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.farmsOnline')}</div>
                                        <div className="hm-value success">{summary.online}</div>
                                    </div>
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.farmsOffline')}</div>
                                        <div className={`hm-value ${summary.offline > 0 ? 'danger' : ''}`}>{summary.offline}</div>
                                    </div>
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.modbusDownStat')}</div>
                                        <div className={`hm-value ${summary.modbusDown > 0 ? 'warning' : ''}`}>{summary.modbusDown}</div>
                                    </div>
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.avgCpu')}</div>
                                        <div className={`hm-value ${usageLevel(summary.cpu)}`}>{summary.cpu}%</div>
                                    </div>
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.avgRam')}</div>
                                        <div className={`hm-value ${usageLevel(summary.ram)}`}>{summary.ram}%</div>
                                    </div>
                                    <div className="panel health-metric-card">
                                        <div className="hm-title">{t('health.avgDisk')}</div>
                                        <div className={`hm-value ${usageLevel(summary.disk)}`}>{summary.disk}%</div>
                                    </div>
                                </div>

                                {/* Per-farm cards */}
                                {fleetFarms.length === 0 ? (
                                    <div className="panel health-empty">{t('health.fleetEmpty')}</div>
                                ) : (
                                    <div className="health-farm-grid">
                                        {fleetFarms.map(f => {
                                            const meta = farmMap[f.farm_id];
                                            const online = f.status === 'online';
                                            return (
                                                <div key={f.farm_id} className="panel health-farm-card">
                                                    <div className="hfc-head">
                                                        <div className="hfc-id">
                                                            <span className="hfc-name">{meta?.name || f.farm_id}</span>
                                                            {meta?.code && <span className="hfc-code">{meta.code}</span>}
                                                        </div>
                                                        <span className={`health-status-badge ${online ? 'healthy' : 'critical'}`}>
                                                            <span className="dot"></span>
                                                            {online ? t('health.statusOnline') : t('health.statusOffline')}
                                                        </span>
                                                    </div>

                                                    <div className="hfc-meta">
                                                        <span title={new Date(f.time).toLocaleString()}>
                                                            <Clock size={12} /> {t('health.lastSeen', { time: formatRelative(f.time) })}
                                                        </span>
                                                        <span>
                                                            <Activity size={12} /> {t('health.uptime')}: {formatUptime(f.metrics.uptime_seconds)}
                                                        </span>
                                                        <span className={f.metrics.modbus_connected ? 'modbus-on' : 'modbus-off'}>
                                                            {f.metrics.modbus_connected ? <Plug size={12} /> : <PlugZap size={12} />}
                                                            {f.metrics.modbus_connected ? t('health.modbusConnected') : t('health.modbusDisconnected')}
                                                        </span>
                                                    </div>

                                                    <div className="hfc-bars">
                                                        {USAGE_FIELDS.map(field => {
                                                            const val = f.metrics[field.key];
                                                            const lvl = usageLevel(val);
                                                            const Icon = field.icon;
                                                            return (
                                                                <div className="hfc-bar-row" key={field.key}>
                                                                    <span className="hfc-bar-label"><Icon size={12} /> {t(field.labelKey)}</span>
                                                                    <div className="hfc-bar-track">
                                                                        <div className={`hfc-bar-fill ${lvl}`} style={{ width: `${Math.min(100, val)}%` }}></div>
                                                                    </div>
                                                                    <span className={`hfc-bar-val ${lvl}`}>{Math.round(val)}%</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="hfc-foot">
                                                        <span className="hfc-disk-free">
                                                            <HardDrive size={12} /> {t('health.diskFree', { value: f.metrics.disk_free_gb?.toFixed(1) ?? '—' })}
                                                        </span>
                                                        <button className="hfc-history-btn" onClick={() => openHistory(f)}>
                                                            <LineChartIcon size={13} /> {t('health.viewHistory')}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}

            {/* ── History modal ──────────────────────────────────────────────── */}
            {historyFarm && (
                <div className="modal-overlay" onClick={() => setHistoryFarm(null)}>
                    <div className="health-history-modal panel" onClick={e => e.stopPropagation()}>
                        <div className="hhm-header">
                            <div>
                                <h3>{t('health.historyTitle')}</h3>
                                <p className="hhm-sub">
                                    {historyFarm.name} <code>{historyFarm.code}</code>
                                </p>
                            </div>
                            <button className="close-btn" onClick={() => setHistoryFarm(null)}><X size={20} /></button>
                        </div>

                        <div className="hhm-controls">
                            <div className="health-period-pills">
                                {PERIOD_OPTIONS.map(p => (
                                    <button
                                        key={p}
                                        className={`health-pill ${historyPeriod === p ? 'active' : ''}`}
                                        onClick={() => {
                                            setHistoryPeriod(p);
                                            setHistoryAggregate(DEFAULT_AGGREGATE[p] ?? '');
                                        }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <div className="hhm-aggregate">
                                <label>{t('health.historyAggregate')}</label>
                                <select value={historyAggregate} onChange={e => setHistoryAggregate(e.target.value)}>
                                    {AGGREGATE_OPTIONS.map(a => (
                                        <option key={a || 'raw'} value={a}>{a || t('health.aggregateRaw')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="hhm-body">
                            {historyLoading ? (
                                <div className="health-loading"><Loader2 size={24} className="spin" /><span>{t('health.historyLoading')}</span></div>
                            ) : historySeries.length === 0 ? (
                                <div className="health-empty">{t('health.historyEmpty')}</div>
                            ) : (
                                <>
                                    <div className="hhm-chart-head">
                                        <h4>{t('health.chartUsage')}</h4>
                                        <div className="hhm-legend">
                                            {historySeries.map(s => (
                                                <span key={s.key} className="hhm-legend-item">
                                                    <span className="hhm-legend-dot" style={{ background: s.color }}></span>
                                                    {s.label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <UsageLineChart series={historySeries} />

                                    {/* Latest snapshot read out from the most recent record per series */}
                                    <div className="hhm-snapshot">
                                        <span className="hhm-snapshot-title">{t('health.currentSnapshot')}</span>
                                        <div className="hhm-snapshot-vals">
                                            {historySeries.map(s => {
                                                const last = s.points[s.points.length - 1];
                                                const lvl = usageLevel(last.v);
                                                return (
                                                    <div key={s.key} className="hhm-snapshot-val">
                                                        <span className="label" style={{ color: s.color }}>{s.label}</span>
                                                        <span className={`value ${lvl}`}>{Math.round(last.v)}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
