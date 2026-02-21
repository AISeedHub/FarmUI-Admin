import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import { Farm } from '../../types';
import { farmsApi } from '../../api/services';
import './FarmsList.css';

export default function FarmsList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [farms, setFarms] = useState<Farm[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Farm>>({});

    useEffect(() => {
        loadFarms();
    }, []);

    const loadFarms = async () => {
        setLoading(true);
        const data = await farmsApi.getAll();
        setFarms(data);
        setLoading(false);
    };

    const handleCreate = () => {
        setIsEditing('new');
        setFormData({ farm_code: '', name: '', location: '', is_active: true });
    };

    const handleEdit = (e: React.MouseEvent, farm: Farm) => {
        e.stopPropagation();
        setIsEditing(farm.id);
        setFormData({ ...farm });
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('Delete this farm?')) {
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
            await farmsApi.create(formData as Omit<Farm, 'id' | 'created_at'>);
        } else if (isEditing) {
            await farmsApi.update(isEditing, formData);
        }
        setIsEditing(null);
        loadFarms();
    };

    const navigateToDetails = (id: string, e?: React.MouseEvent) => {
        if (e && (e.target as HTMLElement).closest('button')) return;
        navigate(`/farms/${id}`);
    };

    return (
        <div className="farms-container">
            <div className="page-header">
                <h2>{t('farms.title')}</h2>
                <button className="primary flex-center" onClick={handleCreate}>
                    <Plus size={18} /> {t('btn.create')}
                </button>
            </div>

            {loading ? (
                <div className="loading">Loading...</div>
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
                                <span className="farm-code">{farm.farm_code}</span>
                            </div>

                            <div className="farm-card-body">
                                <p><strong>Location:</strong> {farm.location}</p>
                                <div className="status-badge">
                                    {farm.is_active ? (
                                        <><Power size={14} className="active-icon" /> Active</>
                                    ) : (
                                        <><PowerOff size={14} className="inactive-icon" /> Inactive</>
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
                        <h3>{isEditing === 'new' ? 'New Farm' : 'Edit Farm'}</h3>
                        <div className="form-group">
                            <label>Farm Code</label>
                            <input
                                value={formData.farm_code || ''}
                                onChange={e => setFormData({ ...formData, farm_code: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Name</label>
                            <input
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input
                                value={formData.location || ''}
                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                            />
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setIsEditing(null)}>{t('btn.cancel')}</button>
                            <button className="primary" onClick={handleSave}>{t('btn.save')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
