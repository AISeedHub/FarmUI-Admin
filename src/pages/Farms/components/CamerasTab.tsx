import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle, RefreshCw, Plus, Pencil, Trash2, Video, VideoOff, Eye, EyeOff, Copy, Check, MapPin } from 'lucide-react';
import { camerasApi, zonesApi } from '../../../api/services';
import { Camera, CameraCreate, CameraUpdate, StreamProtocol, Zone } from '../../../types';
import './CamerasTab.css';

interface CamerasTabProps {
    farmId: string;
    zones: Zone[];
    // Called after a camera-zone is created via the shared /zones API so the parent
    // can refresh its zone list (the picker reads zones from props).
    onZonesChanged?: () => void | Promise<void>;
}

const PROTOCOLS: StreamProtocol[] = ['webrtc', 'hls', 'rtsp'];
const DEFAULT_DISPLAY_NAMES = '{\n  "en": "",\n  "ko": "",\n  "vi": ""\n}';

// Shared per-farm code slug (zone codes share a namespace with sensor/actuator zones).
const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');

// A camera-zone is a shared `zones` row with no modbus unit (default_unit_id == null).
const isCameraZone = (z: Zone) => z.default_unit_id == null;

// Editable shape backing the modal form. display_names is edited as raw JSON text
// (displayNamesStr) and parsed on save — same convention as the zone/device modals.
// zoneMode toggles between assigning an existing camera-zone and creating one inline.
type CameraForm = Partial<Camera> & {
    displayNamesStr?: string;
    zoneMode?: 'existing' | 'new';
    newZoneName?: string;
    newZoneCode?: string;
};

export default function CamerasTab({ farmId, zones, onZonesChanged }: CamerasTabProps) {
    const { t, i18n } = useTranslation();

    const [cameras, setCameras] = useState<Camera[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [zoneFilter, setZoneFilter] = useState<string>('all'); // 'all' | 'unassigned' | zoneId

    // Modal state (null editId → create)
    const [modalOpen, setModalOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<CameraForm>({});
    const [saving, setSaving] = useState(false);
    const [revealUrl, setRevealUrl] = useState(false); // reveal rtsp_url inside the modal

    // Per-card reveal + copy feedback for the (credential-bearing) rtsp_url.
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (farmId) loadData();
    }, [farmId]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await camerasApi.getByFarm(farmId);
            list.sort((a, b) => a.display_order - b.display_order || a.code.localeCompare(b.code));
            setCameras(list);
        } catch (err: any) {
            console.error('Failed to load cameras:', err);
            setError(err?.message || 'Failed to load cameras');
        } finally {
            setLoading(false);
        }
    };

    const zoneName = (zoneId: string | null) => {
        if (!zoneId) return t('detail.unassigned');
        const z = zones.find(zz => zz.id === zoneId);
        if (!z) return t('detail.unassigned');
        return z.display_names?.[i18n.language] || z.name || z.code;
    };

    const localizedName = (cam: Camera) =>
        cam.display_names?.[i18n.language] || cam.display_names?.en || cam.name || cam.code;

    const maskUrl = (url: string) => {
        // Hide credentials and host; keep the scheme so it still reads as an RTSP source.
        const scheme = url.split('://')[0];
        return `${scheme}://••••••••••••`;
    };

    const openCreate = () => {
        setEditId(null);
        setRevealUrl(false);
        setForm({
            is_active: true,
            stream_protocol: 'webrtc',
            display_order: cameras.length,
            zone_id: zoneFilter !== 'all' && zoneFilter !== 'unassigned' ? zoneFilter : null,
            zoneMode: 'existing',
            displayNamesStr: DEFAULT_DISPLAY_NAMES,
        });
        setModalOpen(true);
    };

    const openEdit = (cam: Camera) => {
        setEditId(cam.id);
        setRevealUrl(false);
        setForm({ ...cam, zoneMode: 'existing', displayNamesStr: JSON.stringify(cam.display_names || {}, null, 2) });
        setModalOpen(true);
    };

    const handleSave = async () => {
        // Required-field guard mirrors the backend constraints.
        if (!form.code?.trim() || !form.name?.trim() || !form.rtsp_url?.trim()) {
            alert(t('camera.vRequired'));
            return;
        }

        // Parse display_names JSON (optional).
        let displayNames: Record<string, string> | null = null;
        if (form.displayNamesStr && form.displayNamesStr.trim()) {
            try {
                const parsed = JSON.parse(form.displayNamesStr);
                // Drop empty values so we don't persist blank language entries.
                const cleaned = Object.fromEntries(
                    Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
                ) as Record<string, string>;
                displayNames = Object.keys(cleaned).length ? cleaned : null;
            } catch {
                alert(t('detail.invalidJson'));
                return;
            }
        }

        // Validate the inline-zone branch up front (all synchronous) before any writes.
        const creatingZone = form.zoneMode === 'new';
        const newZoneName = form.newZoneName?.trim();
        const newZoneCode = form.newZoneCode?.trim();
        if (creatingZone) {
            if (!newZoneName || !newZoneCode) {
                alert(t('camera.vZoneRequired'));
                return;
            }
            // Zone code shares a per-farm namespace with sensor/actuator zones, so check
            // against ALL zones (the BE may surface a raw 500 on the unique-constraint hit).
            if (zones.some(z => z.code.toLowerCase() === newZoneCode.toLowerCase())) {
                alert(t('camera.zoneCodeTaken', { code: newZoneCode }));
                return;
            }
        }

        setSaving(true);
        try {
            // Step 1 (optional): create the camera-zone — a shared zones row with
            // default_unit_id = null and a "Camera zone" marker description.
            let zoneId = form.zone_id || null;
            if (creatingZone) {
                const newZone = await zonesApi.create({
                    farm_id: farmId,
                    code: newZoneCode!,
                    name: newZoneName!,
                    display_names: null,
                    description: 'Camera zone',
                    default_unit_id: null,
                    display_order: 0,
                    is_active: true,
                });
                zoneId = newZone.id;
                // Surface the new zone immediately (also keeps it reusable if step 2 fails).
                await onZonesChanged?.();
            }

            // Step 2: create / update the camera, assigned to the resolved zone.
            const base = {
                zone_id: zoneId,
                code: form.code.trim(),
                name: form.name.trim(),
                display_names: displayNames,
                description: form.description?.trim() || null,
                rtsp_url: form.rtsp_url.trim(),
                stream_key: form.stream_key?.trim() || null,
                stream_protocol: form.stream_protocol || 'webrtc',
                is_active: form.is_active ?? true,
                display_order: Number(form.display_order) || 0,
            };

            if (editId === null) {
                await camerasApi.create({ farm_id: farmId, ...base } as CameraCreate);
                alert(t('camera.createSuccess'));
            } else {
                await camerasApi.update(editId, base as CameraUpdate);
                alert(t('camera.updateSuccess'));
            }
            setModalOpen(false);
            loadData();
        } catch (err: any) {
            // If the camera write failed after a zone was created, the zone is left behind
            // (harmless) and already visible in the picker for reuse on the next attempt.
            alert(t('camera.saveFailed', { error: err?.message || 'Unknown error' }));
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (cam: Camera) => {
        // Optimistic flip, then persist; revert on failure.
        setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, is_active: !c.is_active } : c));
        try {
            await camerasApi.update(cam.id, { is_active: !cam.is_active });
        } catch (err: any) {
            setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, is_active: cam.is_active } : c));
            alert(t('camera.saveFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    const handleDelete = async (cam: Camera) => {
        if (!window.confirm(t('camera.deleteConfirm', { name: localizedName(cam) }))) return;
        try {
            await camerasApi.delete(cam.id);
            loadData();
        } catch (err: any) {
            alert(t('camera.deleteFailed', { error: err?.message || 'Unknown error' }));
        }
    };

    const handleCopyUrl = async (cam: Camera) => {
        try {
            await navigator.clipboard.writeText(cam.rtsp_url);
            setCopiedId(cam.id);
            setTimeout(() => setCopiedId(prev => (prev === cam.id ? null : prev)), 1500);
        } catch {
            // Clipboard may be blocked (non-secure context); ignore silently.
        }
    };

    const filtered = cameras.filter(cam => {
        if (zoneFilter === 'all') return true;
        if (zoneFilter === 'unassigned') return !cam.zone_id;
        return cam.zone_id === zoneFilter;
    });

    const activeCount = cameras.filter(c => c.is_active).length;
    const zonesCovered = new Set(cameras.filter(c => c.zone_id).map(c => c.zone_id)).size;
    // Only camera-zones are offered for assignment / filtering (modbus zones live in Config).
    const cameraZones = zones.filter(isCameraZone);

    if (loading) {
        return (
            <div className="cameras-tab loading-state">
                <Loader2 className="spinner" size={24} />
                <span>{t('common.loading')}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="cameras-tab error-state">
                <AlertTriangle size={24} />
                <span>{error}</span>
                <button className="secondary-btn" onClick={loadData}>
                    <RefreshCw size={14} /> {t('preset.retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="cameras-tab">
            <div className="metrics-row">
                <div className="metric-box">
                    <span className="label">{t('camera.total')}</span>
                    <span className="value">{cameras.length}</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('camera.active')}</span>
                    <span className="value">{activeCount}</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('camera.inactive')}</span>
                    <span className="value">{cameras.length - activeCount}</span>
                </div>
                <div className="metric-box">
                    <span className="label">{t('camera.zonesCovered')}</span>
                    <span className="value">{zonesCovered}</span>
                </div>
            </div>

            <div className="cameras-section panel">
                <div className="section-header">
                    <div>
                        <h3>{t('camera.title')}</h3>
                        <p>{t('camera.desc')}</p>
                    </div>
                    <div className="actions">
                        <select
                            className="zone-filter"
                            value={zoneFilter}
                            onChange={e => setZoneFilter(e.target.value)}
                        >
                            <option value="all">{t('camera.allZones')}</option>
                            {cameraZones.map(z => (
                                <option key={z.id} value={z.id}>
                                    {z.display_names?.[i18n.language] || z.name || z.code}
                                </option>
                            ))}
                            {cameras.some(c => !c.zone_id) && (
                                <option value="unassigned">{t('detail.unassigned')}</option>
                            )}
                        </select>
                        <button className="primary-btn flex-center" onClick={openCreate}>
                            <Plus size={14} />
                            {t('camera.newCamera')}
                        </button>
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="cameras-empty">
                        <VideoOff size={28} />
                        <span>{cameras.length === 0 ? t('camera.empty') : t('camera.emptyFiltered')}</span>
                    </div>
                ) : (
                    <div className="camera-grid">
                        {filtered.map(cam => (
                            <div className={`camera-card ${cam.is_active ? '' : 'inactive'}`} key={cam.id}>
                                <div className="camera-thumb">
                                    {cam.is_active ? <Video size={26} /> : <VideoOff size={26} />}
                                    <span className={`protocol-badge ${cam.stream_protocol}`}>
                                        {cam.stream_protocol.toUpperCase()}
                                    </span>
                                    <span className={`status-pill ${cam.is_active ? 'on' : 'off'}`}>
                                        {cam.is_active ? t('camera.statusOn') : t('camera.statusOff')}
                                    </span>
                                </div>

                                <div className="camera-body">
                                    <div className="camera-title-row">
                                        <h4 title={localizedName(cam)}>{localizedName(cam)}</h4>
                                        <code className="camera-code">{cam.code}</code>
                                    </div>

                                    <div className="camera-zone">
                                        <MapPin size={12} />
                                        <span>{zoneName(cam.zone_id)}</span>
                                    </div>

                                    {cam.description && <p className="camera-desc">{cam.description}</p>}

                                    <div className="camera-meta">
                                        <span className="meta-item">
                                            <span className="meta-label">{t('camera.streamKey')}</span>
                                            <span className="meta-value">{cam.stream_key || '—'}</span>
                                        </span>
                                        <span className="meta-item">
                                            <span className="meta-label">{t('detail.order')}</span>
                                            <span className="meta-value">{cam.display_order}</span>
                                        </span>
                                    </div>

                                    <div className="rtsp-row">
                                        <span className="rtsp-label">RTSP</span>
                                        <code className="rtsp-url">
                                            {revealed[cam.id] ? cam.rtsp_url : maskUrl(cam.rtsp_url)}
                                        </code>
                                        <button
                                            className="icon-btn"
                                            title={revealed[cam.id] ? t('camera.hideUrl') : t('camera.revealUrl')}
                                            onClick={() => setRevealed(prev => ({ ...prev, [cam.id]: !prev[cam.id] }))}
                                        >
                                            {revealed[cam.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                                        </button>
                                        <button
                                            className="icon-btn"
                                            title={t('camera.copyUrl')}
                                            onClick={() => handleCopyUrl(cam)}
                                        >
                                            {copiedId === cam.id ? <Check size={13} className="copied" /> : <Copy size={13} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="camera-footer">
                                    <div
                                        className={`toggle ${cam.is_active ? 'on' : 'off'}`}
                                        title={t('camera.toggleTip')}
                                        onClick={() => handleToggleActive(cam)}
                                    >
                                        <div className="knob"></div>
                                    </div>
                                    <div className="footer-actions">
                                        <button className="icon-btn" title={t('camera.editTip')} onClick={() => openEdit(cam)}>
                                            <Pencil size={13} />
                                        </button>
                                        <button className="icon-btn danger" title={t('camera.deleteTip')} onClick={() => handleDelete(cam)}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {modalOpen && (
                <div className="modal-overlay" onClick={() => !saving && setModalOpen(false)}>
                    <div className="modal-content panel modal-large" onClick={e => e.stopPropagation()}>
                        <h3>{editId === null ? t('camera.createTitle') : t('camera.editTitle')}</h3>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>{t('camera.fName')}</label>
                                <input
                                    value={form.name || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setForm(f => ({
                                            ...f,
                                            name: val,
                                            // Auto-derive code from name only while creating.
                                            code: editId === null ? slug(val) : f.code,
                                        }));
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('camera.fCode')}</label>
                                <input value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                            </div>

                            <div className="form-group full-width">
                                <label>{t('detail.displayNamesJson')}</label>
                                <textarea
                                    rows={4}
                                    value={form.displayNamesStr ?? ''}
                                    onChange={e => setForm(f => ({ ...f, displayNamesStr: e.target.value }))}
                                />
                            </div>

                            <div className="form-group full-width">
                                <label>{t('detail.description')}</label>
                                <input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                            </div>

                            <div className="form-group full-width">
                                <label className="label-with-hint">
                                    {t('camera.fRtspUrl')}
                                    <span className="cred-warning">{t('camera.rtspWarning')}</span>
                                </label>
                                <div className="rtsp-input-wrap">
                                    <input
                                        type={revealUrl ? 'text' : 'password'}
                                        placeholder="rtsp://user:pass@host:554/stream"
                                        value={form.rtsp_url || ''}
                                        onChange={e => setForm(f => ({ ...f, rtsp_url: e.target.value }))}
                                    />
                                    <button type="button" className="icon-btn" title={revealUrl ? t('camera.hideUrl') : t('camera.revealUrl')} onClick={() => setRevealUrl(v => !v)}>
                                        {revealUrl ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>{t('camera.fStreamKey')}</label>
                                <input
                                    placeholder={t('camera.streamKeyPh')}
                                    value={form.stream_key || ''}
                                    onChange={e => setForm(f => ({ ...f, stream_key: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('camera.fProtocol')}</label>
                                <select
                                    value={form.stream_protocol || 'webrtc'}
                                    onChange={e => setForm(f => ({ ...f, stream_protocol: e.target.value as StreamProtocol }))}
                                >
                                    {PROTOCOLS.map(p => (
                                        <option key={p} value={p}>{p.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group full-width">
                                <label>{t('camera.zoneLabel')}</label>
                                <div className="zone-mode-toggle">
                                    <button
                                        type="button"
                                        className={form.zoneMode !== 'new' ? 'active' : ''}
                                        onClick={() => setForm(f => ({ ...f, zoneMode: 'existing' }))}
                                    >
                                        {t('camera.zoneExisting')}
                                    </button>
                                    <button
                                        type="button"
                                        className={form.zoneMode === 'new' ? 'active' : ''}
                                        onClick={() => setForm(f => ({ ...f, zoneMode: 'new' }))}
                                    >
                                        <Plus size={12} /> {t('camera.zoneNew')}
                                    </button>
                                </div>

                                {form.zoneMode === 'new' ? (
                                    <div className="new-zone-fields">
                                        <input
                                            placeholder={t('camera.zoneNamePh')}
                                            value={form.newZoneName || ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setForm(f => ({ ...f, newZoneName: val, newZoneCode: slug(val) }));
                                            }}
                                        />
                                        <input
                                            placeholder={t('camera.zoneCodePh')}
                                            value={form.newZoneCode || ''}
                                            onChange={e => setForm(f => ({ ...f, newZoneCode: e.target.value }))}
                                        />
                                        <span className="zone-hint">{t('camera.zoneNewHint')}</span>
                                    </div>
                                ) : (
                                    <select value={form.zone_id || ''} onChange={e => setForm(f => ({ ...f, zone_id: e.target.value || null }))}>
                                        <option value="">-- {t('detail.unassigned')} --</option>
                                        {cameraZones.map(z => (
                                            <option key={z.id} value={z.id}>
                                                {(z.display_names?.[i18n.language] || z.name || z.code)} ({z.code})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="form-group">
                                <label>{t('detail.displayOrder')}</label>
                                <input
                                    type="number"
                                    value={form.display_order ?? 0}
                                    onChange={e => setForm(f => ({ ...f, display_order: e.target.value as any }))}
                                />
                            </div>

                            <div className="form-group checkbox-group full-width">
                                <input
                                    type="checkbox"
                                    id="camera-active"
                                    checked={form.is_active ?? true}
                                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                                />
                                <label htmlFor="camera-active">{t('camera.fActive')}</label>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button onClick={() => setModalOpen(false)} disabled={saving}>{t('btn.cancel')}</button>
                            <button className="primary" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="spinner" size={14} /> : null}
                                {saving ? t('auto.saving') : t('btn.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
