import React, { useEffect, useState, useRef } from 'react';
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
    AlertTriangle
} from 'lucide-react';
import { notificationsApi, farmsApi, usersApi } from '../../api/services';
import { Farm, UserResponse, NotificationChannel, NotificationTemplate, NotificationLog } from '../../types';
import './NotificationsManager.css';

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

    // Search and filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [scopeFilter, setScopeFilter] = useState<'all' | 'system' | 'farm'>('all');

    // --- Channel Modals & States ---
    const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
    const [channelForm, setChannelForm] = useState<Omit<NotificationChannel, 'id'>>({
        code: '',
        name: '',
        webhook_url: '',
        mention_role_id: '',
        scope: 'system',
        farm_id: null,
        language: null,
        event_types: null,
        is_active: true
    });
    const [revealedWebhooks, setRevealedWebhooks] = useState<Record<string, boolean>>({});
    const [availableEventTypes, setAvailableEventTypes] = useState<{ value: string; label: string }[]>([]);
    const [loadingEventTypes, setLoadingEventTypes] = useState(false);

    const fetchAndSetEventTypes = async (scope: 'system' | 'farm') => {
        setLoadingEventTypes(true);
        try {
            const responseData = await notificationsApi.getEventTypes(scope);
            const types = responseData && responseData[scope] ? responseData[scope] : [];
            setAvailableEventTypes(types);
        } catch (error) {
            console.error('Failed to fetch event types for scope:', scope, error);
            setAvailableEventTypes([]);
        } finally {
            setLoadingEventTypes(false);
        }
    };

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
    const [selectedChannelForLogs, setSelectedChannelForLogs] = useState<NotificationChannel | null>(null);
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logSearchTerm, setLogSearchTerm] = useState('');
    const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
    const [logSeverityFilter, setLogSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
    const [logTypeFilter, setLogTypeFilter] = useState('all');
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
        } catch (error) {
            console.error('Failed to load notifications management data', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Channel CRUD handlers ---
    const handleOpenChannelModal = async (channel: NotificationChannel | null = null) => {
        const scope = channel ? channel.scope : 'system';
        setIsChannelModalOpen(true);
        await fetchAndSetEventTypes(scope);

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
                event_types: channel.event_types || null,
                is_active: channel.is_active
            });
        } else {
            setEditingChannel(null);
            setChannelForm({
                code: '',
                name: '',
                webhook_url: '',
                mention_role_id: '',
                scope: 'system',
                farm_id: null,
                language: null,
                event_types: null,
                is_active: true
            });
        }
    };

    const handleSaveChannel = async (e: React.FormEvent) => {
        e.preventDefault();

        if (channelForm.scope === 'farm' && !channelForm.farm_id) {
            alert('Farm association is required for farm-scoped channels.');
            return;
        }

        setSaving(true);
        try {
            const payload: any = {
                code: channelForm.code.trim(),
                name: channelForm.name.trim(),
                webhook_url: channelForm.webhook_url.trim(),
                mention_role_id: channelForm.mention_role_id?.trim() || null,
                scope: channelForm.scope,
                language: channelForm.language || null,
                event_types: channelForm.event_types,
                is_active: channelForm.is_active
            };

            if (channelForm.scope === 'farm') {
                payload.farm_id = channelForm.farm_id;
            }

            if (editingChannel) {
                await notificationsApi.updateChannel(editingChannel.id, payload);
                alert(t('notifications.updateSuccess'));
            } else {
                await notificationsApi.createChannel(payload);
                alert(t('notifications.createSuccess'));
            }
            setIsChannelModalOpen(false);
            loadData();
        } catch (err: any) {
            alert(t(editingChannel ? 'notifications.updateFailed' : 'notifications.createFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteChannel = async (id: string) => {
        if (!window.confirm(t('notifications.deleteConfirm'))) return;
        try {
            await notificationsApi.deleteChannel(id);
            alert(t('notifications.deleteSuccess'));
            loadData();
        } catch (err: any) {
            alert(t('notifications.deleteFailed', { error: err?.message || 'Unknown error' }));
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
        } catch (err: any) {
            alert(t('notifications.testFailed', { error: err?.message || 'Unknown error' }));
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

    const handleOpenLogsModal = async (channel: NotificationChannel) => {
        setSelectedChannelForLogs(channel);
        setLogs([]);
        setLoadingLogs(true);
        setLogSearchTerm('');
        setLogStatusFilter('all');
        setLogSeverityFilter('all');
        setLogTypeFilter('all');
        setExpandedLogId(null);

        try {
            const params: any = {
                scope: channel.scope,
                limit: 100
            };
            if (channel.scope === 'farm' && channel.farm_id) {
                params.farm_id = channel.farm_id;
            }

            const response = await notificationsApi.getLogs(params);
            const rawLogs = Array.isArray(response) ? response : (response?.items || response?.logs || []);
            
            const filteredLogs = rawLogs.filter((log: NotificationLog) => {
                if (log.channel_id) {
                    return log.channel_id === channel.id;
                }
                if (channel.event_types && channel.event_types.length > 0) {
                    return channel.event_types.includes(log.type);
                }
                return true;
            });

            setLogs(filteredLogs);
        } catch (err) {
            console.error('Failed to load notification logs', err);
        } finally {
            setLoadingLogs(false);
        }
    };

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

    // Filter Logic
    const filteredChannels = channels.filter(channel => {
        const matchesSearch = 
            channel.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            channel.code.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!matchesSearch) return false;

        if (scopeFilter === 'all') return true;
        return channel.scope === scopeFilter;
    });

    const filteredTemplates = templates.filter(template => {
        return (
            template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            template.type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const getFarmName = (farmId: string | null | undefined) => {
        if (!farmId) return t('notifications.scopeFarmGlobal');
        return farms.find(f => f.id === farmId)?.name || 'Unknown Farm';
    };

    const getLogs7dData = () => {
        const result = Array(7).fill(0);
        const now = new Date();
        logs.forEach(log => {
            const logDate = new Date(log.created_at || log.sent_at || '');
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
                        placeholder={activeTab === 'channels' ? "Search code or name..." : "Search name or type..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {activeTab === 'channels' && (
                    <div className="scope-filters">
                        <button 
                            className={`filter-pill ${scopeFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setScopeFilter('all')}
                        >
                            All Scopes
                        </button>
                        <button 
                            className={`filter-pill ${scopeFilter === 'system' ? 'active' : ''}`}
                            onClick={() => setScopeFilter('system')}
                        >
                            System-wide
                        </button>
                        <button 
                            className={`filter-pill ${scopeFilter === 'farm' ? 'active' : ''}`}
                            onClick={() => setScopeFilter('farm')}
                        >
                            Farm-scoped
                        </button>
                    </div>
                )}
                <div style={{ marginLeft: 'auto' }}>
                    {activeTab === 'channels' ? (
                        <button className="primary" onClick={() => handleOpenChannelModal()}>
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
                    <table className="notifications-table">
                        <thead>
                            <tr>
                                <th>{t('notifications.colCode')}</th>
                                <th>{t('notifications.colName')}</th>
                                <th>{t('notifications.colScope')}</th>
                                <th>{t('notifications.colWebhook')}</th>
                                <th>{t('notifications.colFilters')}</th>
                                <th>{t('notifications.colActive')}</th>
                                <th style={{ width: '220px', minWidth: '220px', textAlign: 'right' }}>{t('notifications.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredChannels.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                                        No notification channels found.
                                    </td>
                                </tr>
                            ) : (
                                filteredChannels.map(channel => {
                                    const isRevealed = revealedWebhooks[channel.id];
                                    return (
                                        <tr key={channel.id}>
                                            <td className="code-cell">{channel.code}</td>
                                            <td className="name-cell">{channel.name}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span className={`scope-badge ${channel.scope}`}>
                                                        {channel.scope === 'system' 
                                                            ? t('notifications.scopeSystem') 
                                                            : getFarmName(channel.farm_id)
                                                        }
                                                    </span>
                                                    <span className="locale-badge" style={{ textTransform: 'uppercase', padding: '2px 6px', fontSize: '10px' }}>
                                                        {channel.language || 'default'}
                                                    </span>
                                                </div>
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
                                                <div className="filters-cell">
                                                    {channel.event_types === null || channel.event_types === undefined ? (
                                                        <span className="empty-filter">All event types</span>
                                                    ) : channel.event_types.length === 0 ? (
                                                        <span className="filter-tag severity" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>Muted</span>
                                                    ) : (
                                                        channel.event_types.map(evt => (
                                                            <span key={evt} className="filter-tag event-type">{evt.replace(/_/g, ' ')}</span>
                                                        ))
                                                    )}
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
                                                        onClick={() => handleOpenLogsModal(channel)}
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
                                                        onClick={() => handleDeleteChannel(channel.id)}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
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
            {isChannelModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content notifications-modal panel">
                        <h3>{editingChannel ? 'Edit Notification Channel' : 'Create Notification Channel'}</h3>
                        <form onSubmit={handleSaveChannel}>
                            <div className="modal-form-body">
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>Channel Code *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="alert-critical"
                                            value={channelForm.code}
                                            onChange={e => setChannelForm({ ...channelForm, code: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Display Name *</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="#alert-critical"
                                            value={channelForm.name}
                                            onChange={e => setChannelForm({ ...channelForm, name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Discord Webhook URL *</label>
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
                                        <label>Discord Mention Role ID (Optional)</label>
                                        <input 
                                            type="text" 
                                            placeholder="123456789012345678"
                                            value={channelForm.mention_role_id || ''}
                                            onChange={e => setChannelForm({ ...channelForm, mention_role_id: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Routing Scope</label>
                                        <select 
                                            value={channelForm.scope}
                                            onChange={async e => {
                                                const newScope = e.target.value as 'system' | 'farm';
                                                setChannelForm({ 
                                                    ...channelForm, 
                                                    scope: newScope,
                                                    farm_id: newScope === 'system' ? null : channelForm.farm_id,
                                                    event_types: null
                                                });
                                                await fetchAndSetEventTypes(newScope);
                                            }}
                                        >
                                            <option value="system">System (Super Admin alerts)</option>
                                            <option value="farm">Farm (Specific farm alerts)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Language Override</label>
                                    <select 
                                        value={channelForm.language || ''}
                                        onChange={e => setChannelForm({ ...channelForm, language: e.target.value || null })}
                                    >
                                        <option value="">-- Use Default / Farm Lang --</option>
                                        <option value="en">English (en)</option>
                                        <option value="vi">Vietnamese (vi)</option>
                                        <option value="ko">Korean (ko)</option>
                                    </select>
                                </div>

                                {channelForm.scope === 'farm' && (
                                    <div className="form-group">
                                        <label>Farm Association *</label>
                                        <select 
                                            required
                                            value={channelForm.farm_id || ''}
                                            onChange={e => setChannelForm({ ...channelForm, farm_id: e.target.value || null })}
                                        >
                                            <option value="" disabled>-- Select a Farm --</option>
                                            {farms.map(f => (
                                                <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

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
                                        Channel is Active
                                    </span>
                                </div>

                                <div className="routing-filters-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                                    <span className="section-title" style={{ display: 'block', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-color)' }}>Event Type Filters</span>
                                    
                                    <div className="filter-group">
                                        {loadingEventTypes ? (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)', padding: '10px 0' }}>
                                                <Loader2 className="spinner" size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                <span>Loading options...</span>
                                            </div>
                                        ) : availableEventTypes.length === 0 ? (
                                            <span className="help-text" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No event types available for this scope.</span>
                                        ) : (
                                            <div className="checkbox-grid scrollable" style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {availableEventTypes.map(evt => {
                                                    const isChecked = channelForm.event_types == null || channelForm.event_types.includes(evt.value);
                                                    return (
                                                        <div key={evt.value} className="checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input 
                                                                type="checkbox"
                                                                id={`evt-${evt.value}`}
                                                                checked={isChecked}
                                                                onChange={e => {
                                                                    const current = channelForm.event_types;
                                                                    const checked = e.target.checked;
                                                                    
                                                                    const next = checked
                                                                        ? [...(current || []), evt.value]
                                                                        : (current || availableEventTypes.map(x => x.value)).filter(x => x !== evt.value);
                                                                    
                                                                    const allChecked = availableEventTypes.every(x => next.includes(x.value));
                                                                    setChannelForm(prev => ({ 
                                                                        ...prev, 
                                                                        event_types: allChecked ? null : next 
                                                                    }));
                                                                }}
                                                            />
                                                            <label htmlFor={`evt-${evt.value}`} style={{ fontSize: '13px', cursor: 'pointer' }}>{evt.label}</label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
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
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Save Channel'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
            {selectedChannelForLogs && (
                <div className="modal-overlay" onClick={() => setSelectedChannelForLogs(null)}>
                    <div className="history-modal panel logs-history-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title-row">
                                    <h3>{t('notifications.logsTitle', { name: selectedChannelForLogs.name })}</h3>
                                    <span className={`status-pill ${selectedChannelForLogs.is_active ? 'active' : 'suspended'}`}>
                                        <span className="dot"></span>
                                        {selectedChannelForLogs.is_active ? t('farms.active') : t('farms.inactive')}
                                    </span>
                                    <span className="locale-badge">{selectedChannelForLogs.language || 'default'}</span>
                                    <span className="scope-badge system" style={{ textTransform: 'uppercase', fontSize: '10px', padding: '2px 8px' }}>
                                        {selectedChannelForLogs.scope}
                                    </span>
                                </div>
                                <p className="modal-desc">Code: <code>{selectedChannelForLogs.code}</code></p>
                            </div>
                            <button className="close-btn" onClick={() => setSelectedChannelForLogs(null)}>
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
                                            const successPct = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;
                                            const failureCount = logs.filter(l => l.status === 'failed').length;

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
                                                        onChange={(e) => setLogStatusFilter(e.target.value as any)}
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
                                                        onChange={(e) => setLogSeverityFilter(e.target.value as any)}
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
                                        </div>
                                    </div>

                                    {/* Right Panel: Scrollable timeline */}
                                    <div className="modal-right-panel">
                                        <h4 className="timeline-section-title">{t('notifications.timelineTitle')}</h4>
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
                                                            const isSkipped = log.status === 'skipped';
                                                            const logDate = new Date(log.created_at || log.sent_at || '');
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
