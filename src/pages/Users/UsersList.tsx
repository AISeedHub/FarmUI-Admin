import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Loader2, Globe, Edit2, Trash2 } from 'lucide-react';
import { usersApi, farmsApi, farmUsersApi } from '../../api/services';
import { UserResponse, Farm, FarmUserDetail, UserCreate } from '../../types';
import './UsersList.css';

export default function UsersList() {
    const { t } = useTranslation();

    const [users, setUsers] = useState<UserResponse[]>([]);
    const [farms, setFarms] = useState<Farm[]>([]);
    const [memberships, setMemberships] = useState<Record<string, FarmUserDetail[]>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Search and Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'owner' | 'admin' | 'operator' | 'viewer'>('all');

    // Create Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState<UserCreate & { password: string, assignFarmId: string, assignRole: 'admin' | 'operator' | 'viewer' }>({
        email: '',
        username: '',
        password: '',
        global_role: 'user',
        preferred_language: 'en',
        assignFarmId: '',
        assignRole: 'viewer'
    });

    // Edit Modal State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState<Partial<UserResponse> & { password?: string }>({});
    const [userMemberships, setUserMemberships] = useState<FarmUserDetail[]>([]);
    
    // Add Farm Access State (inside edit modal)
    const [newAccessFarmId, setNewAccessFarmId] = useState('');
    const [newAccessRole, setNewAccessRole] = useState<'admin' | 'operator' | 'viewer'>('viewer');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const usersData = await usersApi.getAll();
            const farmsData = await farmsApi.getAll();
            
            // Fetch memberships for all farms in parallel
            const membershipsData: Record<string, FarmUserDetail[]> = {};
            await Promise.all(
                farmsData.map(async (farm) => {
                    try {
                        const members = await farmUsersApi.getByFarm(farm.id);
                        membershipsData[farm.id] = members;
                    } catch (err) {
                        console.error(`Failed to load members for farm ${farm.id}:`, err);
                        membershipsData[farm.id] = [];
                    }
                })
            );

            setUsers(usersData);
            setFarms(farmsData);
            setMemberships(membershipsData);
        } catch (error) {
            console.error('Failed to load users data', error);
        } finally {
            setLoading(false);
        }
    };

    const getUserMembershipsList = (userId: string) => {
        const list: { farmId: string; farmName: string; farmCode: string; role: 'admin' | 'operator' | 'viewer'; membershipId: string }[] = [];
        Object.entries(memberships).forEach(([farmId, farmUsers]) => {
            const farm = farms.find(f => f.id === farmId);
            if (!farm) return;
            const match = farmUsers.find(mu => mu.user_id === userId);
            if (match) {
                list.push({
                    farmId,
                    farmName: farm.name,
                    farmCode: farm.code,
                    role: match.role as any,
                    membershipId: match.id
                });
            }
        });
        return list;
    };

    // Filters & Search logic
    const filteredUsers = users.filter(user => {
        // Search matches
        const matchesSearch = 
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (user.username || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        // Role filter matches
        if (activeRoleFilter === 'all') return true;
        if (activeRoleFilter === 'owner') {
            return user.global_role === 'super_admin';
        }
        
        const userMem = getUserMembershipsList(user.id);
        return userMem.some(m => {
            if (activeRoleFilter === 'admin') return m.role === 'admin';
            if (activeRoleFilter === 'operator') return m.role === 'operator';
            if (activeRoleFilter === 'viewer') return m.role === 'viewer';
            return false;
        });
    });

    const getInitials = (username: string | null, email: string) => {
        const name = username || email;
        const parts = name.split(/[\s\._\-@]+/);
        if (parts.length >= 2 && parts[0] && parts[1]) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    const getAvatarColor = (email: string) => {
        const colors = ['#cf4f30', '#0d5c3a', '#1e40af', '#b45309', '#6b7280', '#6d28d9', '#be185d', '#0369a1', '#15803d'];
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            hash = email.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const newUser = await usersApi.create({
                email: createForm.email,
                username: createForm.username,
                password: createForm.password,
                global_role: createForm.global_role,
                preferred_language: createForm.preferred_language,
                is_active: true
            });

            // Assign to farm if selected and global role is user
            if (createForm.global_role === 'user' && createForm.assignFarmId) {
                await farmUsersApi.create({
                    farm_id: createForm.assignFarmId,
                    user_id: newUser.id,
                    role: createForm.assignRole
                });
            }

            alert(t('users.inviteSuccess'));
            setIsCreateOpen(false);
            setCreateForm({
                email: '',
                username: '',
                password: '',
                global_role: 'user',
                preferred_language: 'en',
                assignFarmId: '',
                assignRole: 'viewer'
            });
            loadData();
        } catch (err: any) {
            alert(t('users.inviteFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleOpenEditModal = (user: UserResponse) => {
        setEditForm({ ...user });
        
        // Load user's memberships
        const list: FarmUserDetail[] = [];
        Object.values(memberships).forEach((farmUsers) => {
            const match = farmUsers.find(mu => mu.user_id === user.id);
            if (match) {
                list.push(match);
            }
        });
        setUserMemberships(list);
        setNewAccessFarmId('');
        
        setIsEditOpen(true);
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.id) return;
        setSaving(true);
        try {
            const dataToUpdate: Partial<UserResponse> & { password?: string } = {
                email: editForm.email,
                username: editForm.username,
                global_role: editForm.global_role,
                preferred_language: editForm.preferred_language,
                is_active: editForm.is_active
            };
            if (editForm.password) {
                dataToUpdate.password = editForm.password;
            }
            await usersApi.update(editForm.id, dataToUpdate);
            alert(t('users.updateSuccess'));
            setIsEditOpen(false);
            loadData();
        } catch (err: any) {
            alert(t('users.updateFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleAddFarmAccess = async () => {
        if (!editForm.id || !newAccessFarmId) return;
        setSaving(true);
        try {
            const newMem = await farmUsersApi.create({
                farm_id: newAccessFarmId,
                user_id: editForm.id,
                role: newAccessRole
            });
            
            setUserMemberships(prev => [...prev, {
                id: newMem.id,
                farm_id: newAccessFarmId,
                user_id: editForm.id!,
                role: newAccessRole,
                email: editForm.email || undefined,
                username: editForm.username || null
            }]);

            setNewAccessFarmId('');
            alert(t('users.grantAccessSuccess'));
            loadData();
        } catch (err: any) {
            alert(t('users.grantAccessFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleRevokeFarmAccess = async (membershipId: string) => {
        if (!window.confirm(t('users.revokeConfirm'))) return;
        setSaving(true);
        try {
            await farmUsersApi.delete(membershipId);
            setUserMemberships(prev => prev.filter(m => m.id !== membershipId));
            alert(t('users.revokeSuccess'));
            loadData();
        } catch (err: any) {
            alert(t('users.revokeFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!window.confirm(t('users.deleteConfirm'))) return;
        try {
            await usersApi.delete(userId);
            alert(t('users.deleteSuccess'));
            loadData();
        } catch (err: any) {
            alert(t('users.deleteFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    const getFarmName = (farmId: string) => {
        return farms.find(f => f.id === farmId)?.name || 'Unknown Farm';
    };



    return (
        <div className="users-container">
            <div>
                <span className="users-breadcrumbs">{t('users.breadcrumbs')}</span>
                <div className="users-header">
                    <h2>{t('nav.users')}</h2>
                    <button className="invite-btn" onClick={() => setIsCreateOpen(true)}>
                        <Plus size={14} /> {t('users.inviteBtn')}
                    </button>
                </div>
            </div>

            <div className="filter-bar">
                <div className="search-wrapper">
                    <Search className="search-icon" size={16} />
                    <input
                        className="search-input"
                        placeholder={t('users.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="role-filters">
                    <button 
                        className={`filter-pill ${activeRoleFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveRoleFilter('all')}
                    >
                        {t('users.allRoles')}
                    </button>
                    <button 
                        className={`filter-pill ${activeRoleFilter === 'owner' ? 'active' : ''}`}
                        onClick={() => setActiveRoleFilter('owner')}
                    >
                        {t('users.roleOwner')}
                    </button>
                    <button 
                        className={`filter-pill ${activeRoleFilter === 'admin' ? 'active' : ''}`}
                        onClick={() => setActiveRoleFilter('admin')}
                    >
                        {t('users.roleAdmin')}
                    </button>
                    <button 
                        className={`filter-pill ${activeRoleFilter === 'operator' ? 'active' : ''}`}
                        onClick={() => setActiveRoleFilter('operator')}
                    >
                        {t('users.roleOperator')}
                    </button>
                    <button 
                        className={`filter-pill ${activeRoleFilter === 'viewer' ? 'active' : ''}`}
                        onClick={() => setActiveRoleFilter('viewer')}
                    >
                        {t('users.roleViewer')}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '10px' }}>
                    <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>{t('users.loadingText')}</span>
                </div>
            ) : (
                <div className="users-table-panel">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>{t('users.colUser')}</th>
                                <th>{t('users.colRole')}</th>
                                <th>{t('users.colFarmAccess')}</th>
                                <th>{t('users.colStatus')}</th>
                                <th style={{ width: '100px', minWidth: '100px', textAlign: 'right' }}>{t('users.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(user => {
                                const userMems = getUserMembershipsList(user.id);
                                
                                // Determine single representative role for row badge
                                let roleBadgeText = 'user';
                                if (user.global_role === 'super_admin') {
                                    roleBadgeText = 'owner';
                                } else if (userMems.length > 0) {
                                    // Map membership roles to mockup words
                                    const firstRole = userMems[0].role;
                                    if (firstRole === 'admin') roleBadgeText = 'farm_manager';
                                    else if (firstRole === 'operator') roleBadgeText = 'operator';
                                    else if (firstRole === 'viewer') roleBadgeText = 'viewer';
                                }

                                // Determine Farm Access string
                                let farmAccessText = t('users.noAccess');
                                let isAllFarms = false;
                                if (user.global_role === 'super_admin') {
                                    farmAccessText = t('users.allFarms');
                                    isAllFarms = true;
                                } else if (userMems.length === 1) {
                                    farmAccessText = userMems[0].farmName;
                                } else if (userMems.length > 1) {
                                    farmAccessText = `${userMems[0].farmName} +${userMems.length - 1}`;
                                }

                                return (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="user-info-cell">
                                                <div 
                                                    className="user-avatar" 
                                                    style={{ backgroundColor: getAvatarColor(user.email) }}
                                                >
                                                    {getInitials(user.username, user.email)}
                                                </div>
                                                <div className="user-details">
                                                    <span className="name">
                                                        {user.username || 'Unspecified Name'}
                                                        {user.global_role === 'super_admin' && (
                                                            <span title="Super Admin Account" className="global-admin-badge" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                <Globe size={12} />
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="email">{user.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`role-badge ${roleBadgeText}`}>
                                                {roleBadgeText === 'owner' && t('users.badgeOwner')}
                                                {roleBadgeText === 'farm_manager' && t('users.badgeFarmManager')}
                                                {roleBadgeText === 'operator' && t('users.badgeOperator')}
                                                {roleBadgeText === 'viewer' && t('users.badgeViewer')}
                                                {roleBadgeText === 'user' && t('users.badgeUser')}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`farm-access-list ${isAllFarms ? 'all-farms' : ''}`}>
                                                {farmAccessText}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-pill ${user.is_active ? 'active' : 'suspended'}`}>
                                                <span className="dot"></span>
                                                {user.is_active ? t('users.statusActive') : t('users.statusSuspended')}
                                            </span>
                                        </td>
                                        <td className="actions-cell" style={{ width: '100px', minWidth: '100px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button 
                                                    className="context-menu-btn" 
                                                    title={t('users.tooltipEdit')}
                                                    onClick={() => handleOpenEditModal(user)}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button 
                                                    className="context-menu-btn delete-btn" 
                                                    title={t('users.tooltipDelete')}
                                                    style={{ color: 'var(--color-danger)' }}
                                                    onClick={() => handleDeleteUser(user.id)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Invite/Create User Modal */}
            {isCreateOpen && (
                <div className="modal-overlay">
                    <div className="modal-content users-modal panel">
                        <h3>{t('users.inviteTitle')}</h3>
                        <form onSubmit={handleCreateUser}>
                            <div className="modal-form-body">
                                <div className="form-group">
                                    <label>{t('users.emailLabel')}</label>
                                    <input 
                                        type="email" 
                                        required 
                                        placeholder="email@smartfarm.com"
                                        value={createForm.email}
                                        onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                                    />
                                </div>
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('users.usernameLabel')}</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="username"
                                            value={createForm.username}
                                            onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('users.passwordLabel')}</label>
                                        <input 
                                            type="password" 
                                            required 
                                            placeholder="••••••••"
                                            value={createForm.password}
                                            onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('users.globalRoleLabel')}</label>
                                        <select 
                                            value={createForm.global_role}
                                            onChange={e => setCreateForm({ ...createForm, global_role: e.target.value as any })}
                                        >
                                            <option value="user">{t('users.roleStandard')}</option>
                                            <option value="super_admin">{t('users.roleSuperAdmin')}</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('users.languageLabel')}</label>
                                        <select 
                                            value={createForm.preferred_language}
                                            onChange={e => setCreateForm({ ...createForm, preferred_language: e.target.value })}
                                        >
                                            <option value="en">English (en)</option>
                                            <option value="ko">Korean (ko)</option>
                                            <option value="vi">Vietnamese (vi)</option>
                                        </select>
                                    </div>
                                </div>

                                {createForm.global_role === 'user' && (
                                    <fieldset style={{ border: '1px solid var(--border-input)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <legend style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>
                                            {t('users.optionalFarmLabel')}
                                        </legend>
                                        <div className="form-group">
                                            <label>{t('users.selectFarmLabel')}</label>
                                            <select 
                                                value={createForm.assignFarmId}
                                                onChange={e => setCreateForm({ ...createForm, assignFarmId: e.target.value })}
                                            >
                                                <option value="">{t('users.noAssignment')}</option>
                                                {farms.map(f => (
                                                    <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                                                ))}
                                            </select>
                                        </div>
                                        {createForm.assignFarmId && (
                                            <div className="form-group">
                                                <label>{t('users.farmAccessLevelLabel')}</label>
                                                <select 
                                                    value={createForm.assignRole}
                                                    onChange={e => setCreateForm({ ...createForm, assignRole: e.target.value as any })}
                                                >
                                                    <option value="viewer">{t('users.farmRoleViewer')}</option>
                                                    <option value="operator">{t('users.farmRoleOperator')}</option>
                                                    <option value="admin">{t('users.farmRoleAdmin')}</option>
                                                </select>
                                            </div>
                                        )}
                                    </fieldset>
                                )}
                            </div>
                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    className="cancel-btn" 
                                    onClick={() => setIsCreateOpen(false)}
                                    disabled={saving}
                                >
                                    {t('btn.cancel')}
                                </button>
                                <button 
                                    type="submit" 
                                    className="submit-btn" 
                                    disabled={saving}
                                >
                                    {saving ? t('users.inviting') : t('users.inviteSubmit')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {isEditOpen && (
                <div className="modal-overlay">
                    <div className="modal-content users-modal panel">
                        <h3>{t('users.editTitle')}</h3>
                        <form onSubmit={handleUpdateUser}>
                            <div className="modal-form-body">
                                <div className="form-group">
                                    <label>{t('users.emailLabel')}</label>
                                    <input 
                                        type="email" 
                                        required 
                                        value={editForm.email || ''}
                                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                    />
                                </div>
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('users.usernameLabel')}</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={editForm.username || ''}
                                            onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{t('users.updatePasswordLabel')}</label>
                                        <input 
                                            type="password" 
                                            placeholder={t('users.passwordPlaceholder')}
                                            value={editForm.password || ''}
                                            onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>{t('users.globalRoleLabel')}</label>
                                        <select 
                                            value={editForm.global_role || 'user'}
                                            onChange={e => setEditForm({ ...editForm, global_role: e.target.value as any })}
                                        >
                                            <option value="user">{t('users.roleStandard')}</option>
                                            <option value="super_admin">{t('users.roleSuperAdmin')}</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('users.languageLabel')}</label>
                                        <select 
                                            value={editForm.preferred_language || 'en'}
                                            onChange={e => setEditForm({ ...editForm, preferred_language: e.target.value })}
                                        >
                                            <option value="en">English (en)</option>
                                            <option value="ko">Korean (ko)</option>
                                            <option value="vi">Vietnamese (vi)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                                    <input 
                                        id="edit-is-active-checkbox"
                                        type="checkbox" 
                                        checked={editForm.is_active ?? true}
                                        onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                                    />
                                    <label htmlFor="edit-is-active-checkbox" className="checkbox-label">{t('users.activeLabel')}</label>
                                </div>

                                {editForm.global_role === 'user' && (
                                    <fieldset style={{ border: '1px solid var(--border-input)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <legend style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>
                                            {t('users.manageAccessLabel')}
                                        </legend>
                                        
                                        {/* Membership List */}
                                        {userMemberships.length === 0 ? (
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                                                {t('users.noPermissionsText')}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {userMemberships.map(mem => (
                                                    <div 
                                                        key={mem.id}
                                                        style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between', background: 'var(--bg-color)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
                                                    >
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{getFarmName(mem.farm_id)}</span>
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                                                {t('users.roleLabel')} {mem.role === 'admin' ? t('users.roleAdmin') : mem.role === 'operator' ? t('users.roleOperator') : t('users.roleViewer')}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                                            onClick={() => handleRevokeFarmAccess(mem.id)}
                                                        >
                                                            {t('users.revokeBtn')}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Membership Form */}
                                        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>{t('users.grantAccessTitle')}</span>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <select
                                                    style={{ flex: 1, padding: '8px' }}
                                                    value={newAccessFarmId}
                                                    onChange={e => setNewAccessFarmId(e.target.value)}
                                                >
                                                    <option value="">{t('users.chooseFarmPlaceholder')}</option>
                                                    {farms
                                                        .filter(f => !userMemberships.some(m => m.farm_id === f.id))
                                                        .map(f => (
                                                            <option key={f.id} value={f.id}>{f.name}</option>
                                                        ))}
                                                </select>
                                                <select
                                                    style={{ width: '110px', padding: '8px' }}
                                                    value={newAccessRole}
                                                    onChange={e => setNewAccessRole(e.target.value as any)}
                                                    disabled={!newAccessFarmId}
                                                >
                                                    <option value="viewer">{t('users.roleViewer')}</option>
                                                    <option value="operator">{t('users.roleOperator')}</option>
                                                    <option value="admin">{t('users.roleAdmin')}</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    style={{ background: 'var(--accent)', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                                    onClick={handleAddFarmAccess}
                                                    disabled={!newAccessFarmId || saving}
                                                >
                                                    {t('users.addBtn')}
                                                </button>
                                            </div>
                                        </div>
                                    </fieldset>
                                )}
                            </div>
                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    className="cancel-btn" 
                                    onClick={() => setIsEditOpen(false)}
                                    disabled={saving}
                                >
                                    {t('btn.cancel')}
                                </button>
                                <button 
                                    type="submit" 
                                    className="submit-btn" 
                                    disabled={saving}
                                >
                                    {saving ? t('users.saving') : t('users.saveBtn')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
