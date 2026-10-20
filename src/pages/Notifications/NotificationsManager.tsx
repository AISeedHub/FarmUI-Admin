import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bell,
    Plus,
    Search,
    Loader2,
    Edit2,
    Trash2,
    Send,
    Users,
    Copy,
    Eye,
    EyeOff,
    HelpCircle,
    History,
    X,
    Activity,
    CheckCircle,
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Lock
} from 'lucide-react';
import { notificationsApi, farmsApi, usersApi, ApiError } from '../../api/services';
import { Farm, UserResponse, NotificationChannel, NotificationTemplate, NotificationLog, NotificationEventType } from '../../types';
import { NOTIFICATION_CHANNEL_CODE_MAX_LENGTH } from '../../utils/code';
import { receivesType, routingIssues, sameEventTypes, RoutableChannel } from '../../utils/notificationRouting';
import HelpTip from '../../components/HelpTip';
import './NotificationsManager.css';

type Scope = 'system' | 'farm';
type ChannelForm = Omit<NotificationChannel, 'id'>;

const emptyChannelForm = (scope: Scope = 'system', farmId: string | null = null): ChannelForm => ({
    code: '',
    name: '',
    webhook_url: '',
    mention_role_id: '',
    scope,
    farm_id: farmId,
    language: null,
    event_types: null,
    is_active: true
});

// The per-farm split the backend recommends, offered as one-click starting points in
// the create form: alerts keep the farm role's ping, the high-volume activity channel
// goes without one so it cannot bury offline alerts and daily reports. Types missing
// from the live catalog are dropped when applied.
const FARM_CHANNEL_PRESETS: { purpose: string; eventTypes: string[]; ping: boolean }[] = [
    { purpose: 'alerts', eventTypes: ['farm_offline', 'farm_reconnected', 'report_daily'], ping: true },
    { purpose: 'activity', eventTypes: ['automation_execution', 'force_control'], ping: false }
];

// GET /notifications/logs caps `limit` at 200 and has no channel_id filter yet, so a
// channel's history is the part of its farm's latest rows that went to it.
const LOGS_FETCH_LIMIT = 200;

// The history dialog shows one channel, or every row of a farm. Skipped rows and the
// rows of deleted channels carry channel_id = null, so they only show up in the latter.
type LogsTarget =
    | { kind: 'channel'; channel: NotificationChannel }
    | { kind: 'farm'; farm: Farm };

// FastAPI's `detail` reads better than the "API Error: 502 — …" wrapper. A failure
// without a response (e.g. a 500 missing CORS headers) only ever says "Failed to fetch".
const describeError = (err: unknown): string =>
    err instanceof ApiError
        ? ApiError.detailText(err.detail) || err.message
        : (err as Error)?.message || 'Unknown error';

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

export default function NotificationsManager() {
    const { t } = useTranslation();

    // Tab control: 'channels' | 'templates'
    const [activeTab, setActiveTab] = useState<'channels' | 'templates'>('channels');

    // Load states
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);

    // Master data
    const [channels, setChannels] = useState<NotificationChannel[]>([]);
    const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
    const [farms, setFarms] = useState<Farm[]>([]);
    const [users, setUsers] = useState<UserResponse[]>([]);

    // Every /notifications/channels* endpoint is super-admin only.
    const [forbidden, setForbidden] = useState(false);

    // Search and filter states
    const [searchTerm, setSearchTerm] = useState('');
    // 'all' | 'system' | a farm id
    const [groupFilter, setGroupFilter] = useState('all');
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    // --- Channel Modals & States ---
    const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
    const [channelForm, setChannelForm] = useState<ChannelForm>(emptyChannelForm());
    // Creating a channel next to an "all types" sibling: also narrow that sibling to
    // the types the new channel leaves out, so the two do not both receive them.
    const [narrowAllTypesSiblings, setNarrowAllTypesSiblings] = useState(true);
    const [revealedWebhooks, setRevealedWebhooks] = useState<Record<string, boolean>>({});
    const [eventTypeCatalog, setEventTypeCatalog] = useState<Record<Scope, NotificationEventType[]>>({ system: [], farm: [] });
    const [loadingEventTypes, setLoadingEventTypes] = useState(true);

    // A catalog that fails to load leaves its checkbox list empty instead of sinking the page.
    const loadEventTypes = (scope: Scope): Promise<NotificationEventType[]> =>
        notificationsApi.getEventTypes(scope)
            .then(data => data?.[scope] || [])
            .catch(error => {
                console.error('Failed to fetch event types for scope:', scope, error);
                return [];
            });

    // --- Member Modal & States ---
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [selectedChannelForMembers, setSelectedChannelForMembers] = useState<NotificationChannel | null>(null);
    const [channelMembers, setChannelMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState('');

    // --- Template Modals & States ---
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
    const [templateForm, setTemplateForm] = useState<Omit<NotificationTemplate, 'id'>>({
        type: 'farm_offline',
        language: 'en',
        name: '',
        title_template: '',
        body_template: '',
        is_active: true
    });

    const [templateVarsInfo, setTemplateVarsInfo] = useState<any>(null);

    // --- Log History Popup States ---
    const [logsTarget, setLogsTarget] = useState<LogsTarget | null>(null);
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    // The farm has more rows than the one page fetched.
    const [logsTruncated, setLogsTruncated] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logSearchTerm, setLogSearchTerm] = useState('');
    const [logStatusFilter, setLogStatusFilter] = useState('all');
    const [logSeverityFilter, setLogSeverityFilter] = useState('all');
    const [logTypeFilter, setLogTypeFilter] = useState('all');
    // Farm view only: 'all' | a channel id | 'none' (channel_id = null)
    const [logChannelFilter, setLogChannelFilter] = useState('all');
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const [loadingVars, setLoadingVars] = useState(false);
    const [lastFocusedField, setLastFocusedField] = useState<'title' | 'body'>('body');
    const titleRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    const fetchAndSetTemplateVars = async (type: string, isNew: boolean = false) => {
        setLoadingVars(true);
        try {
            const data = await notificationsApi.getTemplateVariables(type);
            setTemplateVarsInfo(data);
            
            if (isNew && data && data.types && data.types.length > 0) {
                const typeInfo = data.types[0];
                setTemplateForm(prev => ({
                    ...prev,
                    title_template: typeInfo.default_title || prev.title_template,
                    body_template: typeInfo.default_body || prev.body_template
                }));
            }
        } catch (error) {
            console.error('Failed to fetch template variables', error);
            setTemplateVarsInfo(null);
        } finally {
            setLoadingVars(false);
        }
    };

    const handleInsertVariable = (varName: string) => {
        const textToInsert = `{${varName}}`;
        const fieldRef = lastFocusedField === 'title' ? titleRef : bodyRef;
        const currentElem = fieldRef.current;
        
        if (currentElem) {
            const startPos = currentElem.selectionStart || 0;
            const endPos = currentElem.selectionEnd || 0;
            const currentVal = lastFocusedField === 'title' ? templateForm.title_template : templateForm.body_template;
            
            const newVal = currentVal.substring(0, startPos) + textToInsert + currentVal.substring(endPos);
            
            setTemplateForm(prev => ({
                ...prev,
                [lastFocusedField === 'title' ? 'title_template' : 'body_template']: newVal
            }));
            
            setTimeout(() => {
                currentElem.focus();
                currentElem.setSelectionRange(startPos + textToInsert.length, startPos + textToInsert.length);
            }, 0);
        } else {
            setTemplateForm(prev => ({
                ...prev,
                body_template: prev.body_template + textToInsert
            }));
        }
    };

    const eventTypeOptions = [
        'automation_execution',
        'farm_offline',
        'farm_reconnected',
        'system_health',
        'report_daily',
        'report_weekly',
        'test'
    ];

    useEffect(() => {
        loadData();
        Promise.all([loadEventTypes('farm'), loadEventTypes('system')])
            .then(([farm, system]) => setEventTypeCatalog({ farm, system }))
            .finally(() => setLoadingEventTypes(false));
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [channelsData, templatesData, farmsData, usersData] = await Promise.all([
                notificationsApi.getChannels(),
                notificationsApi.getTemplates(),
                farmsApi.getAll(),
                usersApi.getAll()
            ]);
            setChannels(channelsData);
            setTemplates(templatesData);
            setFarms(farmsData);
            setUsers(usersData);
            setForbidden(false);
        } catch (error) {
            if (error instanceof ApiError && error.status === 403) setForbidden(true);
            console.error('Failed to load notifications management data', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Routing helpers ---
    const farmTypeValues = useMemo(() => eventTypeCatalog.farm.map(e => e.value), [eventTypeCatalog]);

    const typeLabel = (scope: Scope, value: string) =>
        eventTypeCatalog[scope].find(e => e.value === value)?.label || value.replace(/_/g, ' ');

    const channelsOfFarm = (farmId: string) =>
        channels.filter(c => c.scope === 'farm' && c.farm_id === farmId);

    const nameList = (list: RoutableChannel[]) => list.map(c => c.name).join(', ');

    // --- Channel CRUD handlers ---
    // `target` pre-fills scope and farm when starting from a group's "Add channel".
    const handleOpenChannelModal = (channel: NotificationChannel | null = null, target?: { scope: Scope; farmId?: string | null }) => {
        setNarrowAllTypesSiblings(true);
        if (channel) {
            setEditingChannel(channel);
            setChannelForm({
                code: channel.code,
                name: channel.name,
                webhook_url: channel.webhook_url,
                mention_role_id: channel.mention_role_id || '',
                scope: channel.scope,
                farm_id: channel.farm_id || null,
                language: channel.language || null,
                // Keep [] apart from null: [] receives nothing, null receives everything.
                event_types: channel.event_types ?? null,
                is_active: channel.is_active
            });
        } else {
            setEditingChannel(null);
            setChannelForm(emptyChannelForm(target?.scope, target?.farmId ?? null));
        }
        setIsChannelModalOpen(true);
    };

    // The farm's routing as it would be once the open form is saved: its other
    // channels (an "all types" one narrowed if that box is ticked) plus this one.
    // Feeds both the hints beside each event type and the warning on save.
    const draftId = editingChannel?.id ?? '__draft__';
    const isFarmForm = channelForm.scope === 'farm' && !!channelForm.farm_id;
    const formSiblings = isFarmForm ? channelsOfFarm(channelForm.farm_id!).filter(c => c.id !== editingChannel?.id) : [];
    const allTypesSiblings = formSiblings.filter(c => c.is_active && c.event_types == null);
    const formEventTypes = channelForm.event_types ?? null;
    const narrowedTypes = formEventTypes ? farmTypeValues.filter(v => !formEventTypes.includes(v)) : [];
    // Only offered while creating, and only when it leaves the sibling something to receive.
    const canNarrow = !editingChannel && channelForm.is_active && allTypesSiblings.length > 0
        && !!formEventTypes && formEventTypes.length > 0 && narrowedTypes.length > 0;
    const willNarrow = canNarrow && narrowAllTypesSiblings;
    const draftChannel: RoutableChannel = {
        id: draftId,
        name: channelForm.name.trim() || channelForm.code.trim() || t('notifications.thisChannel'),
        is_active: channelForm.is_active,
        event_types: formEventTypes
    };
    const projectedChannels: RoutableChannel[] = [
        ...formSiblings.map(c => (willNarrow && allTypesSiblings.includes(c) ? { ...c, event_types: narrowedTypes } : c)),
        draftChannel
    ];

    // Codes are unique system-wide, and a duplicate comes back as a bare 500.
    const trimmedCode = channelForm.code.trim().toLowerCase();
    const codeTaken = !!trimmedCode && channels.some(c => c.id !== editingChannel?.id && c.code.toLowerCase() === trimmedCode);

    const applyFarmPreset = (preset: typeof FARM_CHANNEL_PRESETS[number]) => {
        const farm = farms.find(f => f.id === channelForm.farm_id);
        const prefix = farm ? `${farm.code.toLowerCase().replace(/\s+/g, '-')}-` : '';
        setChannelForm(prev => ({
            ...prev,
            code: `${prefix}${preset.purpose}`,
            name: `#${prefix}${preset.purpose}`,
            event_types: preset.eventTypes.filter(v => farmTypeValues.includes(v)),
            mention_role_id: preset.ping ? prev.mention_role_id : ''
        }));
    };

    const handleSaveChannel = async (e: React.FormEvent) => {
        e.preventDefault();

        if (channelForm.scope === 'farm' && !channelForm.farm_id) {
            alert(t('notifications.farmRequired'));
            return;
        }
        if (codeTaken) {
            alert(t('notifications.codeTaken', { code: channelForm.code.trim() }));
            return;
        }

        // Warn, never block. Only when routing changes, so renaming a channel does not
        // re-raise every standing issue of its farm.
        const routingChanged = !editingChannel || willNarrow
            || editingChannel.is_active !== channelForm.is_active
            || !sameEventTypes(editingChannel.event_types, channelForm.event_types);
        if (isFarmForm && routingChanged) {
            const issues = routingIssues(projectedChannels, farmTypeValues);
            const lines = [
                ...issues.duplicated.map(d => t('notifications.warnDuplicate', {
                    type: typeLabel('farm', d.type), list: nameList(d.channels), count: d.channels.length
                })),
                ...issues.uncovered.map(type => t('notifications.warnUncovered', { type: typeLabel('farm', type) }))
            ];
            if (lines.length > 0) {
                const message = `${t('notifications.warnIntro')}\n\n${lines.map(l => `• ${l}`).join('\n')}\n\n${t('notifications.warnProceed')}`;
                if (!window.confirm(message)) return;
            }
        }

        setSaving(true);
        try {
            const fields = {
                code: channelForm.code.trim(),
                name: channelForm.name.trim(),
                webhook_url: channelForm.webhook_url.trim(),
                mention_role_id: channelForm.mention_role_id?.trim() || null,
                language: channelForm.language || null,
                event_types: formEventTypes,
                is_active: channelForm.is_active
            };

            if (editingChannel) {
                // scope and farm_id are locked once created and never sent on PATCH.
                await notificationsApi.updateChannel(editingChannel.id, fields);
                alert(t('notifications.updateSuccess'));
            } else {
                await notificationsApi.createChannel({
                    ...fields,
                    scope: channelForm.scope,
                    ...(channelForm.scope === 'farm' ? { farm_id: channelForm.farm_id } : {})
                });
                // Narrow only once the new channel exists: if the create had failed, the
                // farm would have lost those types instead of receiving them twice.
                const narrowFailed: string[] = [];
                if (willNarrow) {
                    for (const sibling of allTypesSiblings) {
                        try {
                            await notificationsApi.updateChannel(sibling.id, { event_types: narrowedTypes });
                        } catch (err) {
                            console.error('Failed to narrow channel', sibling.code, err);
                            narrowFailed.push(sibling.name);
                        }
                    }
                }
                alert(narrowFailed.length > 0
                    ? t('notifications.narrowFailed', { list: narrowFailed.join(', ') })
                    : t('notifications.createSuccess'));
            }
            setIsChannelModalOpen(false);
            loadData();
        } catch (err) {
            if (editingChannel && isNotFound(err)) {
                alert(t('notifications.channelGone'));
                setIsChannelModalOpen(false);
                loadData();
                return;
            }
            alert(t(editingChannel ? 'notifications.updateFailed' : 'notifications.createFailed', { error: describeError(err) }));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteChannel = async (channel: NotificationChannel) => {
        // Name the types that would then reach no channel of the farm at all.
        const orphaned = channel.scope === 'farm' && channel.farm_id
            ? routingIssues(channelsOfFarm(channel.farm_id).filter(c => c.id !== channel.id), farmTypeValues)
                .uncovered.filter(type => receivesType(channel, type))
            : [];
        const message = orphaned.length > 0
            ? `${t('notifications.deleteConfirm')}\n\n${t('notifications.deleteOrphans', { list: orphaned.map(v => typeLabel('farm', v)).join(', ') })}`
            : t('notifications.deleteConfirm');
        if (!window.confirm(message)) return;
        try {
            await notificationsApi.deleteChannel(channel.id);
            alert(t('notifications.deleteSuccess'));
            loadData();
        } catch (err) {
            if (isNotFound(err)) {
                alert(t('notifications.channelGone'));
                loadData();
                return;
            }
            alert(t('notifications.deleteFailed', { error: describeError(err) }));
        }
    };

    const handleTestChannel = async (id: string) => {
        setTestingId(id);
        try {
            const result = await notificationsApi.testChannel(id);
            if (result && (result.success !== false)) {
                alert(t('notifications.testSuccess'));
            } else {
                alert(t('notifications.testFailed', { error: result.message || 'Webhook rejected payload' }));
            }
        } catch (err) {
            if (isNotFound(err)) {
                alert(t('notifications.channelGone'));
                loadData();
                return;
            }
            // A webhook that refuses is a 502 "Delivery failed: <reason>".
            alert(t('notifications.testFailed', { error: describeError(err) }));
        } finally {
            setTestingId(null);
        }
    };

    // --- Channel Members handlers ---
    const handleOpenMembersModal = async (channel: NotificationChannel) => {
        setSelectedChannelForMembers(channel);
        setIsMemberModalOpen(true);
        setLoadingMembers(true);
        setSelectedUserIdToAdd('');
        try {
            const members = await notificationsApi.getChannelMembers(channel.id);
            setChannelMembers(members || []);
        } catch (err) {
            console.error('Failed to load channel members', err);
            setChannelMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleAddMember = async () => {
        if (!selectedChannelForMembers || !selectedUserIdToAdd) return;
        setSaving(true);
        try {
            await notificationsApi.addChannelMember(selectedChannelForMembers.id, selectedUserIdToAdd);
            alert(t('notifications.addMemberSuccess'));
            setSelectedUserIdToAdd('');
            // reload members list
            const members = await notificationsApi.getChannelMembers(selectedChannelForMembers.id);
            setChannelMembers(members || []);
        } catch (err: any) {
            alert(t('notifications.addMemberFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!selectedChannelForMembers) return;
        if (!window.confirm(t('notifications.removeMemberConfirm'))) return;
        setSaving(true);
        try {
            await notificationsApi.deleteChannelMember(selectedChannelForMembers.id, userId);
            alert(t('notifications.removeMemberSuccess'));
            // reload members list
            const members = await notificationsApi.getChannelMembers(selectedChannelForMembers.id);
            setChannelMembers(members || []);
        } catch (err: any) {
            alert(t('notifications.removeMemberFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    // Helper to match member details from users list
    const getMemberDetail = (member: any) => {
        const userId = member.user_id || member.id;
        const matched = users.find(u => u.id === userId);
        return {
            id: userId,
            username: matched ? matched.username : 'Unknown User',
            email: matched ? matched.email : (member.email || 'No email info')
        };
    };

    const handleOpenLogsModal = async (target: LogsTarget) => {
        setLogsTarget(target);
        setLogs([]);
        setLogsTruncated(false);
        setLoadingLogs(true);
        setLogSearchTerm('');
        setLogStatusFilter('all');
        setLogSeverityFilter('all');
        setLogTypeFilter('all');
        setLogChannelFilter('all');
        setExpandedLogId(null);

        try {
            const scope: Scope = target.kind === 'farm' ? 'farm' : target.channel.scope;
            const farmId = target.kind === 'farm' ? target.farm.id : target.channel.farm_id;
            const page = await notificationsApi.getLogs({
                scope,
                farm_id: scope === 'farm' ? farmId : undefined,
                limit: LOGS_FETCH_LIMIT
            });
            const rows = page?.items || [];
            // Every receiving channel writes its own row, so a channel's history is
            // exactly the rows carrying its id.
            setLogs(target.kind === 'channel' ? rows.filter(log => log.channel_id === target.channel.id) : rows);
            setLogsTruncated((page?.total ?? rows.length) > rows.length);
        } catch (err) {
            console.error('Failed to load notification logs', err);
        } finally {
            setLoadingLogs(false);
        }
    };

    const logChannelLabel = (channelId: string | null | undefined) =>
        (channelId && channels.find(c => c.id === channelId)?.name) || '—';

    // --- Template CRUD handlers ---
    const handleOpenTemplateModal = (template: NotificationTemplate | null = null) => {
        const initialType = template ? template.type : 'farm_offline';
        if (template) {
            setEditingTemplate(template);
            setTemplateForm({
                type: template.type,
                language: template.language,
                name: template.name,
                title_template: template.title_template,
                body_template: template.body_template,
                is_active: template.is_active
            });
        } else {
            setEditingTemplate(null);
            setTemplateForm({
                type: 'farm_offline',
                language: 'en',
                name: '',
                title_template: '',
                body_template: '',
                is_active: true
            });
        }
        setIsTemplateModalOpen(true);
        fetchAndSetTemplateVars(initialType, !template);
    };

    const handleSaveTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...templateForm,
                name: templateForm.name.trim(),
                title_template: templateForm.title_template.trim(),
                body_template: templateForm.body_template.trim()
            };

            if (editingTemplate) {
                await notificationsApi.updateTemplate(editingTemplate.id, payload);
                alert(t('notifications.templateUpdateSuccess'));
            } else {
                await notificationsApi.createTemplate(payload);
                alert(t('notifications.templateCreateSuccess'));
            }
            setIsTemplateModalOpen(false);
            loadData();
        } catch (err: any) {
            alert(t(editingTemplate ? 'notifications.templateUpdateFailed' : 'notifications.templateCreateFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!window.confirm(t('notifications.templateDeleteConfirm'))) return;
        try {
            await notificationsApi.deleteTemplate(id);
            alert(t('notifications.templateDeleteSuccess'));
            loadData();
        } catch (err: any) {
            alert(t('notifications.templateDeleteFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    // Masking Webhook URL helper
    const getMaskedWebhook = (url: string) => {
        if (!url) return '';
        try {
            const parsed = new URL(url);
            const pathParts = parsed.pathname.split('/');
            if (pathParts.length > 2) {
                const token = pathParts[pathParts.length - 1];
                const maskedToken = token.slice(0, 8) + '••••••••••••';
                pathParts[pathParts.length - 1] = maskedToken;
                parsed.pathname = pathParts.join('/');
            }
            return parsed.toString();
        } catch {
            return url.slice(0, 30) + '••••••••';
        }
    };

    const handleCopyWebhook = (url: string) => {
        navigator.clipboard.writeText(url);
        alert('Webhook URL copied to clipboard!');
    };

    // Channels grouped as System, then one group per farm. Farms without a channel
    // still get a group (header only) so the gap is visible and one click from fixed.
    // A search term matching a farm's name or code keeps all of its channels.
    type ChannelGroup = { key: string; scope: Scope; farm: Farm | null; farmId: string | null; all: NotificationChannel[]; shown: NotificationChannel[] };
    const channelGroups: ChannelGroup[] = (() => {
        const term = searchTerm.trim().toLowerCase();
        const matches = (c: NotificationChannel) => c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term);
        const groups: ChannelGroup[] = [];
        const system = channels.filter(c => c.scope === 'system');
        groups.push({ key: 'system', scope: 'system', farm: null, farmId: null, all: system, shown: term ? system.filter(matches) : system });

        // Farm channels whose farm is not in the list (deleted, or no farm_id) still need a home.
        const farmIds = [...farms.map(f => f.id), ...channels.filter(c => c.scope === 'farm').map(c => c.farm_id || '')];
        for (const farmId of Array.from(new Set(farmIds))) {
            const farm = farms.find(f => f.id === farmId) || null;
            const all = channels.filter(c => c.scope === 'farm' && (c.farm_id || '') === farmId);
            const farmMatches = !!term && !!farm && (farm.name.toLowerCase().includes(term) || farm.code.toLowerCase().includes(term));
            const shown = !term || farmMatches ? all : all.filter(matches);
            groups.push({ key: farmId || 'no-farm', scope: 'farm', farm, farmId: farmId || null, all, shown });
        }

        return groups
            .filter(g => {
                if (groupFilter !== 'all' && groupFilter !== g.key) return false;
                // While searching, hide groups with nothing to show; an explicitly picked group always stays.
                if (term && g.shown.length === 0 && groupFilter === 'all') return false;
                return true;
            })
            // Farms without a channel sink below the configured ones (stable, System stays first).
            .sort((a, b) => Number(a.scope === 'farm' && a.all.length === 0) - Number(b.scope === 'farm' && b.all.length === 0));
    })();

    const toggleGroup = (key: string) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

    // The global "Create Channel" follows the group filter, if one farm is picked.
    const createTarget = (): { scope: Scope; farmId?: string | null } =>
        groupFilter === 'all' || groupFilter === 'system'
            ? { scope: 'system' }
            : { scope: 'farm', farmId: groupFilter };

    const filteredTemplates = templates.filter(template => {
        return (
            template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            template.type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const getLogs7dData = () => {
        const result = Array(7).fill(0);
        const now = new Date();
        logs.forEach(log => {
            const logDate = new Date(log.created_at);
            const diffTime = now.getTime() - logDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 7) {
                result[6 - diffDays]++;
            }
        });
        return result;
    };

    const getFilteredLogs = () => {
        return logs.filter(log => {
            const matchesSearch = !logSearchTerm || 
                (log.title && log.title.toLowerCase().includes(logSearchTerm.toLowerCase())) ||
                (log.body && log.body.toLowerCase().includes(logSearchTerm.toLowerCase()));
            
            if (!matchesSearch) return false;

            if (logStatusFilter !== 'all') {
                if (log.status !== logStatusFilter) return false;
            }

            if (logSeverityFilter !== 'all') {
                if (log.severity !== logSeverityFilter) return false;
            }

            if (logTypeFilter !== 'all') {
                if (log.type !== logTypeFilter) return false;
            }

            if (logChannelFilter !== 'all') {
                if ((log.channel_id || 'none') !== logChannelFilter) return false;
            }

            return true;
        });
    };

    const getRelativeTimeString = (date: Date) => {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const renderChannelRow = (channel: NotificationChannel, farm: Farm | null) => {
        const isRevealed = revealedWebhooks[channel.id];
        return (
            <tr key={channel.id} className={`channel-row ${channel.is_active ? '' : 'inactive'}`}>
                <td className="code-cell">{channel.code}</td>
                <td className="name-cell">{channel.name}</td>
                <td>
                    <div className="filters-cell">
                        {channel.event_types == null ? (
                            <span className="filter-tag all-types">{t('notifications.allTypes')}</span>
                        ) : channel.event_types.length === 0 ? (
                            <span className="filter-tag no-types">{t('notifications.noTypes')}</span>
                        ) : (
                            channel.event_types.map(evt => (
                                <span key={evt} className="filter-tag event-type">{typeLabel(channel.scope, evt)}</span>
                            ))
                        )}
                    </div>
                </td>
                <td>
                    {channel.mention_role_id ? (
                        <span className="ping-badge" title={channel.mention_role_id}>@{channel.mention_role_id}</span>
                    ) : (
                        <span className="empty-filter">{t('notifications.noPing')}</span>
                    )}
                </td>
                <td>
                    {channel.language ? (
                        <span className="locale-badge">{channel.language}</span>
                    ) : (
                        // null falls back to the farm's default language, then en.
                        <span className="locale-badge inherited" title={t('notifications.langInheritedHint')}>
                            {farm?.default_language || 'en'} · {t('notifications.langDefault')}
                        </span>
                    )}
                </td>
                <td>
                    <div className="webhook-cell">
                        <span className="url">
                            {isRevealed ? channel.webhook_url : getMaskedWebhook(channel.webhook_url)}
                        </span>
                        <div className="webhook-actions">
                            <button
                                className="icon-only-btn"
                                title="Toggle Webhook visibility"
                                onClick={() => setRevealedWebhooks(prev => ({ ...prev, [channel.id]: !prev[channel.id] }))}
                            >
                                {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                                className="icon-only-btn"
                                title="Copy webhook URL"
                                onClick={() => handleCopyWebhook(channel.webhook_url)}
                            >
                                <Copy size={13} />
                            </button>
                        </div>
                    </div>
                </td>
                <td>
                    <span className={`status-pill ${channel.is_active ? 'active' : 'suspended'}`}>
                        <span className="dot"></span>
                        {channel.is_active ? t('farms.active') : t('farms.inactive')}
                    </span>
                </td>
                <td className="actions-cell" style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                            className="context-menu-btn"
                            title={t('notifications.btnLogs')}
                            onClick={() => handleOpenLogsModal({ kind: 'channel', channel })}
                        >
                            <History size={15} />
                        </button>
                        <button
                            className="context-menu-btn"
                            title={t('notifications.btnMembers')}
                            onClick={() => handleOpenMembersModal(channel)}
                        >
                            <Users size={15} />
                        </button>
                        <button
                            className="context-menu-btn"
                            title={t('notifications.btnTest')}
                            onClick={() => handleTestChannel(channel.id)}
                            disabled={testingId !== null}
                        >
                            {testingId === channel.id ? (
                                <Loader2 className="spinner" size={15} style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                                <Send size={14} />
                            )}
                        </button>
                        <button
                            className="context-menu-btn"
                            title={t('btn.edit')}
                            onClick={() => handleOpenChannelModal(channel)}
                        >
                            <Edit2 size={15} />
                        </button>
                        <button
                            className="context-menu-btn delete-btn"
                            title={t('btn.delete')}
                            style={{ color: 'var(--color-danger)' }}
                            onClick={() => handleDeleteChannel(channel)}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    if (forbidden) {
        return (
            <div className="notifications-container">
                <span className="notifications-breadcrumbs">{t('notifications.breadcrumbs')}</span>
                <div className="notifications-forbidden panel">
                    <Lock size={22} />
                    <p>{t('notifications.forbidden')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="notifications-container">
            <div>
                <span className="notifications-breadcrumbs">{t('notifications.breadcrumbs')}</span>
                <div className="notifications-header">
                    <h2>{activeTab === 'channels' ? t('notifications.channels') : t('notifications.templates')}</h2>
                    <div className="tab-buttons">
                        <button
                            className={`tab-btn ${activeTab === 'channels' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('channels'); setSearchTerm(''); }}
                        >
                            <Bell size={14} /> {t('notifications.channels')}
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('templates'); setSearchTerm(''); }}
                        >
                            <HelpCircle size={14} /> {t('notifications.templates')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="filter-bar">
                <div className="search-wrapper">
                    <Search className="search-icon" size={16} />
                    <input
                        className="search-input"
                        placeholder={activeTab === 'channels' ? t('notifications.searchChannels') : "Search name or type..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {activeTab === 'channels' && (
                    <select
                        className="group-filter-select"
                        value={groupFilter}
                        onChange={e => setGroupFilter(e.target.value)}
                        aria-label={t('notifications.groupFilterLabel')}
                    >
                        <option value="all">{t('notifications.groupAll')}</option>
                        <option value="system">{t('notifications.scopeSystem')}</option>
                        {farms.map(f => (
                            <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                        ))}
                    </select>
                )}
                <div style={{ marginLeft: 'auto' }}>
                    {activeTab === 'channels' ? (
                        <button className="primary" onClick={() => handleOpenChannelModal(null, createTarget())}>
                            <Plus size={14} /> {t('notifications.btnCreateChannel')}
                        </button>
                    ) : (
                        <button className="primary" onClick={() => handleOpenTemplateModal()}>
                            <Plus size={14} /> {t('notifications.btnCreateTemplate')}
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="loading-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '10px' }}>
                    <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Loading resources...</span>
                </div>
            ) : activeTab === 'channels' ? (
                <div className="notifications-table-panel">
                    <table className="notifications-table channels-table">
                        <thead>
                            <tr>
                                <th>{t('notifications.colCode')}</th>
                                <th>{t('notifications.colName')}</th>
                                <th>{t('notifications.colEventTypes')}</th>
                                <th>{t('notifications.colPing')}</th>
                                <th>{t('notifications.colTemplateLanguage')}</th>
                                <th>{t('notifications.colWebhook')}</th>
                                <th>{t('notifications.colActive')}</th>
                                <th style={{ width: '220px', minWidth: '220px', textAlign: 'right' }}>{t('notifications.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {channelGroups.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                                        No notification channels found.
                                    </td>
                                </tr>
                            ) : (
                                channelGroups.map(group => {
                                    const isEmpty = group.all.length === 0;
                                    const collapsed = isEmpty || !!collapsedGroups[group.key];
                                    const activeCount = group.all.filter(c => c.is_active).length;
                                    // Warnings use the farm catalog, as the backend's own guidance does.
                                    const issues = group.scope === 'farm' && !isEmpty ? routingIssues(group.all, farmTypeValues) : null;
                                    const title = group.scope === 'system'
                                        ? t('notifications.scopeSystem')
                                        : group.farm?.name || t('notifications.unknownFarm');
                                    return (
                                        <React.Fragment key={group.key}>
                                            <tr className="channel-group-row">
                                                <td colSpan={8}>
                                                    <div className="channel-group-head">
                                                        <button
                                                            type="button"
                                                            className="group-toggle"
                                                            onClick={() => toggleGroup(group.key)}
                                                            disabled={isEmpty}
                                                            aria-expanded={!collapsed}
                                                        >
                                                            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                            <span className={`scope-badge ${group.scope}`}>
                                                                {group.scope === 'system' ? 'SYSTEM' : group.farm?.code || '—'}
                                                            </span>
                                                            <span className="group-title">{title}</span>
                                                        </button>
                                                        <span className="group-count">
                                                            {isEmpty
                                                                ? t('notifications.groupEmpty')
                                                                : t('notifications.groupCount', { count: group.all.length, active: activeCount })}
                                                        </span>
                                                        {issues && issues.duplicated.length > 0 && (
                                                            <span
                                                                className="routing-chip warn"
                                                                title={issues.duplicated.map(d => `${typeLabel('farm', d.type)} → ${nameList(d.channels)}`).join('\n')}
                                                            >
                                                                <AlertTriangle size={11} /> {t('notifications.chipDuplicated', { count: issues.duplicated.length })}
                                                            </span>
                                                        )}
                                                        {issues && issues.uncovered.length > 0 && (
                                                            <span
                                                                className="routing-chip warn"
                                                                title={issues.uncovered.map(v => typeLabel('farm', v)).join('\n')}
                                                            >
                                                                <AlertTriangle size={11} /> {t('notifications.chipUncovered', { count: issues.uncovered.length })}
                                                            </span>
                                                        )}
                                                        <div className="group-actions">
                                                            {group.farm && !isEmpty && (
                                                                <button
                                                                    type="button"
                                                                    className="group-action-btn"
                                                                    onClick={() => handleOpenLogsModal({ kind: 'farm', farm: group.farm! })}
                                                                >
                                                                    <History size={13} /> {t('notifications.btnFarmLogs')}
                                                                </button>
                                                            )}
                                                            {(group.scope === 'system' || group.farm) && (
                                                                <button
                                                                    type="button"
                                                                    className="group-action-btn add"
                                                                    onClick={() => handleOpenChannelModal(null, { scope: group.scope, farmId: group.farmId })}
                                                                >
                                                                    <Plus size={13} /> {t('notifications.btnAddChannel')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                            {!collapsed && group.shown.map(channel => renderChannelRow(channel, group.farm))}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="notifications-table-panel">
                    <table className="notifications-table">
                        <thead>
                            <tr>
                                <th>{t('notifications.colTemplateName')}</th>
                                <th>{t('notifications.colTemplateType')}</th>
                                <th>{t('notifications.colTemplateLanguage')}</th>
                                <th>{t('notifications.colTemplateTitle')}</th>
                                <th>{t('notifications.colTemplateBody')}</th>
                                <th>{t('notifications.colActive')}</th>
                                <th style={{ width: '100px', minWidth: '100px', textAlign: 'right' }}>{t('notifications.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTemplates.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                                        No notification templates found.
                                    </td>
                                </tr>
                            ) : (
                                filteredTemplates.map(template => (
                                    <tr key={template.id}>
                                        <td style={{ fontWeight: 600 }}>{template.name}</td>
                                        <td>
                                            <span className="filter-tag event-type">{template.type}</span>
                                        </td>
                                        <td>
                                            <span className="locale-badge">{template.language}</span>
                                        </td>
                                        <td className="template-text">{template.title_template}</td>
                                        <td className="template-text truncate">{template.body_template}</td>
                                        <td>
                                            <span className={`status-pill ${template.is_active ? 'active' : 'suspended'}`}>
                                                <span className="dot"></span>
                                                {template.is_active ? t('farms.active') : t('farms.inactive')}
                                            </span>
                                        </td>
                                        <td className="actions-cell" style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button 
                                                    className="context-menu-btn" 
                                                    title={t('btn.edit')}
                                                    onClick={() => handleOpenTemplateModal(template)}
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                                <button 
                                                    className="context-menu-btn delete-btn" 
                                                    title={t('btn.delete')}
                                                    style={{ color: 'var(--color-danger)' }}
                                                    onClick={() => handleDeleteTemplate(template.id)}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create/Edit Channel Modal */}
            {isChannelModalOpen && (() => {
                const scopeTypes = eventTypeCatalog[channelForm.scope];
                const selectedFarm = farms.find(f => f.id === channelForm.farm_id) || null;
                const farmPrefix = selectedFarm ? `${selectedFarm.code.toLowerCase().replace(/\s+/g, '-')}-` : '';
                const specific = formEventTypes !== null;
                // Beside each type: where else it goes, or that it goes nowhere, once saved.
                const hintFor = (type: string): { level: 'warn' | 'muted'; text: string } | null => {
                    if (!isFarmForm) return null;
                    const others = projectedChannels.filter(c => c.id !== draftId && receivesType(c, type));
                    const mine = receivesType(draftChannel, type);
                    if (mine && others.length > 0) return { level: 'warn', text: t('notifications.hintAlsoTo', { list: nameList(others) }) };
                    if (!mine && others.length === 0) return { level: 'warn', text: t('notifications.hintNowhere') };
                    if (!mine) return { level: 'muted', text: `→ ${nameList(others)}` };
                    return null;
                };
                return (
                <div className="modal-overlay">
                    <div className="modal-content notifications-modal panel">
                        <h3>{editingChannel ? t('notifications.modalEditTitle') : t('notifications.modalCreateTitle')}</h3>
                        <form onSubmit={handleSaveChannel}>
                            <div className="modal-form-body">
                                {/* Scope and farm decide everything below, so they come first. Locked
                                    once created: PATCH does not validate them (an unknown farm_id is a 500). */}
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('notifications.fieldScope')} {editingChannel && <Lock size={11} />}</label>
                                        <select
                                            value={channelForm.scope}
                                            disabled={!!editingChannel}
                                            onChange={e => {
                                                const newScope = e.target.value as Scope;
                                                setChannelForm({
                                                    ...channelForm,
                                                    scope: newScope,
                                                    farm_id: newScope === 'system' ? null : channelForm.farm_id,
                                                    event_types: null
                                                });
                                            }}
                                        >
                                            <option value="system">{t('notifications.scopeOptionSystem')}</option>
                                            <option value="farm">{t('notifications.scopeOptionFarm')}</option>
                                        </select>
                                    </div>
                                    {channelForm.scope === 'farm' && (
                                        <div className="form-group">
                                            <label>{t('notifications.fieldFarm')} {editingChannel && <Lock size={11} />}</label>
                                            <select
                                                required
                                                disabled={!!editingChannel}
                                                value={channelForm.farm_id || ''}
                                                onChange={e => setChannelForm({ ...channelForm, farm_id: e.target.value || null })}
                                            >
                                                <option value="" disabled>{t('notifications.selectFarm')}</option>
                                                {farms.map(f => (
                                                    <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                {editingChannel && (
                                    <span className="help-text locked-note">{t('notifications.lockedAfterCreate')}</span>
                                )}

                                {!editingChannel && isFarmForm && (
                                    <div className="form-group">
                                        <label>{t('notifications.presetsLabel')}</label>
                                        {/* Same two-column grid as Code / Name below, so the chips line up with them. */}
                                        <div className="preset-chips">
                                            {FARM_CHANNEL_PRESETS.map(preset => (
                                                <button
                                                    key={preset.purpose}
                                                    type="button"
                                                    className="preset-chip"
                                                    onClick={() => applyFarmPreset(preset)}
                                                >
                                                    <strong>{farmPrefix}{preset.purpose}</strong>
                                                    <span>{t(`notifications.preset_${preset.purpose}`)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('notifications.fieldCode')}</label>
                                        <input
                                            type="text"
                                            required
                                            maxLength={NOTIFICATION_CHANNEL_CODE_MAX_LENGTH}
                                            placeholder={`${farmPrefix || 'system-'}alerts`}
                                            value={channelForm.code}
                                            className={codeTaken ? 'input-error' : undefined}
                                            onChange={e => setChannelForm({ ...channelForm, code: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                        />
                                        {codeTaken ? (
                                            <span className="help-text error-text">{t('notifications.codeTaken', { code: channelForm.code.trim() })}</span>
                                        ) : (
                                            <span className="help-text">{t('notifications.codeHelp')}</span>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label>{t('notifications.fieldName')}</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder={`#${farmPrefix || 'system-'}alerts`}
                                            value={channelForm.name}
                                            onChange={e => setChannelForm({ ...channelForm, name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>{t('notifications.fieldWebhook')}</label>
                                    <input
                                        type="url"
                                        required
                                        placeholder="https://discord.com/api/webhooks/..."
                                        value={channelForm.webhook_url}
                                        onChange={e => setChannelForm({ ...channelForm, webhook_url: e.target.value })}
                                    />
                                </div>

                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('notifications.fieldMentionRole')}</label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="\d+"
                                            title={t('notifications.mentionRoleFormat')}
                                            placeholder="123456789012345678"
                                            value={channelForm.mention_role_id || ''}
                                            onChange={e => setChannelForm({ ...channelForm, mention_role_id: e.target.value.trim() })}
                                        />
                                        <span className="help-text">{t('notifications.mentionRoleHelp')}</span>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('notifications.fieldLanguage')}</label>
                                        <select
                                            value={channelForm.language || ''}
                                            onChange={e => setChannelForm({ ...channelForm, language: e.target.value || null })}
                                        >
                                            <option value="">
                                                {t('notifications.languageInherit', { lang: selectedFarm?.default_language || 'en' })}
                                            </option>
                                            <option value="en">English (en)</option>
                                            <option value="vi">Vietnamese (vi)</option>
                                            <option value="ko">Korean (ko)</option>
                                        </select>
                                        <span className="help-text">{t('notifications.languageHelp')}</span>
                                    </div>
                                </div>

                                <div className="toggle-switch-wrapper">
                                    <label className="toggle-switch">
                                        <input
                                            id="channel-is-active"
                                            type="checkbox"
                                            checked={channelForm.is_active}
                                            onChange={e => setChannelForm({ ...channelForm, is_active: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <span className="toggle-switch-label" onClick={() => setChannelForm({ ...channelForm, is_active: !channelForm.is_active })}>
                                        {t('notifications.fieldActive')}
                                    </span>
                                    <span className="help-text">{t('notifications.activeHelp')}</span>
                                </div>

                                <div className="routing-filters-section">
                                    <span className="section-title">
                                        {t('notifications.fieldEventTypes')}
                                        <HelpTip label={t('notifications.fieldEventTypes')}>
                                            {t('notifications.eventTypesHelp')}
                                        </HelpTip>
                                    </span>

                                    {/* null and [] are different settings, so "all" is its own choice rather
                                        than "every box ticked": null also takes types added later. */}
                                    <div className="event-mode-options">
                                        <label className="event-mode-option">
                                            <input
                                                type="radio"
                                                name="event-mode"
                                                checked={!specific}
                                                onChange={() => setChannelForm(prev => ({ ...prev, event_types: null }))}
                                            />
                                            {t('notifications.eventTypesAll')}
                                        </label>
                                        <label className="event-mode-option">
                                            <input
                                                type="radio"
                                                name="event-mode"
                                                checked={specific}
                                                // Start from every current type ticked, so switching alone changes no routing.
                                                onChange={() => setChannelForm(prev => ({ ...prev, event_types: scopeTypes.map(x => x.value) }))}
                                            />
                                            {t('notifications.eventTypesSpecific')}
                                        </label>
                                    </div>

                                    <div className="filter-group">
                                        {loadingEventTypes ? (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)', padding: '10px 0' }}>
                                                <Loader2 className="spinner" size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                <span>{t('notifications.loadingEventTypes')}</span>
                                            </div>
                                        ) : scopeTypes.length === 0 ? (
                                            <span className="help-text" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('notifications.noEventTypes')}</span>
                                        ) : (
                                            <div className={`checkbox-grid event-type-list ${specific ? '' : 'all-mode'}`}>
                                                {scopeTypes.map(evt => {
                                                    const hint = hintFor(evt.value);
                                                    return (
                                                        <div key={evt.value} className="checkbox-item event-type-item">
                                                            <input
                                                                type="checkbox"
                                                                id={`evt-${evt.value}`}
                                                                disabled={!specific}
                                                                checked={!specific || formEventTypes!.includes(evt.value)}
                                                                onChange={e => {
                                                                    const checked = e.target.checked;
                                                                    setChannelForm(prev => {
                                                                        const current = prev.event_types ?? [];
                                                                        return {
                                                                            ...prev,
                                                                            event_types: checked
                                                                                ? [...current.filter(x => x !== evt.value), evt.value]
                                                                                : current.filter(x => x !== evt.value)
                                                                        };
                                                                    });
                                                                }}
                                                            />
                                                            <label htmlFor={`evt-${evt.value}`}>{evt.label}</label>
                                                            {hint && (
                                                                <span className={`routing-hint ${hint.level}`}>
                                                                    {hint.level === 'warn' && <AlertTriangle size={11} />} {hint.text}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {specific && formEventTypes!.length === 0 && (
                                            <span className="help-text warn-text">{t('notifications.eventTypesNone')}</span>
                                        )}
                                    </div>

                                    {canNarrow && (
                                        <div className="narrow-notice">
                                            <div className="narrow-notice-head">
                                                <AlertTriangle size={14} />
                                                <strong>{t('notifications.narrowTitle', { list: nameList(allTypesSiblings) })}</strong>
                                            </div>
                                            <p>{t('notifications.narrowDesc')}</p>
                                            <label className="narrow-notice-check">
                                                <input
                                                    type="checkbox"
                                                    checked={narrowAllTypesSiblings}
                                                    onChange={e => setNarrowAllTypesSiblings(e.target.checked)}
                                                />
                                                <span>
                                                    {t('notifications.narrowCheckbox', { list: nameList(allTypesSiblings), count: narrowedTypes.length })}
                                                    <span className="narrow-types">{narrowedTypes.map(v => typeLabel('farm', v)).join(', ')}</span>
                                                </span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="cancel-btn"
                                    onClick={() => setIsChannelModalOpen(false)}
                                    disabled={saving}
                                >
                                    {t('btn.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="submit-btn primary"
                                    disabled={saving || codeTaken}
                                >
                                    {saving ? t('notifications.saving') : t('notifications.btnSaveChannel')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                );
            })()}

            {/* Manage Channel Members Modal */}
            {isMemberModalOpen && selectedChannelForMembers && (
                <div className="modal-overlay">
                    <div className="modal-content notifications-modal panel">
                        <h3>Manage Members for {selectedChannelForMembers.name}</h3>
                        <p className="modal-subtitle" style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Users mapped to this channel will receive alerts (depending on their farm membership).
                        </p>

                        <div className="modal-form-body">
                            {/* Loading members */}
                            {loadingMembers ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                                    <Loader2 className="spinner" size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
                                    {channelMembers.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '15px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                                            No members assigned to this channel.
                                        </div>
                                    ) : (
                                        channelMembers.map(member => {
                                            const details = getMemberDetail(member);
                                            return (
                                                <div 
                                                    key={details.id}
                                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-color)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{details.username}</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{details.email}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: '4px' }}
                                                        onClick={() => handleRemoveMember(details.id)}
                                                    >
                                                        Revoke
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {/* Add member form */}
                            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600 }}>Assign User to Channel</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select
                                        style={{ flex: 1, padding: '8px' }}
                                        value={selectedUserIdToAdd}
                                        onChange={e => setSelectedUserIdToAdd(e.target.value)}
                                    >
                                        <option value="">-- Choose User --</option>
                                        {users
                                            // Filter out users already in channelMembers
                                            .filter(u => !channelMembers.some(m => (m.user_id === u.id || m.id === u.id)))
                                            .map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.username || 'No Username'} ({u.email})
                                                </option>
                                            ))
                                        }
                                    </select>
                                    <button
                                        type="button"
                                        className="primary"
                                        style={{ height: '38px', padding: '0 16px' }}
                                        onClick={handleAddMember}
                                        disabled={!selectedUserIdToAdd || saving}
                                    >
                                        {saving ? 'Adding...' : 'Add'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions" style={{ marginTop: '24px' }}>
                            <button 
                                type="button" 
                                className="cancel-btn" 
                                style={{ width: '100%' }}
                                onClick={() => setIsMemberModalOpen(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Template Modal */}
            {isTemplateModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content notifications-modal panel">
                        <h3>{editingTemplate ? 'Edit Message Template' : 'Create Message Template'}</h3>
                        <form onSubmit={handleSaveTemplate}>
                            <div className="modal-form-body">
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>Event Type *</label>
                                        <select 
                                            value={templateForm.type}
                                            onChange={async e => {
                                                const newType = e.target.value;
                                                setTemplateForm(prev => ({ ...prev, type: newType }));
                                                await fetchAndSetTemplateVars(newType, !editingTemplate);
                                            }}
                                        >
                                            {eventTypeOptions.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Language *</label>
                                        <select 
                                            value={templateForm.language}
                                            onChange={e => setTemplateForm({ ...templateForm, language: e.target.value })}
                                        >
                                            <option value="en">English (en)</option>
                                            <option value="vi">Vietnamese (vi)</option>
                                            <option value="ko">Korean (ko)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Template Title / Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="e.g. Farm offline (VI)"
                                        value={templateForm.name}
                                        onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Message Title Template *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="e.g. 🔴 Farm mất kết nối: {farm_code}"
                                        value={templateForm.title_template}
                                        onChange={e => setTemplateForm({ ...templateForm, title_template: e.target.value })}
                                        onFocus={() => setLastFocusedField('title')}
                                        ref={titleRef}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Message Body Template *</label>
                                    <textarea 
                                        required 
                                        rows={4}
                                        placeholder="e.g. Farm {farm_name} không gửi telemetry {minutes} phút."
                                        value={templateForm.body_template}
                                        onChange={e => setTemplateForm({ ...templateForm, body_template: e.target.value })}
                                        onFocus={() => setLastFocusedField('body')}
                                        ref={bodyRef}
                                    />
                                </div>

                                {templateVarsInfo && (
                                    <div className="template-variables-section" style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-color)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                        <h4 style={{ fontSize: '13px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-color)' }}>
                                            <HelpCircle size={14} /> Available Variables
                                        </h4>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                                            Click on a variable to insert it into the <strong>{lastFocusedField === 'title' ? 'Title' : 'Body'}</strong>.
                                        </p>
                                        
                                        {loadingVars ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                <Loader2 size={14} className="spinner" style={{ animation: 'spin 1s linear infinite' }} /> Loading variables...
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {templateVarsInfo.common && templateVarsInfo.common.length > 0 && (
                                                    <div>
                                                        <strong style={{ fontSize: '12px', color: 'var(--text-color)' }}>Common Variables</strong>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                                            {templateVarsInfo.common.map((v: any) => (
                                                                <button
                                                                    key={v.name}
                                                                    type="button"
                                                                    className="variable-btn"
                                                                    title={v.description + (v.example ? ` (e.g. ${v.example})` : '')}
                                                                    onClick={() => handleInsertVariable(v.name)}
                                                                    style={{
                                                                        background: 'var(--background-modifier-hover)',
                                                                        border: '1px solid var(--border)',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        fontFamily: 'monospace',
                                                                        cursor: 'pointer',
                                                                        color: 'var(--text-color)'
                                                                    }}
                                                                >
                                                                    {`{${v.name}}`}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {templateVarsInfo.types && templateVarsInfo.types.length > 0 && templateVarsInfo.types[0].variables && templateVarsInfo.types[0].variables.length > 0 && (
                                                    <div>
                                                        <strong style={{ fontSize: '12px', color: 'var(--text-color)' }}>{templateVarsInfo.types[0].label || 'Event'} Variables</strong>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                                            {templateVarsInfo.types[0].variables.map((v: any) => (
                                                                <button
                                                                    key={v.name}
                                                                    type="button"
                                                                    className="variable-btn"
                                                                    title={v.description + (v.example ? ` (e.g. ${v.example})` : '')}
                                                                    onClick={() => handleInsertVariable(v.name)}
                                                                    style={{
                                                                        background: 'var(--background-modifier-hover)',
                                                                        border: '1px dashed var(--color-primary)',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        fontFamily: 'monospace',
                                                                        cursor: 'pointer',
                                                                        color: 'var(--color-primary)'
                                                                    }}
                                                                >
                                                                    {`{${v.name}}`}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="toggle-switch-wrapper">
                                    <label className="toggle-switch">
                                        <input 
                                            id="template-is-active"
                                            type="checkbox" 
                                            checked={templateForm.is_active}
                                            onChange={e => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <span className="toggle-switch-label" onClick={() => setTemplateForm({ ...templateForm, is_active: !templateForm.is_active })}>
                                        Template is Active
                                    </span>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    className="cancel-btn" 
                                    onClick={() => setIsTemplateModalOpen(false)}
                                    disabled={saving}
                                >
                                    {t('btn.cancel')}
                                </button>
                                <button 
                                    type="submit" 
                                    className="submit-btn primary" 
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Notification Logs History Modal */}
            {logsTarget && (
                <div className="modal-overlay" onClick={() => setLogsTarget(null)}>
                    <div className="history-modal panel logs-history-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            {logsTarget.kind === 'channel' ? (
                                <div>
                                    <div className="modal-title-row">
                                        <h3>{t('notifications.logsTitle', { name: logsTarget.channel.name })}</h3>
                                        <span className={`status-pill ${logsTarget.channel.is_active ? 'active' : 'suspended'}`}>
                                            <span className="dot"></span>
                                            {logsTarget.channel.is_active ? t('farms.active') : t('farms.inactive')}
                                        </span>
                                        <span className="locale-badge">{logsTarget.channel.language || 'default'}</span>
                                        <span className="scope-badge system" style={{ textTransform: 'uppercase', fontSize: '10px', padding: '2px 8px' }}>
                                            {logsTarget.channel.scope}
                                        </span>
                                    </div>
                                    <p className="modal-desc">Code: <code>{logsTarget.channel.code}</code></p>
                                </div>
                            ) : (
                                <div>
                                    <div className="modal-title-row">
                                        <h3>{t('notifications.farmLogsTitle', { name: logsTarget.farm.name })}</h3>
                                        <span className="scope-badge farm">{logsTarget.farm.code}</span>
                                    </div>
                                    <p className="modal-desc">{t('notifications.farmLogsDesc')}</p>
                                </div>
                            )}
                            <button className="close-btn" onClick={() => setLogsTarget(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {loadingLogs ? (
                                <div className="modal-loading">
                                    <Loader2 className="spinner" size={28} style={{ animation: 'spin 1s linear infinite' }} />
                                    <span>{t('notifications.loadingLogs')}</span>
                                </div>
                            ) : (
                                <div className="modal-layout logs-modal-layout">
                                    {/* Left Panel: Statistics & Filters */}
                                    <div className="modal-left-panel">
                                        {/* Stats Cards */}
                                        {(() => {
                                            const totalCount = logs.length;
                                            const successCount = logs.filter(l => l.status === 'sent').length;
                                            const failureCount = logs.filter(l => l.status === 'failed').length;
                                            // Over delivery attempts only: skipped rows (no channel matched) and
                                            // pending ones were never tried, so they do not count against the rate.
                                            const attempts = successCount + failureCount;
                                            const successPct = attempts > 0 ? Math.round((successCount / attempts) * 100) : 100;

                                            return (
                                                <div className="stats-grid">
                                                    <div className="stat-card">
                                                        <div className="stat-icon rate">
                                                            <Activity size={18} />
                                                        </div>
                                                        <div className="stat-info">
                                                            <span className="stat-label">{t('notifications.logsTotal')}</span>
                                                            <span className="stat-value">{totalCount}</span>
                                                        </div>
                                                    </div>

                                                    <div className="stat-card">
                                                        <div className="stat-icon runs">
                                                            <CheckCircle size={18} />
                                                        </div>
                                                        <div className="stat-info">
                                                            <span className="stat-label">{t('notifications.deliveryRate')}</span>
                                                            <span className="stat-value">{successPct}%</span>
                                                        </div>
                                                    </div>

                                                    <div className="stat-card" style={{ borderLeft: failureCount > 0 ? '3px solid var(--color-danger)' : undefined }}>
                                                        <div className="stat-icon source" style={{ color: failureCount > 0 ? 'var(--color-danger)' : undefined, background: failureCount > 0 ? 'rgba(239, 68, 68, 0.1)' : undefined }}>
                                                            <AlertTriangle size={18} />
                                                        </div>
                                                        <div className="stat-info">
                                                            <span className="stat-label">{t('notifications.deliveryFailures')}</span>
                                                            <span className="stat-value" style={{ color: failureCount > 0 ? 'var(--color-danger)' : undefined }}>{failureCount}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Chart section */}
                                        {(() => {
                                            const chartData = getLogs7dData();
                                            const maxVal = Math.max(...chartData, 1);
                                            const height = 120;
                                            const width = 312;
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
                                                    <h4 className="chart-header">{t('notifications.chartTitle')}</h4>
                                                    <div className="chart-wrapper">
                                                        <svg viewBox={`0 0 ${width} ${height}`} className="history-svg-chart">
                                                            <defs>
                                                                <linearGradient id="logsChartGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                                                                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                                                                </linearGradient>
                                                            </defs>
                                                            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--border-input)" strokeDasharray="3,3" />
                                                            <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--border-input)" strokeDasharray="3,3" />
                                                            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-input)" />

                                                            {areaD && <path d={areaD} fill="url(#logsChartGrad)" />}
                                                            {pathD && <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

                                                            {points.map((p, idx) => (
                                                                <g key={idx} className="chart-dot-group">
                                                                    <circle cx={p.x} cy={p.y} r="3" fill="var(--panel-bg)" stroke="var(--primary)" strokeWidth="2" />
                                                                    <title>{`${7 - idx} days ago: ${p.val} alerts`}</title>
                                                                </g>
                                                            ))}
                                                        </svg>
                                                        <div className="chart-x-labels">
                                                            <span>7d ago</span>
                                                            <span>4d ago</span>
                                                            <span>Today</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Filter Section */}
                                        <div className="logs-filters-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Filters
                                            </span>
                                            
                                            <div className="search-wrapper" style={{ width: '100%' }}>
                                                <Search className="search-icon" size={14} />
                                                <input
                                                    className="search-input"
                                                    style={{ height: '34px', fontSize: '12px' }}
                                                    placeholder={t('notifications.searchPlaceholder')}
                                                    value={logSearchTerm}
                                                    onChange={(e) => setLogSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '10px' }}>Status</label>
                                                    <select
                                                        style={{ height: '34px', padding: '0 8px', fontSize: '12px' }}
                                                        value={logStatusFilter}
                                                        onChange={(e) => setLogStatusFilter(e.target.value)}
                                                    >
                                                        <option value="all">All Statuses</option>
                                                        <option value="sent">Sent</option>
                                                        <option value="pending">Pending</option>
                                                        <option value="failed">Failed</option>
                                                        <option value="skipped">Skipped</option>
                                                    </select>
                                                </div>

                                                <div className="form-group">
                                                    <label style={{ fontSize: '10px' }}>Severity</label>
                                                    <select
                                                        style={{ height: '34px', padding: '0 8px', fontSize: '12px' }}
                                                        value={logSeverityFilter}
                                                        onChange={(e) => setLogSeverityFilter(e.target.value)}
                                                    >
                                                        <option value="all">All Severities</option>
                                                        <option value="info">Info</option>
                                                        <option value="warning">Warning</option>
                                                        <option value="critical">Critical</option>
                                                        <option value="report">Report</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label style={{ fontSize: '10px' }}>Event Type</label>
                                                <select
                                                    style={{ height: '34px', padding: '0 8px', fontSize: '12px' }}
                                                    value={logTypeFilter}
                                                    onChange={(e) => setLogTypeFilter(e.target.value)}
                                                >
                                                    <option value="all">All Types</option>
                                                    {Array.from(new Set(logs.map(l => l.type))).map(type => (
                                                        <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* No channel_id filter on the API yet, so this one is client-side. */}
                                            {logsTarget.kind === 'farm' && (
                                                <div className="form-group">
                                                    <label style={{ fontSize: '10px' }}>{t('notifications.logChannel')}</label>
                                                    <select
                                                        style={{ height: '34px', padding: '0 8px', fontSize: '12px' }}
                                                        value={logChannelFilter}
                                                        onChange={(e) => setLogChannelFilter(e.target.value)}
                                                    >
                                                        <option value="all">{t('notifications.logChannelAll')}</option>
                                                        {channelsOfFarm(logsTarget.farm.id).map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                        <option value="none">{t('notifications.logChannelNone')}</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Panel: Scrollable timeline */}
                                    <div className="modal-right-panel">
                                        <h4 className="timeline-section-title">{t('notifications.timelineTitle')}</h4>
                                        {logsTruncated && (
                                            <p className="logs-truncated-note">{t('notifications.logsTruncated', { count: LOGS_FETCH_LIMIT })}</p>
                                        )}
                                        {(() => {
                                            const filtered = getFilteredLogs();
                                            if (filtered.length === 0) {
                                                return (
                                                    <div className="drawer-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                        {t('notifications.noLogs')}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="history-timeline-scroll">
                                                    <div className="history-timeline">
                                                        {filtered.map(log => {
                                                            const isSuccess = log.status === 'sent';
                                                            const isFailed = log.status === 'failed';
                                                            const isPending = log.status === 'pending';
                                                            const logDate = new Date(log.created_at);
                                                            const relativeTime = getRelativeTimeString(logDate);
                                                            const absoluteTime = logDate.toLocaleString();
                                                            const isExpanded = expandedLogId === log.id;

                                                            let timelineClass = 'skipped';
                                                            if (isSuccess) timelineClass = 'success';
                                                            else if (isFailed) timelineClass = 'failed';
                                                            else if (isPending) timelineClass = 'pending';

                                                            return (
                                                                <div 
                                                                    key={log.id}
                                                                    className={`timeline-item ${timelineClass}`}
                                                                >
                                                                    <div className="timeline-badge">
                                                                        <span className="dot"></span>
                                                                    </div>
                                                                    <div className="timeline-content logs-timeline-content" style={{ cursor: 'pointer' }} onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                                                                        <div className="timeline-header">
                                                                            <div className="timeline-time-info" style={{ gap: '6px' }}>
                                                                                <span className="timestamp" style={{ fontSize: '13px' }}>{log.title || 'Untitled Notification'}</span>
                                                                                <span className="source-tag" style={{ background: '#ecfdf5', color: '#10b981', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600 }}>{log.type.replace(/_/g, ' ')}</span>
                                                                                <span className={`filter-tag severity ${log.severity}`} style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', textTransform: 'capitalize' }}>{log.severity}</span>
                                                                                {logsTarget.kind === 'farm' && (
                                                                                    <span className="log-channel-tag" title={t('notifications.logChannel')}>{logChannelLabel(log.channel_id)}</span>
                                                                                )}
                                                                            </div>
                                                                            <span className={`status-tag ${log.status}`} style={{ fontSize: '9px' }}>
                                                                                {log.status.toUpperCase()}
                                                                            </span>
                                                                        </div>
                                                                        
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={absoluteTime}>
                                                                                {relativeTime} · {absoluteTime}
                                                                            </span>
                                                                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 500 }}>
                                                                                {isExpanded ? 'Collapse' : 'Expand'}
                                                                            </span>
                                                                        </div>

                                                                        {isExpanded && (
                                                                            <div className="log-expanded-details" style={{ marginTop: '12px', borderTop: '1px dashed var(--border)', paddingTop: '12px', animation: 'fadeIn 0.2s ease-out' }} onClick={(e) => e.stopPropagation()}>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    <div className="log-message-body" style={{ background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px', fontSize: '12px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                                                                        {log.body}
                                                                                    </div>
                                                                                    {log.error_message && (
                                                                                        <div className="error-message" style={{ margin: 0, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', color: 'var(--color-danger)', fontSize: '11px' }}>
                                                                                            <strong>Error:</strong> {log.error_message}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
