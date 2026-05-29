import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import { Farm, UserResponse } from '../../types';
import { farmsApi, authApi, farmUsersApi } from '../../api/services';
import './FarmsList.css';

export default function FarmsList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [farms, setFarms] = useState<Farm[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Farm>>({});
    const [saving, setSaving] = useState(false);

    // New state for create form dropdowns
    const [users, setUsers] = useState<UserResponse[]>([]);
    const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
    const [selectedCloneSourceId, setSelectedCloneSourceId] = useState('');
    const [dropdownsLoading, setDropdownsLoading] = useState(false);

    useEffect(() => {
        loadFarms();
    }, []);

    const loadFarms = async () => {
        setLoading(true);
        const data = await farmsApi.getAll();
        setFarms(data);
        setLoading(false);
    };

    const handleCreate = async () => {
        setIsEditing('new');
        setFormData({ code: '', name: '', location: '', timezone: 'Asia/Seoul', default_language: 'en', is_active: true });
        setSelectedAdminUserId('');
        setSelectedCloneSourceId('');

        // Load dropdown data
        setDropdownsLoading(true);
        try {
            const [usersData, farmsData] = await Promise.all([
                authApi.getUsers(),
                farmsApi.getAll()
            ]);
            setUsers(usersData);
            setFarms(prev => {
                // Merge fresh data but keep UI consistent
                return farmsData.length > 0 ? farmsData : prev;
            });
        } catch (err) {
            console.error('Failed to load dropdown data:', err);
        } finally {
            setDropdownsLoading(false);
        }
    };

    const handleEdit = (e: React.MouseEvent, farm: Farm) => {
        e.stopPropagation();
        setIsEditing(farm.id);
        setFormData({ ...farm });
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm(t('farms.confirmDelete'))) {
            await farmsApi.delete(id);
            loadFarms();
        }
    };

    const toggleActive = async (e: React.MouseEvent, farm: Farm) => {
        e.stopPropagation();
        await farmsApi.update(farm.id, { is_active: !farm.is_active });
        loadFarms();
    };

    const handleSave = async () => {
        if (isEditing === 'new') {
            // Validate admin user selection
            if (!selectedAdminUserId) {
                alert(t('farms.adminUserPlaceholder'));
                return;
            }

            setSaving(true);
            try {
                // Step 1: Create farm
                const newFarm = await farmsApi.create(formData as Omit<Farm, 'id' | 'created_at'>);

                // Step 2 & 3: Assign admin + Clone (parallel, both depend on step 1)
                const parallelTasks: Promise<unknown>[] = [
                    farmUsersApi.create({
                        farm_id: newFarm.id,
                        user_id: selectedAdminUserId,
                        role: 'admin'
                    })
                ];

                if (selectedCloneSourceId) {
                    parallelTasks.push(
                        farmsApi.clone(selectedCloneSourceId, { target_farm_id: newFarm.id })
                    );
                }

                const results = await Promise.allSettled(parallelTasks);

                // Check results
                const adminResult = results[0];
                const cloneResult = results.length > 1 ? results[1] : null;

                if (adminResult.status === 'rejected') {
                    alert(t('farms.assignAdminFailed', { error: adminResult.reason?.message || 'Unknown error' }));
                } else if (cloneResult && cloneResult.status === 'rejected') {
                    alert(t('farms.cloneFailed', { error: cloneResult.reason?.message || 'Unknown error' }));
                } else if (cloneResult && cloneResult.status === 'fulfilled') {
                    const cloneData = cloneResult.value as { zones: number; devices: number; registers: number; automations: number };
                    alert(t('farms.cloneSuccess', cloneData));
                } else {
                    alert(t('farms.createSuccess'));
                }

                setIsEditing(null);
                loadFarms();
            } catch (err: any) {
                alert(t('farms.createFailed', { error: err?.message || 'Unknown error' }));
            } finally {
                setSaving(false);
            }
        } else if (isEditing) {
            await farmsApi.update(isEditing, formData);
            setIsEditing(null);
            loadFarms();
        }
    };

    const navigateToDetails = (id: string, e?: React.MouseEvent) => {
        if (e && (e.target as HTMLElement).closest('button')) return;
        navigate(`/farms/${id}`);
    };

    const isCreateMode = isEditing === 'new';

    return (
        <div className="farms-container">
            <div className="page-header">
                <h2>{t('farms.title')}</h2>
                <button className="primary flex-center" onClick={handleCreate}>
                    <Plus size={18} /> {t('btn.create')}
                </button>
            </div>

            {loading ? (
                <div className="loading">{t('common.loading')}</div>
            ) : (
                <div className="farms-grid">
                    {farms.map(farm => (
                        <div
                            key={farm.id}
                            className={`farm-card panel ${!farm.is_active ? 'inactive' : ''}`}
                            onClick={(e) => navigateToDetails(farm.id, e)}
                        >
                            <div className="farm-card-header">
                                <h3>{farm.name}</h3>
                                <span className="farm-code">{farm.code}</span>
                            </div>

                            <div className="farm-card-body">
                                <p><strong>{t('farms.location')}:</strong> {farm.location}</p>
                                <div className="status-badge">
                                    {farm.is_active ? (
                                        <><Power size={14} className="active-icon" /> {t('farms.active')}</>
                                    ) : (
                                        <><PowerOff size={14} className="inactive-icon" /> {t('farms.inactive')}</>
                                    )}
                                </div>
                            </div>

                            <div className="card-actions">
                                <button title="Toggle Active" onClick={(e) => toggleActive(e, farm)} className="action-btn">
                                    {farm.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                                </button>
                                <button title="Edit" onClick={(e) => handleEdit(e, farm)} className="action-btn">
                                    <Edit2 size={16} />
                                </button>
                                <button title="Delete" onClick={(e) => handleDelete(e, farm.id)} className="action-btn delete">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Basic Edit/Create Modal (Can be improved to use proper Dialog) */}
            {isEditing && (
                <div className="modal-overlay">
                    <div className="modal-content panel">
                        <h3>{isCreateMode ? t('farms.newFarm') : t('farms.editFarm')}</h3>
                        <div className="form-group">
                            <label>{t('farms.farmCode')}</label>
                            <input
                                value={formData.code || ''}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('farms.name')}</label>
                            <input
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('farms.location')}</label>
                            <input
                                value={formData.location || ''}
                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                            />
                        </div>

                        {/* New dropdowns — only in create mode */}
                        {isCreateMode && (
                            <>
                                <div className="form-group">
                                    <label>{t('farms.adminUser')} <span className="required">*</span></label>
                                    <select
                                        value={selectedAdminUserId}
                                        onChange={e => setSelectedAdminUserId(e.target.value)}
                                        disabled={dropdownsLoading}
                                    >
                                        <option value="">{dropdownsLoading ? t('common.loading') : t('farms.adminUserPlaceholder')}</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id}>
                                                {user.username || user.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{t('farms.cloneSource')}</label>
                                    <select
                                        value={selectedCloneSourceId}
                                        onChange={e => setSelectedCloneSourceId(e.target.value)}
                                        disabled={dropdownsLoading}
                                    >
                                        <option value="">{dropdownsLoading ? t('common.loading') : t('farms.cloneSourcePlaceholder')}</option>
                                        {farms.map(farm => (
                                            <option key={farm.id} value={farm.id}>
                                                {farm.name} ({farm.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        <div className="modal-actions">
                            <button onClick={() => setIsEditing(null)} disabled={saving}>{t('btn.cancel')}</button>
                            <button className="primary" onClick={handleSave} disabled={saving}>
                                {saving ? t('farms.creating') : t('btn.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
