import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2, Activity } from 'lucide-react';
import { Farm, Module, Register } from '../../types';
import { farmsApi, modulesApi, registersApi } from '../../api/services';
import './FarmDetail.css';

export default function FarmDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();


    const [farm, setFarm] = useState<Farm | null>(null);
    const [modules, setModules] = useState<Module[]>([]);
    const [registers, setRegisters] = useState<Record<string, Register[]>>({});
    const [loading, setLoading] = useState(true);

    // Modal states
    const [moduleModal, setModuleModal] = useState<{ isOpen: boolean, type: 'new' | 'edit', data: Partial<Module> }>({ isOpen: false, type: 'new', data: {} });
    const [registerModal, setRegisterModal] = useState<{ isOpen: boolean, type: 'new' | 'edit', data: Partial<Register>, moduleId?: string }>({ isOpen: false, type: 'new', data: {} });

    // SVG Connections State & Refs
    const svgRef = useRef<SVGSVGElement>(null);
    const coreRef = useRef<HTMLDivElement>(null);
    const moduleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const [connections, setConnections] = useState<{ id: string, startX: number, startY: number, endX: number, endY: number }[]>([]);

    const updateConnections = () => {
        if (!svgRef.current || !coreRef.current || modules.length === 0) return;
        const svgRect = svgRef.current.getBoundingClientRect();
        const coreRect = coreRef.current.getBoundingClientRect();

        const startX = coreRect.right - svgRect.left;
        const startY = coreRect.top - svgRect.top + 64; // 4rem (64px) from top of node

        const newConns = modules.map(mod => {
            const el = moduleRefs.current[mod.id];
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const endX = rect.left - svgRect.left;
            const endY = rect.top - svgRect.top + 64; // 4rem from top of node
            return { id: mod.id, startX, startY, endX, endY };
        }).filter(Boolean) as any[];

        setConnections(newConns);
    };

    useLayoutEffect(() => {
        const timer = setTimeout(updateConnections, 100);

        // Listen to window resize and generic scroll
        window.addEventListener('resize', updateConnections);

        // Listen to container scroll specifically
        const canvas = document.querySelector('.blueprint-canvas');
        if (canvas) {
            canvas.addEventListener('scroll', updateConnections);
        }

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateConnections);
            if (canvas) {
                canvas.removeEventListener('scroll', updateConnections);
            }
        };
    }, [modules, registers, farm]);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const loadData = async () => {
        setLoading(true);
        if (!id) return;

        const f = await farmsApi.getById(id);
        if (!f) {
            navigate('/');
            return;
        }
        setFarm(f);

        const mods = await modulesApi.getByFarm(id);
        setModules(mods);

        const regsMap: Record<string, Register[]> = {};
        for (const m of mods) {
            const regs = await registersApi.getByModule(m.id);
            regsMap[m.id] = regs;
        }
        setRegisters(regsMap);
        setLoading(false);
    };

    // MODULE CRUD
    const saveModule = async () => {
        if (!id) return;
        if (moduleModal.type === 'new') {
            await modulesApi.create({ ...moduleModal.data, farm_id: id } as Omit<Module, 'id' | 'created_at'>);
        } else {
            await modulesApi.update(moduleModal.data.id!, moduleModal.data);
        }
        setModuleModal({ ...moduleModal, isOpen: false });
        loadData();
    };
    const deleteModule = async (moduleId: string) => {
        if (window.confirm('Delete mapping module and all its registers?')) {
            await modulesApi.delete(moduleId);
            loadData();
        }
    };

    // REGISTER CRUD
    const saveRegister = async () => {
        if (!registerModal.moduleId) return;
        if (registerModal.type === 'new') {
            const data: Omit<Register, 'id' | 'created_at'> = {
                ...registerModal.data,
                module_id: registerModal.moduleId,
                address: registerModal.data.address || 0,
                bit_start: registerModal.data.bit_start || 0,
                bit_end: registerModal.data.bit_end || 15,
                unit: registerModal.data.unit || '',
                writable: registerModal.data.writable ?? true,
                data_type: registerModal.data.data_type || 'int16',
                role: registerModal.data.role || 'config',
                scale_factor: registerModal.data.scale_factor || 1,
                is_signed: registerModal.data.is_signed ?? true,
                min_value: registerModal.data.min_value || 0,
                max_value: registerModal.data.max_value || 100,
                is_active: registerModal.data.is_active ?? true
            } as Omit<Register, 'id' | 'created_at'>;
            await registersApi.create(data);
        } else {
            await registersApi.update(registerModal.data.id!, registerModal.data);
        }
        setRegisterModal({ ...registerModal, isOpen: false });
        loadData();
    };
    const deleteRegister = async (regId: string) => {
        if (window.confirm('Delete register?')) {
            await registersApi.delete(regId);
            loadData();
        }
    };

    if (loading) return <div className="loading">Loading Blueprint...</div>;
    if (!farm) return null;

    return (
        <div className="farm-detail-container">
            <div className="detail-header panel">
                <button className="back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <div className="farm-title-info">
                    <h2>{farm.name} <span className="farm-code">[{farm.farm_code}]</span></h2>
                    <p className="subtitle">Location: {farm.location} | Status: {farm.is_active ? 'Active' : 'Inactive'}</p>
                </div>
            </div>

            <div className="blueprint-canvas new-horizontal-layout">
                <div className="canvas-inner">
                    {/* Dynamic SVG Connections Overlay */}
                    <svg ref={svgRef} className="connections-svg">
                        <defs>
                            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                                <polygon points="0 0, 8 3, 0 6" fill="var(--primary)" />
                            </marker>
                        </defs>
                        {connections.map(conn => {
                            const dx = conn.endX - conn.startX;
                            // Cubic Bezier control points for a smooth S-curve
                            const cp1X = conn.startX + dx * 0.45;
                            const cp1Y = conn.startY;
                            const cp2X = conn.endX - dx * 0.45;
                            const cp2Y = conn.endY;
                            const pathD = `M ${conn.startX},${conn.startY} C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${conn.endX},${conn.endY}`;

                            return (
                                <g key={conn.id}>
                                    {/* Thin crisp foreground layer with directional arrow */}
                                    <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
                                </g>
                            );
                        })}
                    </svg>

                    {/* Core Column - Fixed on left */}
                    <div className="core-column">
                        <div ref={coreRef} className="node farm-node active-glow">
                            <Activity size={32} />
                            <h3>SMARTFARM CORE</h3>
                            <p>{farm.name}</p>
                            <button className="add-reg-btn flex-center accent" onClick={() => setModuleModal({ isOpen: true, type: 'new', data: { is_active: true } })}>
                                <Plus size={14} /> Add Module
                            </button>
                        </div>
                    </div>

                    {/* Modules Column */}
                    <div className="modules-column">
                        {modules.map((mod) => (
                            <div key={mod.id} className="module-row">
                                <div ref={el => moduleRefs.current[mod.id] = el} className={`node module-node panel ${registers[mod.id]?.length > 0 ? 'has-children' : ''}`}>
                                    <div className="node-head">
                                        <h4>{mod.name}</h4>
                                        <div className="node-actions">
                                            <button onClick={() => setModuleModal({ isOpen: true, type: 'edit', data: mod })}><Edit2 size={12} /></button>
                                            <button className="del" onClick={() => deleteModule(mod.id)}><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                    <p className="node-desc">{mod.description}</p>

                                    <button className="add-reg-btn flex-center accent" onClick={() => setRegisterModal({ isOpen: true, type: 'new', data: { is_active: true }, moduleId: mod.id })}>
                                        <Plus size={14} /> Add Register
                                    </button>
                                </div>

                                <div className="registers-row">
                                    {registers[mod.id]?.map(reg => (
                                        <div key={reg.id} className="register-wrapper">
                                            <div className="connection-line-register"></div>
                                            <div className="node register-node compact panel" onDoubleClick={() => setRegisterModal({ isOpen: true, type: 'edit', data: reg, moduleId: mod.id })}>
                                                <div className="node-head">
                                                    <h5>{reg.name} <span className="reg-addr">0x{reg.address.toString(16).toUpperCase()}</span></h5>
                                                    <div className="node-actions hidden-actions">
                                                        <button onClick={() => setRegisterModal({ isOpen: true, type: 'edit', data: reg, moduleId: mod.id })}><Edit2 size={12} /></button>
                                                        <button className="del" onClick={() => deleteRegister(reg.id)}><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                                <p className="node-desc">{reg.description || 'No description'}</p>
                                                <div className="reg-meta">
                                                    <span>Role: {reg.role}</span>
                                                    <span>[{reg.data_type}]</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Module Modal */}
            {moduleModal.isOpen && (
                <div className="modal-overlay">
                    <div className="modal-content panel">
                        <h3>{moduleModal.type === 'new' ? 'New Module' : 'Edit Module'}</h3>
                        <div className="form-group">
                            <label>Module Name</label>
                            <input value={moduleModal.data.name || ''} onChange={e => setModuleModal({ ...moduleModal, data: { ...moduleModal.data, name: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input value={moduleModal.data.description || ''} onChange={e => setModuleModal({ ...moduleModal, data: { ...moduleModal.data, description: e.target.value } })} />
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setModuleModal({ ...moduleModal, isOpen: false })}>Cancel</button>
                            <button className="primary" onClick={saveModule}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Register Modal */}
            {registerModal.isOpen && (
                <div className="modal-overlay">
                    <div className="modal-content panel modal-large">
                        <h3>{registerModal.type === 'new' ? 'New Register' : 'Edit Register'}</h3>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Name</label>
                                <input value={registerModal.data.name || ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, name: e.target.value } })} />
                            </div>
                            <div className="form-group">
                                <label>Address (Base 10)</label>
                                <input type="number" value={registerModal.data.address || ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, address: parseInt(e.target.value) } })} />
                            </div>
                            <div className="form-group full-width">
                                <label>Description</label>
                                <input value={registerModal.data.description || ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, description: e.target.value } })} />
                            </div>
                            <div className="form-group">
                                <label>Data Type</label>
                                <select value={registerModal.data.data_type || 'int16'} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, data_type: e.target.value as any } })}>
                                    <option value="int16">INT16</option>
                                    <option value="uint16">UINT16</option>
                                    <option value="int32">INT32</option>
                                    <option value="float32">FLOAT32</option>
                                    <option value="boolean">BOOLEAN</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Role</label>
                                <select value={registerModal.data.role || 'config'} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, role: e.target.value as any } })}>
                                    <option value="sensor">SENSOR</option>
                                    <option value="control">CONTROL</option>
                                    <option value="config">CONFIG</option>
                                    <option value="status">STATUS</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setRegisterModal({ ...registerModal, isOpen: false })}>Cancel</button>
                            <button className="primary" onClick={saveRegister}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
