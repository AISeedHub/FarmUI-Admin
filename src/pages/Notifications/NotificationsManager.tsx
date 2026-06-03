import React, { useEffect, useState } from 'react';
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
    HelpCircle
} from 'lucide-react';
import { notificationsApi, farmsApi, usersApi } from '../../api/services';
import { Farm, UserResponse, NotificationChannel, NotificationTemplate } from '../../types';
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
        severities: [],
        event_types: [],
        is_active: true
    });
    const [revealedWebhooks, setRevealedWebhooks] = useState<Record<string, boolean>>({});

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
        locale: 'en',
        name: '',
        title_template: '',
        body_template: '',
        is_active: true
    });

    const severityOptions = ['info', 'warning', 'critical', 'report'];
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
    const handleOpenChannelModal = (channel: NotificationChannel | null = null) => {
        if (channel) {
            setEditingChannel(channel);
            setChannelForm({
                code: channel.code,
                name: channel.name,
                webhook_url: channel.webhook_url,
                mention_role_id: channel.mention_role_id || '',
                scope: channel.scope,
                farm_id: channel.farm_id || null,
                severities: channel.severities || [],
                event_types: channel.event_types || [],
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
                severities: [],
                event_types: [],
                is_active: true
            });
        }
        setIsChannelModalOpen(true);
    };

    const handleSaveChannel = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Clean up optional fields
            const payload: Omit<NotificationChannel, 'id'> = {
                ...channelForm,
                webhook_url: channelForm.webhook_url.trim(),
                mention_role_id: channelForm.mention_role_id?.trim() || null,
                farm_id: channelForm.scope === 'farm' ? (channelForm.farm_id || null) : null,
                severities: channelForm.severities && channelForm.severities.length > 0 ? channelForm.severities : null,
                event_types: channelForm.event_types && channelForm.event_types.length > 0 ? channelForm.event_types : null
            };

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

    // --- Template CRUD handlers ---
    const handleOpenTemplateModal = (template: NotificationTemplate | null = null) => {
        if (template) {
            setEditingTemplate(template);
            setTemplateForm({
                type: template.type,
                locale: template.locale,
                name: template.name,
                title_template: template.title_template,
                body_template: template.body_template,
                is_active: template.is_active
            });
        } else {
            setEditingTemplate(null);
            setTemplateForm({
                type: 'farm_offline',
                locale: 'en',
                name: '',
                title_template: '',
                body_template: '',
                is_active: true
            });
        }
        setIsTemplateModalOpen(true);
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
                                                <span className={`scope-badge ${channel.scope}`}>
                                                    {channel.scope === 'system' 
                                                        ? t('notifications.scopeSystem') 
                                                        : getFarmName(channel.farm_id)
                                                    }
                                                </span>
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
                                                    {(!channel.severities || channel.severities.length === 0) && 
                                                     (!channel.event_types || channel.event_types.length === 0) ? (
                                                        <span className="empty-filter">All events & severities</span>
                                                    ) : (
                                                        <>
                                                            {channel.severities && channel.severities.map(sev => (
                                                                <span key={sev} className="filter-tag severity">{sev}</span>
                                                            ))}
                                                            {channel.event_types && channel.event_types.map(evt => (
                                                                <span key={evt} className="filter-tag event-type">{evt}</span>
                                                            ))}
                                                        </>
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
                                <th>{t('notifications.colTemplateLocale')}</th>
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
                                            <span className="locale-badge">{template.locale}</span>
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
                                            onChange={e => setChannelForm({ ...channelForm, scope: e.target.value as any })}
                                        >
                                            <option value="system">System (Super Admin alerts)</option>
                                            <option value="farm">Farm (Specific farm alerts)</option>
                                        </select>
                                    </div>
                                </div>

                                {channelForm.scope === 'farm' && (
                                    <div className="form-group">
                                        <label>Farm Association</label>
                                        <select 
                                            value={channelForm.farm_id || ''}
                                            onChange={e => setChannelForm({ ...channelForm, farm_id: e.target.value || null })}
                                        >
                                            <option value="">{t('notifications.scopeFarmGlobal')}</option>
                                            {farms.map(f => (
                                                <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="form-group flex-checkbox">
                                    <input 
                                        id="channel-is-active"
                                        type="checkbox" 
                                        checked={channelForm.is_active}
                                        onChange={e => setChannelForm({ ...channelForm, is_active: e.target.checked })}
                                    />
                                    <label htmlFor="channel-is-active" className="checkbox-label">Channel is Active</label>
                                </div>

                                <div className="routing-filters-section">
                                    <span className="section-title">{t('notifications.filters')}</span>
                                    
                                    <div className="filters-grid">
                                        <div className="filter-group">
                                            <label>{t('notifications.severityLabel')}</label>
                                            <div className="checkbox-grid">
                                                {severityOptions.map(sev => {
                                                    const checked = channelForm.severities?.includes(sev) || false;
                                                    return (
                                                        <div key={sev} className="checkbox-item">
                                                            <input 
                                                                type="checkbox"
                                                                id={`sev-${sev}`}
                                                                checked={checked}
                                                                onChange={e => {
                                                                    const current = channelForm.severities || [];
                                                                    const next = e.target.checked 
                                                                        ? [...current, sev] 
                                                                        : current.filter(x => x !== sev);
                                                                    setChannelForm({ ...channelForm, severities: next });
                                                                }}
                                                            />
                                                            <label htmlFor={`sev-${sev}`}>{sev}</label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="filter-group">
                                            <label>{t('notifications.eventTypeLabel')}</label>
                                            <div className="checkbox-grid scrollable">
                                                {eventTypeOptions.map(evt => {
                                                    const checked = channelForm.event_types?.includes(evt) || false;
                                                    return (
                                                        <div key={evt} className="checkbox-item">
                                                            <input 
                                                                type="checkbox"
                                                                id={`evt-${evt}`}
                                                                checked={checked}
                                                                onChange={e => {
                                                                    const current = channelForm.event_types || [];
                                                                    const next = e.target.checked 
                                                                        ? [...current, evt] 
                                                                        : current.filter(x => x !== evt);
                                                                    setChannelForm({ ...channelForm, event_types: next });
                                                                }}
                                                            />
                                                            <label htmlFor={`evt-${evt}`}>{evt.replace('_', ' ')}</label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
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
                                            onChange={e => setTemplateForm({ ...templateForm, type: e.target.value })}
                                        >
                                            {eventTypeOptions.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Locale *</label>
                                        <select 
                                            value={templateForm.locale}
                                            onChange={e => setTemplateForm({ ...templateForm, locale: e.target.value })}
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
                                    />
                                    <span className="help-text">Variables parsed from event context: <code>{`{farm_code}`}</code>, <code>{`{farm_name}`}</code></span>
                                </div>

                                <div className="form-group">
                                    <label>Message Body Template *</label>
                                    <textarea 
                                        required 
                                        rows={4}
                                        placeholder="e.g. Farm {farm_name} không gửi telemetry {minutes} phút."
                                        value={templateForm.body_template}
                                        onChange={e => setTemplateForm({ ...templateForm, body_template: e.target.value })}
                                    />
                                    <span className="help-text">Variables: <code>{`{farm_name}`}</code>, <code>{`{minutes}`}</code>, <code>{`{severity}`}</code></span>
                                </div>

                                <div className="form-group flex-checkbox">
                                    <input 
                                        id="template-is-active"
                                        type="checkbox" 
                                        checked={templateForm.is_active}
                                        onChange={e => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                                    />
                                    <label htmlFor="template-is-active" className="checkbox-label">Template is Active</label>
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
        </div>
    );
}
