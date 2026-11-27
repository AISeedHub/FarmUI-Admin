import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    RefreshCw,
    DollarSign,
    Activity,
    Cpu,
    Clock,
    AlertTriangle,
    Settings2,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Download,
    Eye,
    X,
    CheckCircle2,
    XCircle,
    Lock,
    Calendar,
    Filter,
    Plus,
    Trash2
} from 'lucide-react';
import { aiReportsUsageApi, farmsApi, ApiError } from '../../api/services';
import {
    Farm,
    UsageItem,
    UsageTimeBucket,
    UsageDimension,
    UsageGroupBy,
    UsageCallItem,
    AiReportDetail
} from '../../types';
import {
    ModelPrice,
    ModelPriceMap,
    COMMON_IANA_TIMEZONES,
    DEFAULT_USAGE_TIMEZONE,
    stripModelDateSuffix,
    resolveModelPrice,
    calculateCostBreakdown,
    loadModelPrices,
    saveModelPrices,
    formatUsd,
    formatCompactNumber,
    formatSeconds,
    formatDateInTz,
    addDaysToDateStr
} from '../../utils/llmPricing';
import HelpTip from '../../components/HelpTip';
import './AiUsage.css';

type PageTab = 'overview' | 'explorer' | 'calls';
type DatePreset = '7d' | '14d' | '30d' | 'month' | 'all' | 'custom';
type ChartMetric = 'cost' | 'tokens' | 'requests';

const ALL_DIMENSIONS: UsageDimension[] = [
    'farm',
    'user',
    'report_type',
    'language',
    'is_scheduled',
    'status'
];

const PROVIDER_COLORS: Record<string, string> = {
    openai: '#059669',
    anthropic: '#d97706',
    google: '#0ea5e9',
    gemini: '#0ea5e9'
};

function providerColor(provider: string, fallbackIndex = 0): string {
    const key = (provider || '').toLowerCase();
    if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
    const palette = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#64748b'];
    return palette[fallbackIndex % palette.length];
}

function describeError(err: unknown): string {
    if (err instanceof ApiError) {
        return ApiError.detailText(err.detail) || err.message;
    }
    return (err as Error)?.message || 'Unknown error';
}

function isForbiddenError(err: unknown): boolean {
    return err instanceof ApiError && err.status === 403;
}

function presetDates(preset: Exclude<DatePreset, 'custom'>, tz: string): { since: string; until: string } {
    if (preset === 'all') return { since: '', until: '' };
    const today = formatDateInTz(new Date(), tz);
    const tomorrow = addDaysToDateStr(today, 1);
    if (preset === '7d') return { since: addDaysToDateStr(today, -6), until: tomorrow };
    if (preset === '14d') return { since: addDaysToDateStr(today, -13), until: tomorrow };
    if (preset === '30d') return { since: addDaysToDateStr(today, -29), until: tomorrow };
    // 'month'
    return { since: `${today.slice(0, 7)}-01`, until: tomorrow };
}

interface AggregatedRow {
    key: string;
    label: string;
    subLabel?: string;
    provider?: string;
    model?: string;
    requests: number;
    promptTokens: number;
    cachedTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    totalTokens: number;
    avgSeconds: number | null;
    knownCost: number;
    inputCost: number;
    cacheCost: number;
    outputCost: number;
    hasPriced: boolean;
    hasUnpriced: boolean;
    unpricedModels: string[];
}

function aggregateItems(
    items: UsageItem[],
    prices: ModelPriceMap,
    keyFn: (item: UsageItem) => string,
    labelFn: (item: UsageItem) => { label: string; subLabel?: string; provider?: string; model?: string }
): AggregatedRow[] {
    const map = new Map<string, AggregatedRow & { latSum: number; latCount: number; unpricedSet: Set<string> }>();

    for (const item of items) {
        const key = keyFn(item);
        let row = map.get(key);
        if (!row) {
            const meta = labelFn(item);
            row = {
                key,
                label: meta.label,
                subLabel: meta.subLabel,
                provider: meta.provider,
                model: meta.model,
                requests: 0,
                promptTokens: 0,
                cachedTokens: 0,
                outputTokens: 0,
                thinkingTokens: 0,
                totalTokens: 0,
                avgSeconds: null,
                knownCost: 0,
                inputCost: 0,
                cacheCost: 0,
                outputCost: 0,
                hasPriced: false,
                hasUnpriced: false,
                unpricedModels: [],
                latSum: 0,
                latCount: 0,
                unpricedSet: new Set<string>()
            };
            map.set(key, row);
        }

        const req = Number(item.requests) || 0;
        const prompt = Number(item.prompt_tokens) || 0;
        const cached = Number(item.cached_tokens) || 0;
        const output = Number(item.output_tokens) || 0;
        const thinking = Number(item.thinking_tokens) || 0;

        row.requests += req;
        row.promptTokens += prompt;
        row.cachedTokens += cached;
        row.outputTokens += output;
        row.thinkingTokens += thinking;
        // output_tokens already includes thinking_tokens
        row.totalTokens += prompt + output;

        if (item.avg_llm_seconds != null && Number.isFinite(item.avg_llm_seconds) && req > 0) {
            row.latSum += item.avg_llm_seconds * req;
            row.latCount += req;
        }

        const resolved = resolveModelPrice(item.model, prices);
        const breakdown = calculateCostBreakdown(
            { prompt_tokens: prompt, cached_tokens: cached, output_tokens: output },
            resolved?.price ?? null
        );
        if (breakdown) {
            row.hasPriced = true;
            row.knownCost += breakdown.totalCost;
            row.inputCost += breakdown.inputCost;
            row.cacheCost += breakdown.cacheCost;
            row.outputCost += breakdown.outputCost;
        } else if (item.model) {
            row.hasUnpriced = true;
            row.unpricedSet.add(item.model);
        }
    }

    return Array.from(map.values()).map(({ latSum, latCount, unpricedSet, ...rest }) => ({
        ...rest,
        avgSeconds: latCount > 0 ? latSum / latCount : null,
        unpricedModels: Array.from(unpricedSet)
    }));
}

function renderCostText(row: Pick<AggregatedRow, 'knownCost' | 'hasPriced' | 'hasUnpriced'>): string {
    if (!row.hasPriced && row.hasUnpriced) return '—';
    const base = formatUsd(row.knownCost);
    return row.hasUnpriced && row.hasPriced ? `${base}+` : base;
}

function statusBadgeClass(status: string | null | undefined): string {
    const s = (status || '').toLowerCase();
    if (s === 'success' || s === 'completed') return 'success';
    if (s === 'failed' || s === 'error') return 'failed';
    if (s === 'invalid' || s === 'warning') return 'invalid';
    return 'neutral';
}

function formatCallTimestamp(iso: string, tz: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    try {
        return d.toLocaleString(undefined, {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch {
        return d.toLocaleString();
    }
}

function formatNullableCount(val: number | null | undefined): string {
    return val == null || !Number.isFinite(val) ? '—' : val.toLocaleString();
}

function formatAxisBucket(bucket: string): string {
    // YYYY-MM-DD -> MM/DD; keep YYYY-MM or other formats as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
        return `${bucket.slice(5, 7)}/${bucket.slice(8, 10)}`;
    }
    return bucket.length > 10 ? bucket.slice(0, 10) : bucket;
}

// ── Interactive Stacked Bar Chart (HTML axes + SVG plot) ────────────────────
interface ChartSegment {
    key: string;
    label: string;
    value: number;
    color: string;
}

interface ChartBucket {
    bucket: string;
    total: number;
    requests: number;
    totalTokens: number;
    knownCost: number;
    hasUnpriced: boolean;
    segments: ChartSegment[];
}

function UsageBarChart({
    buckets,
    metric,
    emptyText
}: {
    buckets: ChartBucket[];
    metric: ChartMetric;
    emptyText: string;
}) {
    const { t } = useTranslation();
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    if (buckets.length === 0) {
        return <div className="aiu-empty">{emptyText}</div>;
    }

    const viewW = 1000;
    const viewH = 200;
    const maxVal = Math.max(...buckets.map(b => b.total), metric === 'cost' ? 0.001 : 1);
    const yTicks = [1, 0.75, 0.5, 0.25, 0].map(f => f * maxVal);

    const stepW = viewW / buckets.length;
    const barW = Math.max(6, Math.min(36, stepW * 0.58));
    const maxLabels = 8;
    const labelStride = Math.max(1, Math.ceil(buckets.length / maxLabels));

    const formatY = (v: number) => {
        if (metric === 'cost') {
            if (v === 0) return '$0';
            return v >= 1 ? `$${v.toFixed(1)}` : `$${v.toFixed(3)}`;
        }
        return formatCompactNumber(Math.round(v));
    };

    const hovered = hoverIdx != null && hoverIdx < buckets.length ? buckets[hoverIdx] : null;
    const hoverXPct = hoverIdx != null ? ((hoverIdx + 0.5) / buckets.length) * 100 : 0;
    const tipTransform = hoverXPct < 22 ? 'translateX(0)' : hoverXPct > 78 ? 'translateX(-100%)' : 'translateX(-50%)';

    return (
        <div className="aiu-chart-wrap" onMouseLeave={() => setHoverIdx(null)}>
            <div className="aiu-chart-body">
                <div className="aiu-chart-yaxis">
                    {yTicks.map((tv, idx) => (
                        <span key={idx}>{formatY(tv)}</span>
                    ))}
                </div>

                <div className="aiu-chart-plot-col">
                    <div className="aiu-chart-svg-box">
                        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="aiu-svg-chart" preserveAspectRatio="none">
                            {yTicks.map((tv, idx) => {
                                const y = viewH - (tv / maxVal) * viewH;
                                return (
                                    <line
                                        key={idx}
                                        x1={0}
                                        y1={y}
                                        x2={viewW}
                                        y2={y}
                                        stroke={idx === yTicks.length - 1 ? 'var(--border-input)' : 'rgba(15, 23, 42, 0.08)'}
                                        strokeDasharray={idx === yTicks.length - 1 ? undefined : '3 3'}
                                        strokeWidth={1}
                                        vectorEffect="non-scaling-stroke"
                                    />
                                );
                            })}

                            {buckets.map((b, i) => {
                                const cx = (i + 0.5) * stepW;
                                const x = cx - barW / 2;
                                let yCursor = viewH;
                                const isHovered = hoverIdx === i;

                                return (
                                    <g
                                        key={b.bucket}
                                        onMouseEnter={() => setHoverIdx(i)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <rect
                                            x={i * stepW}
                                            y={0}
                                            width={stepW}
                                            height={viewH}
                                            fill={isHovered ? 'rgba(5, 150, 105, 0.06)' : 'transparent'}
                                        />
                                        {b.segments.map((seg, sIdx) => {
                                            const segH = seg.value > 0 ? Math.max(2, (seg.value / maxVal) * viewH) : 0;
                                            yCursor -= segH;
                                            return (
                                                <rect
                                                    key={`${seg.key}-${sIdx}`}
                                                    x={x}
                                                    y={yCursor}
                                                    width={barW}
                                                    height={segH}
                                                    fill={seg.color}
                                                    opacity={hoverIdx == null || isHovered ? 0.92 : 0.45}
                                                />
                                            );
                                        })}
                                    </g>
                                );
                            })}
                        </svg>

                        {hovered && (
                            <div className="aiu-chart-tooltip" style={{ left: `${hoverXPct}%`, transform: tipTransform }}>
                                <div className="aiu-tt-head">{hovered.bucket}</div>
                                {hovered.segments
                                    .filter(s => s.value > 0)
                                    .slice()
                                    .reverse()
                                    .map(seg => (
                                        <div className="aiu-tt-row" key={seg.key}>
                                            <span className="aiu-tt-dot" style={{ background: seg.color }} />
                                            <span className="aiu-tt-label">{seg.label}</span>
                                            <span className="aiu-tt-val">
                                                {metric === 'cost' ? formatUsd(seg.value) : seg.value.toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                <div className="aiu-tt-foot">
                                    <span>{t('aiUsage.chartRequestsCount', { count: hovered.requests })}</span>
                                    <span>
                                        {metric === 'cost'
                                            ? `${formatUsd(hovered.knownCost)}${hovered.hasUnpriced ? '+' : ''}`
                                            : formatCompactNumber(hovered.totalTokens)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="aiu-chart-xaxis">
                        {buckets.map((b, i) => {
                            const show = i % labelStride === 0 || i === buckets.length - 1;
                            return (
                                <span
                                    key={b.bucket}
                                    className="aiu-xaxis-tick"
                                    style={{ visibility: show ? 'visible' : 'hidden' }}
                                >
                                    {formatAxisBucket(b.bucket)}
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main Page Component ─────────────────────────────────────────────────────
export default function AiUsage() {
    const { t } = useTranslation();

    // Active tab
    const [activeTab, setActiveTab] = useState<PageTab>('overview');

    // Global filters
    const [tz, setTz] = useState<string>(DEFAULT_USAGE_TIMEZONE);
    const [customTz, setCustomTz] = useState<string>('');
    const [tzMode, setTzMode] = useState<'preset' | 'custom'>('preset');
    const [datePreset, setDatePreset] = useState<DatePreset>('30d');
    const initialRange = useMemo(() => presetDates('30d', DEFAULT_USAGE_TIMEZONE), []);
    const [since, setSince] = useState<string>(initialRange.since);
    const [until, setUntil] = useState<string>(initialRange.until);
    const [farmId, setFarmId] = useState<string>('');
    // Client-side pricing (persisted in localStorage)
    const [prices, setPrices] = useState<ModelPriceMap>(() => loadModelPrices());
    const [timeBucket, setTimeBucket] = useState<UsageTimeBucket>('day');
    const [chartMetric, setChartMetric] = useState<ChartMetric>(() =>
        Object.keys(loadModelPrices()).length > 0 ? 'cost' : 'tokens'
    );
    // Master farms
    const [farms, setFarms] = useState<Farm[]>([]);
    const [pricingOpen, setPricingOpen] = useState(false);
    const [draftPrices, setDraftPrices] = useState<ModelPriceMap>({});
    const [newModelName, setNewModelName] = useState('');
    const [newModelInput, setNewModelInput] = useState('');
    const [newModelCache, setNewModelCache] = useState('');
    const [newModelOutput, setNewModelOutput] = useState('');

    // Overview API responses
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [overviewError, setOverviewError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [timeItems, setTimeItems] = useState<UsageItem[]>([]);
    const [farmItems, setFarmItems] = useState<UsageItem[]>([]);
    const [statusItems, setStatusItems] = useState<UsageItem[]>([]);
    const [languageItems, setLanguageItems] = useState<UsageItem[]>([]);
    const [scheduledItems, setScheduledItems] = useState<UsageItem[]>([]);

    // Custom Explorer state
    const [explorerBucket, setExplorerBucket] = useState<'none' | UsageTimeBucket>('day');
    const [explorerDims, setExplorerDims] = useState<UsageDimension[]>(['farm', 'report_type']);
    const [explorerItems, setExplorerItems] = useState<UsageItem[]>([]);
    const [loadingExplorer, setLoadingExplorer] = useState(false);
    const [explorerError, setExplorerError] = useState<string | null>(null);

    // Call Logs state
    const [calls, setCalls] = useState<UsageCallItem[]>([]);
    const [callsTotal, setCallsTotal] = useState<number>(0);
    const [callsStatusFilter, setCallsStatusFilter] = useState<string>('');
    const [callsLimit, setCallsLimit] = useState<number>(50);
    const [callsOffset, setCallsOffset] = useState<number>(0);
    const [loadingCalls, setLoadingCalls] = useState(false);
    const [callsError, setCallsError] = useState<string | null>(null);

    // Call / Report detail modal
    const [selectedCall, setSelectedCall] = useState<UsageCallItem | null>(null);
    const [reportDetail, setReportDetail] = useState<AiReportDetail | null>(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);
    const [showRawJson, setShowRawJson] = useState(false);

    const effectiveTz = tzMode === 'custom' ? (customTz.trim() || DEFAULT_USAGE_TIMEZONE) : tz;

    // Fetch farms for dropdown
    useEffect(() => {
        farmsApi.getAll().then(setFarms).catch(() => setFarms([]));
    }, []);

    const handlePresetChange = (nextPreset: DatePreset) => {
        setDatePreset(nextPreset);
        if (nextPreset !== 'custom') {
            const bounds = presetDates(nextPreset, effectiveTz);
            setSince(bounds.since);
            setUntil(bounds.until);
        }
        setCallsOffset(0);
    };

    const loadOverview = useCallback(async () => {
        setLoadingOverview(true);
        setOverviewError(null);
        const common = {
            since: since || undefined,
            until: until || undefined,
            farm_id: farmId || undefined,
            tz: effectiveTz
        };

        try {
            const [tRes, fRes, stRes, lRes, scRes] = await Promise.all([
                aiReportsUsageApi.getUsage({ ...common, group_by: [timeBucket] }),
                aiReportsUsageApi.getUsage({ ...common, group_by: ['farm'] }),
                aiReportsUsageApi.getUsage({ ...common, group_by: ['status'] }),
                aiReportsUsageApi.getUsage({ ...common, group_by: ['language'] }),
                aiReportsUsageApi.getUsage({ ...common, group_by: ['is_scheduled'] })
            ]);
            setForbidden(false);
            setTimeItems(tRes.items ?? []);
            setFarmItems(fRes.items ?? []);
            setStatusItems(stRes.items ?? []);
            setLanguageItems(lRes.items ?? []);
            setScheduledItems(scRes.items ?? []);
        } catch (err) {
            if (isForbiddenError(err)) {
                setForbidden(true);
            } else {
                setOverviewError(describeError(err));
            }
        } finally {
            setLoadingOverview(false);
        }
    }, [since, until, farmId, effectiveTz, timeBucket]);

    const loadExplorer = useCallback(async () => {
        setLoadingExplorer(true);
        setExplorerError(null);
        const groupBy: UsageGroupBy[] = [
            ...(explorerBucket !== 'none' ? [explorerBucket] : []),
            ...explorerDims
        ];
        try {
            const res = await aiReportsUsageApi.getUsage({
                group_by: groupBy,
                since: since || undefined,
                until: until || undefined,
                farm_id: farmId || undefined,
                tz: effectiveTz
            });
            setForbidden(false);
            setExplorerItems(res.items ?? []);
        } catch (err) {
            if (isForbiddenError(err)) {
                setForbidden(true);
            } else {
                setExplorerError(describeError(err));
            }
        } finally {
            setLoadingExplorer(false);
        }
    }, [explorerBucket, explorerDims, since, until, farmId, effectiveTz]);

    const loadCalls = useCallback(async () => {
        setLoadingCalls(true);
        setCallsError(null);
        try {
            const res = await aiReportsUsageApi.getCalls({
                since: since || undefined,
                until: until || undefined,
                farm_id: farmId || undefined,
                tz: effectiveTz,
                status: callsStatusFilter || undefined,
                limit: callsLimit,
                offset: callsOffset
            });
            setForbidden(false);
            const items = res.items ?? [];
            setCalls(items);
            setCallsTotal(res.total ?? items.length);
        } catch (err) {
            if (isForbiddenError(err)) {
                setForbidden(true);
            } else {
                setCallsError(describeError(err));
            }
        } finally {
            setLoadingCalls(false);
        }
    }, [since, until, farmId, effectiveTz, callsStatusFilter, callsLimit, callsOffset]);

    // Trigger loads based on active tab & filters
    useEffect(() => {
        if (activeTab === 'overview') loadOverview();
    }, [activeTab, loadOverview]);

    useEffect(() => {
        if (activeTab === 'explorer') loadExplorer();
    }, [activeTab, loadExplorer]);

    useEffect(() => {
        if (activeTab === 'calls') loadCalls();
    }, [activeTab, loadCalls]);

    const refreshCurrent = () => {
        if (activeTab === 'overview') loadOverview();
        else if (activeTab === 'explorer') loadExplorer();
        else loadCalls();
    };

    // ── Derived aggregations for Overview ──────────────────────────────────
    const summaryTotals = useMemo(() => {
        const rows = aggregateItems(
            statusItems,
            prices,
            () => 'total',
            () => ({ label: 'Total' })
        );
        return rows[0] ?? {
            key: 'total',
            label: 'Total',
            requests: 0,
            promptTokens: 0,
            cachedTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
            totalTokens: 0,
            avgSeconds: null,
            knownCost: 0,
            inputCost: 0,
            cacheCost: 0,
            outputCost: 0,
            hasPriced: false,
            hasUnpriced: false,
            unpricedModels: []
        };
    }, [statusItems, prices]);

    const statusRows = useMemo(() => {
        return aggregateItems(
            statusItems,
            prices,
            i => i.status || 'unknown',
            i => ({ label: i.status || 'unknown' })
        ).sort((a, b) => b.requests - a.requests);
    }, [statusItems, prices]);

    const errorStats = useMemo(() => {
        const errRows = statusRows.filter(r => {
            const s = r.key.toLowerCase();
            return s === 'failed' || s === 'invalid' || s === 'error';
        });
        const okRows = statusRows.filter(r => r.key.toLowerCase() === 'success');
        const failedRequests = errRows.reduce((s, r) => s + r.requests, 0);
        const successRequests = okRows.reduce((s, r) => s + r.requests, 0);
        const total = summaryTotals.requests || 0;
        const successRate = total > 0 ? (successRequests / total) * 100 : null;
        return { failedRequests, successRequests, successRate };
    }, [statusRows, summaryTotals.requests]);

    const modelRows = useMemo(() => {
        return aggregateItems(
            statusItems,
            prices,
            i => `${i.provider}::${i.model}`,
            i => ({ label: i.model, subLabel: i.provider, provider: i.provider, model: i.model })
        ).sort((a, b) => b.knownCost - a.knownCost || b.totalTokens - a.totalTokens);
    }, [statusItems, prices]);

    const farmRows = useMemo(() => {
        return aggregateItems(
            farmItems,
            prices,
            i => i.farm_id || 'unknown',
            i => ({ label: i.farm_name || i.farm_id || 'Unknown', subLabel: i.farm_id || undefined })
        ).sort((a, b) => b.knownCost - a.knownCost || b.totalTokens - a.totalTokens);
    }, [farmItems, prices]);

    const languageRows = useMemo(() => {
        return aggregateItems(
            languageItems,
            prices,
            i => i.language || 'unknown',
            i => ({ label: (i.language || 'unknown').toUpperCase() })
        ).sort((a, b) => b.requests - a.requests);
    }, [languageItems, prices]);

    const scheduledRows = useMemo(() => {
        return aggregateItems(
            scheduledItems,
            prices,
            i => (i.is_scheduled == null ? 'unknown' : i.is_scheduled ? 'scheduled' : 'manual'),
            i => ({
                label: i.is_scheduled == null ? 'Unknown' : i.is_scheduled ? t('aiUsage.scheduled') : t('aiUsage.manual')
            })
        ).sort((a, b) => b.requests - a.requests);
    }, [scheduledItems, prices, t]);

    // Time-series chart buckets
    const chartBuckets = useMemo<ChartBucket[]>(() => {
        const grouped = new Map<string, UsageItem[]>();
        timeItems.forEach(item => {
            const b = item.bucket || '—';
            const list = grouped.get(b) || [];
            list.push(item);
            grouped.set(b, list);
        });

        const sortedKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
        return sortedKeys.map(bucket => {
            const list = grouped.get(bucket)!;
            let requests = 0;
            let prompt = 0;
            let cached = 0;
            let output = 0;
            let thinking = 0;
            let inputCost = 0;
            let cacheCost = 0;
            let outputCost = 0;
            let hasUnpriced = false;
            const byProvider = new Map<string, number>();

            list.forEach(item => {
                const req = Number(item.requests) || 0;
                const p = Number(item.prompt_tokens) || 0;
                const c = Number(item.cached_tokens) || 0;
                const o = Number(item.output_tokens) || 0;
                const th = Number(item.thinking_tokens) || 0;
                requests += req;
                prompt += p;
                cached += c;
                output += o;
                thinking += th;

                const prov = item.provider || 'unknown';
                byProvider.set(prov, (byProvider.get(prov) || 0) + req);

                const resolved = resolveModelPrice(item.model, prices);
                const bd = calculateCostBreakdown(
                    { prompt_tokens: p, cached_tokens: c, output_tokens: o },
                    resolved?.price ?? null
                );
                if (bd) {
                    inputCost += bd.inputCost;
                    cacheCost += bd.cacheCost;
                    outputCost += bd.outputCost;
                } else if (item.model) {
                    hasUnpriced = true;
                }
            });

            const nonCachedInput = Math.max(0, prompt - cached);
            const nonThinkingOutput = Math.max(0, output - thinking);
            const knownCost = inputCost + cacheCost + outputCost;

            let segments: ChartSegment[];
            if (chartMetric === 'cost') {
                segments = [
                    { key: 'input', label: t('aiUsage.costInput'), value: inputCost, color: '#0ea5e9' },
                    { key: 'cache', label: t('aiUsage.costCache'), value: cacheCost, color: '#10b981' },
                    { key: 'output', label: t('aiUsage.costOutput'), value: outputCost, color: '#0d5c3a' }
                ];
            } else if (chartMetric === 'tokens') {
                segments = [
                    { key: 'input', label: t('aiUsage.tokensInput'), value: nonCachedInput, color: '#0ea5e9' },
                    { key: 'cache', label: t('aiUsage.tokensCached'), value: cached, color: '#10b981' },
                    { key: 'output', label: t('aiUsage.tokensOutput'), value: nonThinkingOutput, color: '#0d5c3a' },
                    { key: 'thinking', label: t('aiUsage.tokensThinking'), value: thinking, color: '#d97706' }
                ];
            } else {
                segments = Array.from(byProvider.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([prov, val], idx) => ({
                        key: prov,
                        label: prov,
                        value: val,
                        color: providerColor(prov, idx)
                    }));
            }

            const total = segments.reduce((s, seg) => s + seg.value, 0);
            return {
                bucket,
                total,
                requests,
                totalTokens: prompt + output,
                knownCost,
                hasUnpriced,
                segments
            };
        });
    }, [timeItems, prices, chartMetric, t]);

    // Collect every distinct model seen across loaded data (for pricing modal)
    const discoveredModels = useMemo(() => {
        const seen = new Map<string, { raw: string; base: string; provider: string }>();
        const add = (provider: string, model: string) => {
            if (!model) return;
            if (!seen.has(model)) {
                seen.set(model, {
                    raw: model,
                    base: stripModelDateSuffix(model),
                    provider: provider || ''
                });
            }
        };
        statusItems.forEach(i => add(i.provider, i.model));
        explorerItems.forEach(i => add(i.provider, i.model));
        calls.forEach(c => add(c.provider, c.model));
        return Array.from(seen.values());
    }, [statusItems, explorerItems, calls]);

    const unpricedModelCount = useMemo(() => {
        const unpricedBases = new Set<string>();
        discoveredModels.forEach(m => {
            if (!resolveModelPrice(m.raw, prices)) {
                unpricedBases.add(m.base);
            }
        });
        return unpricedBases.size;
    }, [discoveredModels, prices]);

    // ── Pricing modal helpers ──────────────────────────────────────────────
    const openPricingModal = (focusModel?: string) => {
        const next: ModelPriceMap = { ...prices };
        if (focusModel && !resolveModelPrice(focusModel, next)) {
            const base = stripModelDateSuffix(focusModel);
            next[base] = { input: 0, cache: 0, output: 0 };
        }
        setDraftPrices(next);
        setNewModelName('');
        setNewModelInput('');
        setNewModelCache('');
        setNewModelOutput('');
        setPricingOpen(true);
    };

    const ensureDraftModel = (modelKey: string) => {
        setDraftPrices(prev => {
            if (Object.prototype.hasOwnProperty.call(prev, modelKey)) return prev;
            return { ...prev, [modelKey]: { input: 0, cache: 0, output: 0 } };
        });
    };

    const updateDraftField = (modelKey: string, field: keyof ModelPrice, rawVal: string) => {
        const num = rawVal === '' ? 0 : Math.max(0, Number(rawVal));
        setDraftPrices(prev => ({
            ...prev,
            [modelKey]: {
                ...(prev[modelKey] ?? { input: 0, cache: 0, output: 0 }),
                [field]: Number.isFinite(num) ? num : 0
            }
        }));
    };

    const deleteDraftModel = (modelKey: string) => {
        setDraftPrices(prev => {
            const copy = { ...prev };
            delete copy[modelKey];
            return copy;
        });
    };

    const addNewDraftModel = (e: React.FormEvent) => {
        e.preventDefault();
        const key = newModelName.trim();
        if (!key) return;
        setDraftPrices(prev => ({
            ...prev,
            [key]: {
                input: Math.max(0, Number(newModelInput) || 0),
                cache: Math.max(0, Number(newModelCache) || 0),
                output: Math.max(0, Number(newModelOutput) || 0)
            }
        }));
        setNewModelName('');
        setNewModelInput('');
        setNewModelCache('');
        setNewModelOutput('');
    };

    const handleSavePricing = () => {
        saveModelPrices(draftPrices);
        setPrices(draftPrices);
        setPricingOpen(false);
    };

    // ── Report detail modal ────────────────────────────────────────────────
    const openCallInspector = async (call: UsageCallItem) => {
        setSelectedCall(call);
        setReportDetail(null);
        setReportError(null);
        setShowRawJson(false);
        setLoadingReport(true);
        try {
            const detail = await aiReportsUsageApi.getReportById(call.id);
            setReportDetail(detail);
        } catch (err) {
            setReportError(describeError(err));
        } finally {
            setLoadingReport(false);
        }
    };

    // ── Explorer CSV export ────────────────────────────────────────────────
    const exportExplorerCsv = () => {
        const headers = [
            'bucket', 'farm_name', 'user_email', 'report_type', 'language',
            'is_scheduled', 'status', 'provider', 'model',
            'requests', 'prompt_tokens', 'cached_tokens', 'output_tokens', 'thinking_tokens',
            'avg_llm_seconds', 'est_cost_usd'
        ];
        const escapeCsv = (v: unknown) => {
            const s = v == null ? '' : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const rows = explorerItems.map(item => {
            const resolved = resolveModelPrice(item.model, prices);
            const bd = calculateCostBreakdown(item, resolved?.price ?? null);
            return [
                item.bucket, item.farm_name, item.user_email, item.report_type, item.language,
                item.is_scheduled, item.status, item.provider, item.model,
                item.requests, item.prompt_tokens, item.cached_tokens, item.output_tokens, item.thinking_tokens,
                item.avg_llm_seconds, bd ? bd.totalCost.toFixed(6) : ''
            ].map(escapeCsv).join(',');
        });
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-usage-${since || 'all'}-${until || 'now'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleExplorerDim = (dim: UsageDimension) => {
        setExplorerDims(prev =>
            prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
        );
    };

    const jumpToFailedCalls = (statusValue: string) => {
        setCallsStatusFilter(statusValue);
        setCallsOffset(0);
        setActiveTab('calls');
    };

    const maxFarmCost = Math.max(...farmRows.map(r => r.knownCost), 0.0001);
    const maxFarmTokens = Math.max(...farmRows.map(r => r.totalTokens), 1);

    return (
        <div className="aiu-container">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="aiu-header">
                <div>
                    <span className="aiu-breadcrumbs">{t('aiUsage.breadcrumbs')}</span>
                    <div className="aiu-title-row">
                        <h2>{t('aiUsage.title')}</h2>
                        <HelpTip label={t('common.whatIsThis')} width={380}>
                            <div className="aiu-helptip">
                                <p><strong>{t('aiUsage.tipScopeTitle')}</strong></p>
                                <p>{t('aiUsage.tipScopeBody')}</p>
                                <p><strong>{t('aiUsage.tipBillingTitle')}</strong></p>
                                <p>{t('aiUsage.tipBillingBody')}</p>
                                <p><strong>{t('aiUsage.tipLegacyTitle')}</strong></p>
                                <p>{t('aiUsage.tipLegacyBody')}</p>
                            </div>
                        </HelpTip>
                    </div>
                    <p className="aiu-subtitle">{t('aiUsage.subtitle')}</p>
                </div>

                <div className="aiu-header-actions">
                    <button
                        type="button"
                        className={`aiu-pricing-btn ${unpricedModelCount > 0 ? 'has-unpriced' : ''}`}
                        onClick={() => openPricingModal()}
                    >
                        <Settings2 size={15} />
                        <span>{t('aiUsage.modelPricing')}</span>
                        {unpricedModelCount > 0 ? (
                            <span className="aiu-pill-warn">{t('aiUsage.unpricedCount', { count: unpricedModelCount })}</span>
                        ) : (
                            <span className="aiu-pill-ok">{Object.keys(prices).length}</span>
                        )}
                    </button>

                    <button
                        type="button"
                        className="aiu-refresh-btn"
                        onClick={refreshCurrent}
                        disabled={loadingOverview || loadingExplorer || loadingCalls}
                    >
                        <RefreshCw size={14} className={(loadingOverview || loadingExplorer || loadingCalls) ? 'spin' : ''} />
                        <span>{t('aiUsage.refresh')}</span>
                    </button>
                </div>
            </div>

            {/* ── Filter Bar & Tabs ──────────────────────────────────────── */}
            <div className="panel aiu-toolbar">
                <div className="aiu-toolbar-row">
                    {/* Date Presets */}
                    <div className="aiu-presets" role="group" aria-label={t('aiUsage.dateRange')}>
                        {(['7d', '14d', '30d', 'month', 'all'] as const).map(p => (
                            <button
                                key={p}
                                type="button"
                                className={`aiu-preset-btn ${datePreset === p ? 'active' : ''}`}
                                onClick={() => handlePresetChange(p)}
                            >
                                {t(`aiUsage.preset_${p}`)}
                            </button>
                        ))}
                    </div>

                    {/* Since / Until Inputs */}
                    <div className="aiu-date-inputs">
                        <label className="aiu-inline-field">
                            <Calendar size={13} />
                            <span>{t('aiUsage.since')}</span>
                            <input
                                type="date"
                                value={since}
                                onChange={e => {
                                    setDatePreset('custom');
                                    setSince(e.target.value);
                                    setCallsOffset(0);
                                }}
                            />
                        </label>
                        <label className="aiu-inline-field">
                            <span>{t('aiUsage.until')}</span>
                            <input
                                type="date"
                                value={until}
                                onChange={e => {
                                    setDatePreset('custom');
                                    setUntil(e.target.value);
                                    setCallsOffset(0);
                                }}
                            />
                        </label>
                    </div>

                    {/* Farm & Timezone */}
                    <div className="aiu-select-filters">
                        <label className="aiu-inline-field">
                            <Filter size={13} />
                            <select
                                value={farmId}
                                onChange={e => {
                                    setFarmId(e.target.value);
                                    setCallsOffset(0);
                                }}
                                aria-label={t('aiUsage.farmFilter')}
                            >
                                <option value="">{t('aiUsage.allFarms')}</option>
                                {farms.map(f => (
                                    <option key={f.id} value={f.id}>
                                        {f.name} ({f.code})
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="aiu-inline-field">
                            <Clock size={13} />
                            <select
                                value={tzMode === 'custom' ? '__custom__' : tz}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (v === '__custom__') {
                                        setTzMode('custom');
                                    } else {
                                        setTzMode('preset');
                                        setTz(v);
                                    }
                                    setCallsOffset(0);
                                }}
                                aria-label={t('aiUsage.timezone')}
                            >
                                {COMMON_IANA_TIMEZONES.map(zone => (
                                    <option key={zone} value={zone}>{zone}</option>
                                ))}
                                <option value="__custom__">{t('aiUsage.customTz')}</option>
                            </select>
                        </label>

                        {tzMode === 'custom' && (
                            <input
                                type="text"
                                className="aiu-tz-input"
                                value={customTz}
                                onChange={e => setCustomTz(e.target.value)}
                                placeholder="Area/City (e.g. Asia/Seoul)"
                            />
                        )}
                    </div>
                </div>

                {/* Page Tabs */}
                <div className="aiu-tabs-row">
                    <div className="tab-buttons">
                        <button
                            type="button"
                            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            {t('aiUsage.tabOverview')}
                        </button>
                        <button
                            type="button"
                            className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
                            onClick={() => setActiveTab('explorer')}
                        >
                            {t('aiUsage.tabExplorer')}
                        </button>
                        <button
                            type="button"
                            className={`tab-btn ${activeTab === 'calls' ? 'active' : ''}`}
                            onClick={() => setActiveTab('calls')}
                        >
                            {t('aiUsage.tabCalls')}
                        </button>
                    </div>
                    <span className="aiu-tz-note">
                        {t('aiUsage.rangeNote', { tz: effectiveTz })}
                    </span>
                </div>
            </div>

            {forbidden ? (
                <div className="panel aiu-notice">
                    <Lock size={18} />
                    <span>{t('aiUsage.forbidden')}</span>
                </div>
            ) : (
                <>
                    {/* ── TAB 1: OVERVIEW ────────────────────────────────── */}
                    {activeTab === 'overview' && (
                        <>
                            {overviewError && (
                                <div className="panel aiu-error-banner">
                                    <AlertTriangle size={18} />
                                    <span>{overviewError}</span>
                                </div>
                            )}

                            {loadingOverview && statusItems.length === 0 ? (
                                <div className="panel aiu-loading">
                                    <Loader2 size={24} className="spin" />
                                    <span>{t('common.loading')}</span>
                                </div>
                            ) : (
                                <>
                                    {/* KPI Cards */}
                                    <div className="aiu-kpi-grid">
                                        <div className="panel aiu-kpi-card">
                                            <div className="aiu-kpi-head">
                                                <DollarSign size={14} />
                                                <span>{t('aiUsage.kpiCost')}</span>
                                            </div>
                                            <div className="aiu-kpi-val">
                                                {renderCostText(summaryTotals)}
                                            </div>
                                            <div className="aiu-kpi-sub">
                                                {summaryTotals.hasUnpriced ? (
                                                    <button
                                                        type="button"
                                                        className="aiu-inline-link warn"
                                                        onClick={() => openPricingModal()}
                                                    >
                                                        {t('aiUsage.configureMissingPrices', { count: summaryTotals.unpricedModels.length })}
                                                    </button>
                                                ) : summaryTotals.hasPriced ? (
                                                    <span>
                                                        {t('aiUsage.costSplitSub', {
                                                            inCost: formatUsd(summaryTotals.inputCost + summaryTotals.cacheCost),
                                                            outCost: formatUsd(summaryTotals.outputCost)
                                                        })}
                                                    </span>
                                                ) : (
                                                    <span>{t('aiUsage.noUsageData')}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="panel aiu-kpi-card">
                                            <div className="aiu-kpi-head">
                                                <Activity size={14} />
                                                <span>{t('aiUsage.kpiCalls')}</span>
                                            </div>
                                            <div className="aiu-kpi-val">
                                                {summaryTotals.requests.toLocaleString()}
                                            </div>
                                            <div className="aiu-kpi-sub">
                                                {errorStats.successRate != null ? (
                                                    <>
                                                        <span className="aiu-sub-ok">
                                                            {errorStats.successRate.toFixed(1)}% {t('aiUsage.statusSuccess')}
                                                        </span>
                                                        {errorStats.failedRequests > 0 && (
                                                            <button
                                                                type="button"
                                                                className="aiu-inline-link danger"
                                                                onClick={() => jumpToFailedCalls('failed')}
                                                            >
                                                                · {errorStats.failedRequests} {t('aiUsage.failedInvalid')}
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span>{t('aiUsage.noUsageData')}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="panel aiu-kpi-card">
                                            <div className="aiu-kpi-head">
                                                <Cpu size={14} />
                                                <span>{t('aiUsage.kpiTokens')}</span>
                                            </div>
                                            <div className="aiu-kpi-val">
                                                {formatCompactNumber(summaryTotals.totalTokens)}
                                            </div>
                                            <div className="aiu-kpi-sub">
                                                <span>
                                                    {t('aiUsage.tokensSub', {
                                                        cachePct: summaryTotals.promptTokens > 0
                                                            ? ((summaryTotals.cachedTokens / summaryTotals.promptTokens) * 100).toFixed(0)
                                                            : '0',
                                                        thinking: formatCompactNumber(summaryTotals.thinkingTokens)
                                                    })}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="panel aiu-kpi-card">
                                            <div className="aiu-kpi-head">
                                                <Clock size={14} />
                                                <span>{t('aiUsage.kpiLatency')}</span>
                                            </div>
                                            <div className="aiu-kpi-val">
                                                {formatSeconds(summaryTotals.avgSeconds)}
                                            </div>
                                            <div className="aiu-kpi-sub">
                                                <span>{t('aiUsage.latencyNote')}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Time-Series Chart */}
                                    <div className="panel aiu-chart-panel">
                                        <div className="aiu-panel-head">
                                            <div>
                                                <h3><Sparkles size={16} /> {t('aiUsage.trendTitle')}</h3>
                                                <p>{t('aiUsage.trendDesc')}</p>
                                            </div>
                                            <div className="aiu-chart-controls">
                                                <div className="aiu-pill-group">
                                                    {(['day', 'week', 'month'] as UsageTimeBucket[]).map(b => (
                                                        <button
                                                            key={b}
                                                            type="button"
                                                            className={`aiu-pill-btn ${timeBucket === b ? 'active' : ''}`}
                                                            onClick={() => setTimeBucket(b)}
                                                        >
                                                            {t(`aiUsage.bucket_${b}`)}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="aiu-pill-group">
                                                    {(['cost', 'tokens', 'requests'] as ChartMetric[]).map(m => (
                                                        <button
                                                            key={m}
                                                            type="button"
                                                            className={`aiu-pill-btn ${chartMetric === m ? 'active' : ''}`}
                                                            onClick={() => setChartMetric(m)}
                                                        >
                                                            {t(`aiUsage.metric_${m}`)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {chartBuckets.length > 0 && !(chartMetric === 'cost' && !summaryTotals.hasPriced) && (
                                            <div className="aiu-chart-legend">
                                                {chartBuckets[0].segments.map(seg => (
                                                    <span className="aiu-legend-item" key={seg.key}>
                                                        <span className="aiu-legend-dot" style={{ background: seg.color }} />
                                                        {seg.label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {chartMetric === 'cost' && !summaryTotals.hasPriced && summaryTotals.requests > 0 ? (
                                            <div className="aiu-chart-unpriced-notice">
                                                <div>
                                                    <strong>{t('aiUsage.chartNoPricesTitle')}</strong>
                                                    <p>{t('aiUsage.chartNoPricesDesc')}</p>
                                                </div>
                                                <div className="aiu-chart-unpriced-actions">
                                                    <button
                                                        type="button"
                                                        className="primary"
                                                        onClick={() => openPricingModal()}
                                                    >
                                                        {t('aiUsage.modelPricing')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setChartMetric('tokens')}
                                                    >
                                                        {t('aiUsage.switchToTokens')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <UsageBarChart
                                                buckets={chartBuckets}
                                                metric={chartMetric}
                                                emptyText={t('aiUsage.noUsageData')}
                                            />
                                        )}
                                    </div>

                                    {/* Farm Ranking + Model Breakdown */}
                                    <div className="aiu-split-grid">
                                        {/* Farm Ranking */}
                                        <div className="panel aiu-card">
                                            <div className="aiu-panel-head">
                                                <div>
                                                    <h3>{t('aiUsage.farmRankingTitle')}</h3>
                                                    <p>{t('aiUsage.farmRankingDesc')}</p>
                                                </div>
                                                {farmId && (
                                                    <button
                                                        type="button"
                                                        className="aiu-clear-filter-btn"
                                                        onClick={() => setFarmId('')}
                                                    >
                                                        {t('aiUsage.clearFarmFilter')}
                                                    </button>
                                                )}
                                            </div>

                                            {farmRows.length === 0 ? (
                                                <div className="aiu-empty">{t('aiUsage.noUsageData')}</div>
                                            ) : (
                                                <div className="aiu-rank-list">
                                                    {farmRows.map(row => {
                                                        const pct = row.hasPriced
                                                            ? (row.knownCost / maxFarmCost) * 100
                                                            : (row.totalTokens / maxFarmTokens) * 100;
                                                        const isSelected = farmId && farmId === row.subLabel;
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={row.key}
                                                                className={`aiu-rank-row ${isSelected ? 'selected' : ''}`}
                                                                onClick={() => {
                                                                    if (!row.subLabel) return;
                                                                    setFarmId(prev => prev === row.subLabel ? '' : row.subLabel!);
                                                                }}
                                                                title={t('aiUsage.clickToFilterFarm')}
                                                            >
                                                                <div className="aiu-rank-top">
                                                                    <span className="aiu-rank-name">{row.label}</span>
                                                                    <span className="aiu-rank-metrics">
                                                                        <span className="aiu-mono">{row.requests.toLocaleString()} {t('aiUsage.callsShort')}</span>
                                                                        <span className="aiu-mono muted">{formatCompactNumber(row.totalTokens)} tok</span>
                                                                        <span className="aiu-mono strong">{renderCostText(row)}</span>
                                                                    </span>
                                                                </div>
                                                                <div className="aiu-bar-track">
                                                                    <div
                                                                        className="aiu-bar-fill"
                                                                        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                                                                    />
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Model & Provider Breakdown */}
                                        <div className="panel aiu-card">
                                            <div className="aiu-panel-head">
                                                <div>
                                                    <h3>{t('aiUsage.modelBreakdownTitle')}</h3>
                                                    <p>{t('aiUsage.modelBreakdownDesc')}</p>
                                                </div>
                                            </div>

                                            {modelRows.length === 0 ? (
                                                <div className="aiu-empty">{t('aiUsage.noUsageData')}</div>
                                            ) : (
                                                <div className="aiu-table-scroll">
                                                    <table className="aiu-table">
                                                        <thead>
                                                            <tr>
                                                                <th>{t('aiUsage.colModel')}</th>
                                                                <th className="num">{t('aiUsage.colCalls')}</th>
                                                                <th className="num">{t('aiUsage.colTokens')}</th>
                                                                <th className="num">{t('aiUsage.colCache')}</th>
                                                                <th className="num">{t('aiUsage.colLatency')}</th>
                                                                <th className="num">{t('aiUsage.colCost')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {modelRows.map(row => {
                                                                const cachePct = row.promptTokens > 0
                                                                    ? `${((row.cachedTokens / row.promptTokens) * 100).toFixed(0)}%`
                                                                    : '0%';
                                                                return (
                                                                    <tr key={row.key}>
                                                                        <td>
                                                                            <div className="aiu-model-cell">
                                                                                <span
                                                                                    className="aiu-provider-tag"
                                                                                    style={{ borderColor: providerColor(row.provider || '') }}
                                                                                >
                                                                                    {row.provider}
                                                                                </span>
                                                                                <span className="aiu-mono">{row.model}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="num aiu-mono">{row.requests.toLocaleString()}</td>
                                                                        <td className="num aiu-mono" title={`Prompt ${row.promptTokens.toLocaleString()} / Output ${row.outputTokens.toLocaleString()} (Thinking ${row.thinkingTokens.toLocaleString()})`}>
                                                                            {formatCompactNumber(row.totalTokens)}
                                                                        </td>
                                                                        <td className="num aiu-mono">{cachePct}</td>
                                                                        <td className="num aiu-mono">{formatSeconds(row.avgSeconds)}</td>
                                                                        <td className="num aiu-mono">
                                                                            {row.hasPriced ? (
                                                                                <span className="strong">{renderCostText(row)}</span>
                                                                            ) : (
                                                                                <button
                                                                                    type="button"
                                                                                    className="aiu-set-price-chip"
                                                                                    onClick={() => openPricingModal(row.model)}
                                                                                >
                                                                                    {t('aiUsage.setPrice')}
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Operational Splits: Status | Language | Scheduled */}
                                    <div className="aiu-trio-grid">
                                        {/* Status & Wasted Cost */}
                                        <div className="panel aiu-card">
                                            <div className="aiu-panel-head">
                                                <div>
                                                    <h3>{t('aiUsage.statusTitle')}</h3>
                                                    <p>{t('aiUsage.statusDesc')}</p>
                                                </div>
                                            </div>
                                            {statusRows.length === 0 ? (
                                                <div className="aiu-empty">{t('aiUsage.noUsageData')}</div>
                                            ) : (
                                                <div className="aiu-mini-list">
                                                    {statusRows.map(r => (
                                                        <div key={r.key} className="aiu-mini-row">
                                                            <div className="aiu-mini-left">
                                                                <span className={`aiu-status-pill ${statusBadgeClass(r.key)}`}>
                                                                    {r.label}
                                                                </span>
                                                                {r.key.toLowerCase() !== 'success' && (
                                                                    <button
                                                                        type="button"
                                                                        className="aiu-inspect-link"
                                                                        onClick={() => jumpToFailedCalls(r.key)}
                                                                    >
                                                                        {t('aiUsage.inspectLogs')}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="aiu-mini-right aiu-mono">
                                                                <span>{r.requests.toLocaleString()}</span>
                                                                <span className="muted">{formatCompactNumber(r.totalTokens)} tok</span>
                                                                <span className="strong">{renderCostText(r)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Language: Write (KO) vs Translate (EN) */}
                                        <div className="panel aiu-card">
                                            <div className="aiu-panel-head">
                                                <div>
                                                    <h3>{t('aiUsage.languageTitle')}</h3>
                                                    <p>{t('aiUsage.languageDesc')}</p>
                                                </div>
                                            </div>
                                            {languageRows.length === 0 ? (
                                                <div className="aiu-empty">{t('aiUsage.noUsageData')}</div>
                                            ) : (
                                                <div className="aiu-mini-list">
                                                    {languageRows.map(r => (
                                                        <div key={r.key} className="aiu-mini-row">
                                                            <div className="aiu-mini-left">
                                                                <span className="aiu-lang-pill">{r.label}</span>
                                                                <span className="aiu-lang-role">
                                                                    {r.key === 'ko'
                                                                        ? t('aiUsage.langWrite')
                                                                        : r.key === 'en'
                                                                            ? t('aiUsage.langTranslate')
                                                                            : ''}
                                                                </span>
                                                            </div>
                                                            <div className="aiu-mini-right aiu-mono">
                                                                <span>{r.requests.toLocaleString()}</span>
                                                                <span className="muted">{formatSeconds(r.avgSeconds)}</span>
                                                                <span className="strong">{renderCostText(r)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Scheduled vs Manual */}
                                        <div className="panel aiu-card">
                                            <div className="aiu-panel-head">
                                                <div>
                                                    <h3>{t('aiUsage.triggerTitle')}</h3>
                                                    <p>{t('aiUsage.triggerDesc')}</p>
                                                </div>
                                            </div>
                                            {scheduledRows.length === 0 ? (
                                                <div className="aiu-empty">{t('aiUsage.noUsageData')}</div>
                                            ) : (
                                                <div className="aiu-mini-list">
                                                    {scheduledRows.map(r => (
                                                        <div key={r.key} className="aiu-mini-row">
                                                            <div className="aiu-mini-left">
                                                                <span className={`aiu-trigger-pill ${r.key}`}>
                                                                    {r.label}
                                                                </span>
                                                            </div>
                                                            <div className="aiu-mini-right aiu-mono">
                                                                <span>{r.requests.toLocaleString()}</span>
                                                                <span className="muted">{formatCompactNumber(r.totalTokens)} tok</span>
                                                                <span className="strong">{renderCostText(r)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ── TAB 2: CUSTOM GROUP-BY EXPLORER ────────────────── */}
                    {activeTab === 'explorer' && (
                        <div className="panel aiu-card">
                            <div className="aiu-panel-head">
                                <div>
                                    <h3>{t('aiUsage.explorerTitle')}</h3>
                                    <p>{t('aiUsage.explorerDesc')}</p>
                                </div>
                                <button
                                    type="button"
                                    className="aiu-export-btn"
                                    onClick={exportExplorerCsv}
                                    disabled={explorerItems.length === 0}
                                >
                                    <Download size={14} />
                                    <span>{t('aiUsage.exportCsv')}</span>
                                </button>
                            </div>

                            <div className="aiu-explorer-controls">
                                <div className="aiu-dim-group">
                                    <span className="aiu-dim-label">{t('aiUsage.timeBucketLabel')}</span>
                                    <div className="aiu-pill-group">
                                        {(['none', 'day', 'week', 'month'] as const).map(b => (
                                            <button
                                                key={b}
                                                type="button"
                                                className={`aiu-pill-btn ${explorerBucket === b ? 'active' : ''}`}
                                                onClick={() => setExplorerBucket(b)}
                                            >
                                                {t(`aiUsage.bucket_${b}`)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="aiu-dim-group">
                                    <span className="aiu-dim-label">{t('aiUsage.dimensionsLabel')}</span>
                                    <div className="aiu-dim-chips">
                                        {ALL_DIMENSIONS.map(dim => (
                                            <button
                                                key={dim}
                                                type="button"
                                                className={`aiu-dim-chip ${explorerDims.includes(dim) ? 'active' : ''}`}
                                                onClick={() => toggleExplorerDim(dim)}
                                            >
                                                {t(`aiUsage.dim_${dim}`)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {explorerError && (
                                <div className="aiu-error-banner">
                                    <AlertTriangle size={16} />
                                    <span>{explorerError}</span>
                                </div>
                            )}

                            {loadingExplorer ? (
                                <div className="aiu-loading">
                                    <Loader2 size={22} className="spin" />
                                    <span>{t('common.loading')}</span>
                                </div>
                            ) : explorerItems.length === 0 ? (
                                <div className="aiu-empty">{t('aiUsage.noUsageData')}</div>
                            ) : (
                                <div className="aiu-table-scroll">
                                    <table className="aiu-table">
                                        <thead>
                                            <tr>
                                                {explorerBucket !== 'none' && <th>{t('aiUsage.colBucket')}</th>}
                                                {explorerDims.includes('farm') && <th>{t('aiUsage.dim_farm')}</th>}
                                                {explorerDims.includes('user') && <th>{t('aiUsage.dim_user')}</th>}
                                                {explorerDims.includes('report_type') && <th>{t('aiUsage.dim_report_type')}</th>}
                                                {explorerDims.includes('language') && <th>{t('aiUsage.dim_language')}</th>}
                                                {explorerDims.includes('is_scheduled') && <th>{t('aiUsage.dim_is_scheduled')}</th>}
                                                {explorerDims.includes('status') && <th>{t('aiUsage.dim_status')}</th>}
                                                <th>{t('aiUsage.colModel')}</th>
                                                <th className="num">{t('aiUsage.colCalls')}</th>
                                                <th className="num">{t('aiUsage.colPrompt')}</th>
                                                <th className="num">{t('aiUsage.colCached')}</th>
                                                <th className="num">{t('aiUsage.colOutput')}</th>
                                                <th className="num">{t('aiUsage.colThinking')}</th>
                                                <th className="num">{t('aiUsage.colLatency')}</th>
                                                <th className="num">{t('aiUsage.colCost')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {explorerItems.map((item, idx) => {
                                                const resolved = resolveModelPrice(item.model, prices);
                                                const bd = calculateCostBreakdown(item, resolved?.price ?? null);
                                                return (
                                                    <tr key={idx}>
                                                        {explorerBucket !== 'none' && <td className="aiu-mono">{item.bucket || '—'}</td>}
                                                        {explorerDims.includes('farm') && <td>{item.farm_name || item.farm_id || '—'}</td>}
                                                        {explorerDims.includes('user') && <td className="aiu-mono">{item.user_email || '—'}</td>}
                                                        {explorerDims.includes('report_type') && <td>{item.report_type || '—'}</td>}
                                                        {explorerDims.includes('language') && <td className="aiu-mono">{item.language || '—'}</td>}
                                                        {explorerDims.includes('is_scheduled') && (
                                                            <td>
                                                                {item.is_scheduled == null
                                                                    ? '—'
                                                                    : item.is_scheduled ? t('aiUsage.scheduled') : t('aiUsage.manual')}
                                                            </td>
                                                        )}
                                                        {explorerDims.includes('status') && (
                                                            <td>
                                                                <span className={`aiu-status-pill ${statusBadgeClass(item.status)}`}>
                                                                    {item.status || '—'}
                                                                </span>
                                                            </td>
                                                        )}
                                                        <td>
                                                            <div className="aiu-model-cell">
                                                                <span className="aiu-provider-tag" style={{ borderColor: providerColor(item.provider) }}>
                                                                    {item.provider}
                                                                </span>
                                                                <span className="aiu-mono">{item.model}</span>
                                                            </div>
                                                        </td>
                                                        <td className="num aiu-mono">{item.requests.toLocaleString()}</td>
                                                        <td className="num aiu-mono">{item.prompt_tokens.toLocaleString()}</td>
                                                        <td className="num aiu-mono">{item.cached_tokens.toLocaleString()}</td>
                                                        <td className="num aiu-mono">{item.output_tokens.toLocaleString()}</td>
                                                        <td className="num aiu-mono">{item.thinking_tokens.toLocaleString()}</td>
                                                        <td className="num aiu-mono">{formatSeconds(item.avg_llm_seconds)}</td>
                                                        <td className="num aiu-mono strong">
                                                            {bd ? formatUsd(bd.totalCost) : (
                                                                <button
                                                                    type="button"
                                                                    className="aiu-set-price-chip"
                                                                    onClick={() => openPricingModal(item.model)}
                                                                >
                                                                    {t('aiUsage.setPrice')}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB 3: CALL LOGS ───────────────────────────────── */}
                    {activeTab === 'calls' && (
                        <div className="panel aiu-card">
                            <div className="aiu-panel-head">
                                <div>
                                    <h3>{t('aiUsage.callsTitle')}</h3>
                                    <p>{t('aiUsage.callsDesc')}</p>
                                </div>

                                <div className="aiu-calls-filters">
                                    <div className="aiu-pill-group">
                                        {(['', 'success', 'failed', 'invalid'] as const).map(st => (
                                            <button
                                                key={st || 'all'}
                                                type="button"
                                                className={`aiu-pill-btn ${callsStatusFilter === st ? 'active' : ''}`}
                                                onClick={() => {
                                                    setCallsStatusFilter(st);
                                                    setCallsOffset(0);
                                                }}
                                            >
                                                {st ? st : t('aiUsage.statusAll')}
                                            </button>
                                        ))}
                                    </div>

                                    <select
                                        className="aiu-limit-select"
                                        value={callsLimit}
                                        onChange={e => {
                                            setCallsLimit(Number(e.target.value));
                                            setCallsOffset(0);
                                        }}
                                        aria-label={t('aiUsage.pageSize')}
                                    >
                                        {[25, 50, 100, 200].map(n => (
                                            <option key={n} value={n}>{n} / {t('aiUsage.page')}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {callsError && (
                                <div className="aiu-error-banner">
                                    <AlertTriangle size={16} />
                                    <span>{callsError}</span>
                                </div>
                            )}

                            {loadingCalls ? (
                                <div className="aiu-loading">
                                    <Loader2 size={22} className="spin" />
                                    <span>{t('common.loading')}</span>
                                </div>
                            ) : calls.length === 0 ? (
                                <div className="aiu-empty">{t('aiUsage.noCallsData')}</div>
                            ) : (
                                <>
                                    <div className="aiu-table-scroll">
                                        <table className="aiu-table aiu-calls-table">
                                            <thead>
                                                <tr>
                                                    <th>{t('aiUsage.colTime')}</th>
                                                    <th>{t('aiUsage.dim_farm')}</th>
                                                    <th>{t('aiUsage.colTriggerUser')}</th>
                                                    <th>{t('aiUsage.colTypeLang')}</th>
                                                    <th>{t('aiUsage.colModel')}</th>
                                                    <th>{t('aiUsage.dim_status')}</th>
                                                    <th className="num">{t('aiUsage.colTokens')}</th>
                                                    <th className="num">{t('aiUsage.colLatency')}</th>
                                                    <th className="num">{t('aiUsage.colCost')}</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {calls.map(call => {
                                                    const resolved = resolveModelPrice(call.model, prices);
                                                    const bd = calculateCostBreakdown(call, resolved?.price ?? null);
                                                    const hasTokens = call.prompt_tokens != null || call.output_tokens != null;
                                                    const totalTok = hasTokens
                                                        ? (call.prompt_tokens ?? 0) + (call.output_tokens ?? 0)
                                                        : null;
                                                    return (
                                                        <tr key={call.id}>
                                                            <td className="aiu-mono aiu-nowrap">
                                                                {formatCallTimestamp(call.created_at, effectiveTz)}
                                                            </td>
                                                            <td>{call.farm_name || call.farm_id || '—'}</td>
                                                            <td>
                                                                <div className="aiu-trigger-cell">
                                                                    <span className={`aiu-trigger-pill ${call.is_scheduled ? 'scheduled' : 'manual'}`}>
                                                                        {call.is_scheduled ? t('aiUsage.scheduled') : t('aiUsage.manual')}
                                                                    </span>
                                                                    {call.user_email && (
                                                                        <span className="aiu-mono small">{call.user_email}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div className="aiu-type-cell">
                                                                    <span>{call.report_type || '—'}</span>
                                                                    {call.language && (
                                                                        <span className="aiu-lang-pill">{call.language.toUpperCase()}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div className="aiu-model-cell">
                                                                    <span className="aiu-provider-tag" style={{ borderColor: providerColor(call.provider) }}>
                                                                        {call.provider}
                                                                    </span>
                                                                    <span className="aiu-mono">{call.model}</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div className="aiu-status-cell">
                                                                    <span className={`aiu-status-pill ${statusBadgeClass(call.status)}`}>
                                                                        {call.status}
                                                                    </span>
                                                                    {call.error_message && (
                                                                        <span className="aiu-error-snippet" title={call.error_message}>
                                                                            {call.error_message}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td
                                                                className="num aiu-mono"
                                                                title={`Prompt: ${formatNullableCount(call.prompt_tokens)} (Cached: ${formatNullableCount(call.cached_tokens)}) | Output: ${formatNullableCount(call.output_tokens)} (Thinking: ${formatNullableCount(call.thinking_tokens)})`}
                                                            >
                                                                <div>{formatCompactNumber(totalTok)}</div>
                                                                <div className="aiu-tok-mini">
                                                                    {formatCompactNumber(call.prompt_tokens)} / {formatCompactNumber(call.output_tokens)}
                                                                </div>
                                                            </td>
                                                            <td className="num aiu-mono">{formatSeconds(call.llm_seconds)}</td>
                                                            <td className="num aiu-mono strong">
                                                                {bd ? formatUsd(bd.totalCost) : '—'}
                                                            </td>
                                                            <td className="num">
                                                                <button
                                                                    type="button"
                                                                    className="aiu-inspect-btn"
                                                                    onClick={() => openCallInspector(call)}
                                                                    title={t('aiUsage.viewReport')}
                                                                >
                                                                    <Eye size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    <div className="aiu-pagination">
                                        <span className="aiu-mono">
                                            {t('aiUsage.showingRange', {
                                                from: callsOffset + 1,
                                                to: callsOffset + calls.length,
                                                total: callsTotal
                                            })}
                                        </span>
                                        <div className="aiu-page-btns">
                                            <button
                                                type="button"
                                                disabled={callsOffset === 0}
                                                onClick={() => setCallsOffset(Math.max(0, callsOffset - callsLimit))}
                                            >
                                                <ChevronLeft size={14} />
                                                <span>{t('aiUsage.prev')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={callsOffset + calls.length >= callsTotal}
                                                onClick={() => setCallsOffset(callsOffset + callsLimit)}
                                            >
                                                <span>{t('aiUsage.next')}</span>
                                                <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ── MODEL PRICING MODAL ────────────────────────────────────── */}
            {pricingOpen && (
                <div className="modal-overlay" onClick={() => setPricingOpen(false)}>
                    <div className="panel aiu-modal" onClick={e => e.stopPropagation()}>
                        <div className="aiu-modal-head">
                            <div>
                                <h3>{t('aiUsage.pricingModalTitle')}</h3>
                                <p>{t('aiUsage.pricingModalDesc')}</p>
                            </div>
                            <button type="button" className="aiu-close-btn" onClick={() => setPricingOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="aiu-formula-box">
                            <code>
                                cost = ((prompt_tokens − cached_tokens) × input + cached_tokens × cache + output_tokens × output) / 1,000,000
                            </code>
                            <p>{t('aiUsage.pricingFormulaNote')}</p>
                        </div>

                        {/* Unconfigured models detected from API data */}
                        {discoveredModels.some(m => !resolveModelPrice(m.raw, draftPrices)) && (
                            <div className="aiu-detected-models">
                                <span className="aiu-detected-label">{t('aiUsage.detectedUnpriced')}</span>
                                <div className="aiu-detected-chips">
                                    {discoveredModels
                                        .filter(m => !resolveModelPrice(m.raw, draftPrices))
                                        .map(m => (
                                            <button
                                                key={m.raw}
                                                type="button"
                                                className="aiu-detected-chip"
                                                onClick={() => ensureDraftModel(m.base)}
                                                title={m.raw !== m.base ? `${m.raw} → ${m.base}` : m.raw}
                                            >
                                                <Plus size={12} />
                                                <span>{m.base}</span>
                                                {m.raw !== m.base && <small>({m.raw})</small>}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        <div className="aiu-pricing-list">
                            {Object.keys(draftPrices).length === 0 ? (
                                <div className="aiu-empty compact">{t('aiUsage.noPricingRules')}</div>
                            ) : (
                                <table className="aiu-table">
                                    <thead>
                                        <tr>
                                            <th>{t('aiUsage.colModelKey')}</th>
                                            <th>{t('aiUsage.priceInput')}</th>
                                            <th>{t('aiUsage.priceCache')}</th>
                                            <th>{t('aiUsage.priceOutput')}</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(draftPrices).map(([key, price]) => (
                                            <tr key={key}>
                                                <td className="aiu-mono">{key}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={price.input}
                                                        onChange={e => updateDraftField(key, 'input', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={price.cache}
                                                        onChange={e => updateDraftField(key, 'cache', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={price.output}
                                                        onChange={e => updateDraftField(key, 'output', e.target.value)}
                                                    />
                                                </td>
                                                <td className="num">
                                                    <button
                                                        type="button"
                                                        className="aiu-icon-danger"
                                                        onClick={() => deleteDraftModel(key)}
                                                        title={t('btn.delete')}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <form className="aiu-add-price-form" onSubmit={addNewDraftModel}>
                            <input
                                type="text"
                                placeholder={t('aiUsage.modelKeyPlaceholder')}
                                value={newModelName}
                                onChange={e => setNewModelName(e.target.value)}
                            />
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder={t('aiUsage.priceInput')}
                                value={newModelInput}
                                onChange={e => setNewModelInput(e.target.value)}
                            />
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder={t('aiUsage.priceCache')}
                                value={newModelCache}
                                onChange={e => setNewModelCache(e.target.value)}
                            />
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder={t('aiUsage.priceOutput')}
                                value={newModelOutput}
                                onChange={e => setNewModelOutput(e.target.value)}
                            />
                            <button type="submit" className="accent">
                                <Plus size={14} />
                                <span>{t('aiUsage.addRule')}</span>
                            </button>
                        </form>

                        <div className="aiu-modal-foot">
                            <button type="button" onClick={() => setPricingOpen(false)}>
                                {t('btn.cancel')}
                            </button>
                            <button type="button" className="primary" onClick={handleSavePricing}>
                                {t('btn.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── CALL & REPORT INSPECTOR MODAL ──────────────────────────── */}
            {selectedCall && (
                <div className="modal-overlay" onClick={() => setSelectedCall(null)}>
                    <div className="panel aiu-modal aiu-report-modal" onClick={e => e.stopPropagation()}>
                        <div className="aiu-modal-head">
                            <div>
                                <h3>{t('aiUsage.callDetailTitle')}</h3>
                                <p className="aiu-mono">{selectedCall.id}</p>
                            </div>
                            <div className="aiu-modal-head-right">
                                <span className={`aiu-status-pill ${statusBadgeClass(selectedCall.status)}`}>
                                    {selectedCall.status === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                    {selectedCall.status}
                                </span>
                                <button type="button" className="aiu-close-btn" onClick={() => setSelectedCall(null)}>
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="aiu-call-meta-grid">
                            <div>
                                <span className="label">{t('aiUsage.colTime')}</span>
                                <span className="val aiu-mono">{formatCallTimestamp(selectedCall.created_at, effectiveTz)}</span>
                            </div>
                            <div>
                                <span className="label">{t('aiUsage.dim_farm')}</span>
                                <span className="val">{selectedCall.farm_name || selectedCall.farm_id || '—'}</span>
                            </div>
                            <div>
                                <span className="label">{t('aiUsage.colModel')}</span>
                                <span className="val aiu-mono">{selectedCall.provider} / {selectedCall.model}</span>
                            </div>
                            <div>
                                <span className="label">{t('aiUsage.colLatency')}</span>
                                <span className="val aiu-mono">{formatSeconds(selectedCall.llm_seconds)}</span>
                            </div>
                            <div>
                                <span className="label">{t('aiUsage.colPrompt')} / {t('aiUsage.colCached')}</span>
                                <span className="val aiu-mono">
                                    {formatNullableCount(selectedCall.prompt_tokens)} / {formatNullableCount(selectedCall.cached_tokens)}
                                </span>
                            </div>
                            <div>
                                <span className="label">{t('aiUsage.colOutput')} ({t('aiUsage.colThinking')})</span>
                                <span className="val aiu-mono">
                                    {formatNullableCount(selectedCall.output_tokens)} ({formatNullableCount(selectedCall.thinking_tokens)})
                                </span>
                            </div>
                        </div>

                        {selectedCall.error_message && (
                            <div className="aiu-error-box">
                                <strong>{t('aiUsage.errorMessageLabel')}:</strong>
                                <pre>{selectedCall.error_message}</pre>
                            </div>
                        )}

                        <div className="aiu-report-section">
                            <div className="aiu-report-head">
                                <h4>{t('aiUsage.reportPayloadTitle')}</h4>
                                {reportDetail && (
                                    <button
                                        type="button"
                                        className="aiu-pill-btn"
                                        onClick={() => setShowRawJson(v => !v)}
                                    >
                                        {showRawJson ? t('aiUsage.hideRawJson') : t('aiUsage.showRawJson')}
                                    </button>
                                )}
                            </div>

                            {loadingReport ? (
                                <div className="aiu-loading compact">
                                    <Loader2 size={20} className="spin" />
                                    <span>{t('common.loading')}</span>
                                </div>
                            ) : reportError ? (
                                <div className="aiu-error-banner">{reportError}</div>
                            ) : reportDetail ? (
                                showRawJson ? (
                                    <pre className="aiu-json-pre">{JSON.stringify(reportDetail, null, 2)}</pre>
                                ) : (
                                    <div className="aiu-report-preview">
                                        {typeof reportDetail.period === 'string' && reportDetail.period && (
                                            <div className="aiu-report-field">
                                                <span className="label">period</span>
                                                <span className="aiu-mono">{reportDetail.period}</span>
                                            </div>
                                        )}
                                        {reportDetail.result != null && typeof reportDetail.result === 'object' ? (
                                            Object.entries(reportDetail.result as Record<string, unknown>).map(([k, val]) => {
                                                if (val == null || val === '') return null;
                                                return (
                                                    <div key={k} className="aiu-report-field">
                                                        <span className="label">{k}</span>
                                                        <pre className="aiu-report-text">
                                                            {typeof val === 'string' ? val : JSON.stringify(val, null, 2)}
                                                        </pre>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <pre className="aiu-json-pre">{JSON.stringify(reportDetail, null, 2)}</pre>
                                        )}
                                    </div>
                                )
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

