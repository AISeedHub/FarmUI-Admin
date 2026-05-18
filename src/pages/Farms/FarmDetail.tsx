import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2, Activity, Power, Download } from 'lucide-react';
import YAML from 'yaml';
import { Farm, Zone, Device, Register } from '../../types';
import { farmsApi, zonesApi, devicesApi, registersApi } from '../../api/services';
import './FarmDetail.css';

export default function FarmDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [farm, setFarm] = useState<Farm | null>(null);
    const [zones, setZones] = useState<Zone[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [registers, setRegisters] = useState<Record<string, Register[]>>({});
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Interactive drill-down selection states
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    // Modal states
    const [zoneModal, setZoneModal] = useState<{ isOpen: boolean, type: 'new' | 'edit', data: Partial<Zone> }>({ isOpen: false, type: 'new', data: {} });
    const [deviceModal, setDeviceModal] = useState<{ isOpen: boolean, type: 'new' | 'edit', data: Partial<Device> }>({ isOpen: false, type: 'new', data: {} });
    const [registerModal, setRegisterModal] = useState<{ isOpen: boolean, type: 'new' | 'edit', data: Partial<Register>, deviceId?: string }>({ isOpen: false, type: 'new', data: {} });

    // SVG Connections State & Refs
    const svgRef = useRef<SVGSVGElement>(null);
    const coreRef = useRef<HTMLDivElement>(null);
    const zoneRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const deviceRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const registerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

    const [zoneConnections, setZoneConnections] = useState<{ id: string, startX: number, startY: number, endX: number, endY: number }[]>([]);
    const [deviceConnections, setDeviceConnections] = useState<{ id: string, zoneId: string, startX: number, startY: number, endX: number, endY: number }[]>([]);
    const [registerConnections, setRegisterConnections] = useState<{ id: string, deviceId: string, startX: number, startY: number, endX: number, endY: number }[]>([]);

    const updateConnections = () => {
        if (!svgRef.current || !coreRef.current) return;
        const svgRect = svgRef.current.getBoundingClientRect();
        const coreRect = coreRef.current.getBoundingClientRect();

        const coreStartX = coreRect.right - svgRect.left;
        const coreStartY = coreRect.top - svgRect.top + (coreRect.height / 2);

        // 1. Core to all Zones
        const activeZones = zones.map(z => ({ id: z.id })).concat(
            devices.some(d => !d.zone_id) ? [{ id: 'unassigned' }] : []
        );

        const zoneConns = activeZones.map(zone => {
            const el = zoneRefs.current[zone.id];
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const endX = rect.left - svgRect.left;
            const endY = rect.top - svgRect.top + (rect.height / 2);
            return { id: zone.id, startX: coreStartX, startY: coreStartY, endX, endY };
        }).filter(Boolean) as any[];

        setZoneConnections(zoneConns);

        // 2. Selected Zone to its Devices
        const devConns: any[] = [];
        if (selectedZoneId) {
            const zoneEl = zoneRefs.current[selectedZoneId];
            if (zoneEl) {
                const zoneRect = zoneEl.getBoundingClientRect();
                const startX = zoneRect.right - svgRect.left;
                const startY = zoneRect.top - svgRect.top + (zoneRect.height / 2);

                const zoneDevs = devices.filter(d => selectedZoneId === 'unassigned' ? !d.zone_id : d.zone_id === selectedZoneId);
                zoneDevs.forEach(dev => {
                    const devEl = deviceRefs.current[dev.id];
                    if (devEl) {
                        const devRect = devEl.getBoundingClientRect();
                        const endX = devRect.left - svgRect.left;
                        const endY = devRect.top - svgRect.top + (devRect.height / 2);
                        devConns.push({ id: dev.id, zoneId: selectedZoneId, startX, startY, endX, endY });
                    }
                });
            }
        }
        setDeviceConnections(devConns);

        // 3. Selected Device to its Registers
        const regConns: any[] = [];
        if (selectedDeviceId) {
            const devEl = deviceRefs.current[selectedDeviceId];
            if (devEl) {
                const devRect = devEl.getBoundingClientRect();
                const startX = devRect.right - svgRect.left;
                const startY = devRect.top - svgRect.top + (devRect.height / 2);

                const devRegs = registers[selectedDeviceId] || [];
                devRegs.forEach(reg => {
                    const regEl = registerRefs.current[reg.id];
                    if (regEl) {
                        const regRect = regEl.getBoundingClientRect();
                        const endX = regRect.left - svgRect.left;
                        const endY = regRect.top - svgRect.top + (regRect.height / 2);
                        regConns.push({ id: reg.id, deviceId: selectedDeviceId, startX, startY, endX, endY });
                    }
                });
            }
        }
        setRegisterConnections(regConns);
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
    }, [zones, devices, registers, farm, selectedZoneId, selectedDeviceId]);

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

        // Fetch zones
        const zs = await zonesApi.getByFarm(id);
        zs.sort((a, b) => a.display_order - b.display_order);
        setZones(zs);

        const devs = await devicesApi.getByFarm(id);
        setDevices(devs);

        // Load registers map
        const regsMap: Record<string, Register[]> = {};
        for (const d of devs) {
            const regs = await registersApi.getByDevice(d.id);
            regsMap[d.id] = regs;
        }
        setRegisters(regsMap);

        // Set dynamic selections: keep current if still existing, otherwise auto-select first
        let activeZoneId = selectedZoneId;
        const exists = activeZoneId && (activeZoneId === 'unassigned' || zs.some(z => z.id === activeZoneId));
        if (!exists) {
            if (zs.length > 0) activeZoneId = zs[0].id;
            else if (devs.some(d => !d.zone_id)) activeZoneId = 'unassigned';
            else activeZoneId = null;
        }
        setSelectedZoneId(activeZoneId);

        if (activeZoneId) {
            const zoneDevs = devs.filter(d => activeZoneId === 'unassigned' ? !d.zone_id : d.zone_id === activeZoneId);
            setSelectedDeviceId(prev => {
                const devExists = prev && zoneDevs.some(d => d.id === prev);
                if (devExists) return prev;
                return zoneDevs.length > 0 ? zoneDevs[0].id : null;
            });
        } else {
            setSelectedDeviceId(null);
        }

        setLoading(false);
    };

    // Selection click handlers
    const handleZoneClick = (zoneId: string) => {
        setSelectedZoneId(zoneId);
        const zoneDevs = devices.filter(d => zoneId === 'unassigned' ? !d.zone_id : d.zone_id === zoneId);
        if (zoneDevs.length > 0) {
            setSelectedDeviceId(zoneDevs[0].id);
        } else {
            setSelectedDeviceId(null);
        }
    };

    const handleDeviceClick = (deviceId: string) => {
        setSelectedDeviceId(deviceId);
    };

    // ZONE CRUD
    const saveZone = async () => {
        if (!id) return;
        const processedData = {
            ...zoneModal.data,
            default_slave_id: zoneModal.data.default_slave_id !== undefined && String(zoneModal.data.default_slave_id) !== '' ? Number(zoneModal.data.default_slave_id) : 1,
            display_order: zoneModal.data.display_order !== undefined && String(zoneModal.data.display_order) !== '' ? Number(zoneModal.data.display_order) : 1,
        };

        if (zoneModal.type === 'new') {
            await zonesApi.create({ ...processedData, farm_id: id, is_active: true } as Omit<Zone, 'id' | 'created_at'>);
        } else {
            await zonesApi.update(processedData.id!, processedData as Zone);
        }
        setZoneModal({ ...zoneModal, isOpen: false });
        loadData();
    };

    const deleteZone = async (zoneId: string) => {
        if (window.confirm('Delete zone and all its devices and registers?')) {
            await zonesApi.delete(zoneId);
            loadData();
        }
    };

    // DEVICE CRUD
    const saveDevice = async () => {
        if (!id) return;
        const processedData = {
            ...deviceModal.data,
            slave_id: deviceModal.data.slave_id !== undefined && String(deviceModal.data.slave_id) !== '' ? Number(deviceModal.data.slave_id) : 1,
            zone_id: deviceModal.data.zone_id || null,
        };
        if (deviceModal.type === 'new') {
            await devicesApi.create({ ...processedData, farm_id: id } as Omit<Device, 'id' | 'created_at'>);
        } else {
            await devicesApi.update(processedData.id!, processedData as Device);
        }
        setDeviceModal({ ...deviceModal, isOpen: false });
        loadData();
    };

    const deleteDevice = async (deviceId: string) => {
        if (window.confirm('Delete device and all its registers?')) {
            await devicesApi.delete(deviceId);
            loadData();
        }
    };

    // REGISTER CRUD
    const saveRegister = async () => {
        if (!registerModal.deviceId) return;

        const processedData = {
            ...registerModal.data,
            address: registerModal.data.address !== undefined && String(registerModal.data.address) !== '' ? Number(registerModal.data.address) : 0,
            bit_start: registerModal.data.bit_start !== undefined && String(registerModal.data.bit_start) !== '' ? Number(registerModal.data.bit_start) : 0,
            bit_end: registerModal.data.bit_end !== undefined && String(registerModal.data.bit_end) !== '' ? Number(registerModal.data.bit_end) : 15,
            scale_factor: registerModal.data.scale_factor !== undefined && String(registerModal.data.scale_factor) !== '' ? Number(registerModal.data.scale_factor) : 1,
            min_value: registerModal.data.min_value !== undefined && String(registerModal.data.min_value) !== '' ? Number(registerModal.data.min_value) : 0,
            max_value: registerModal.data.max_value !== undefined && String(registerModal.data.max_value) !== '' ? Number(registerModal.data.max_value) : 100,
        };

        if (registerModal.type === 'new') {
            const data: Omit<Register, 'id' | 'created_at'> = {
                ...processedData,
                device_id: registerModal.deviceId,
                code: processedData.code || '',
                unit: processedData.unit || '',
                writable: processedData.writable ?? false,
                data_type: processedData.data_type || 'FLOAT',
                role: processedData.role || 'value',
                is_signed: processedData.is_signed ?? false,
                is_active: processedData.is_active ?? true
            } as Omit<Register, 'id' | 'created_at'>;
            await registersApi.create(data);
        } else {
            await registersApi.update(processedData.id!, processedData as Register);
        }
        setRegisterModal({ ...registerModal, isOpen: false, data: {} });
        loadData();
    };

    const deleteRegister = async (regId: string) => {
        if (window.confirm('Delete register?')) {
            await registersApi.delete(regId);
            loadData();
        }
    };

    const handleExport = async () => {
        if (!id || !farm) return;
        setExporting(true);
        try {
            const data = await farmsApi.exportConfig(id);
            const yamlStr = YAML.stringify(data);
            const blob = new Blob([yamlStr], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `farm_config_${id}.yaml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export config', error);
            alert('Failed to export configuration.');
        } finally {
            setExporting(false);
        }
    };

    const toggleRegisterActive = async (reg: Register) => {
        await registersApi.update(reg.id, { ...reg, is_active: !reg.is_active });
        loadData();
    };

    if (loading) return <div className="loading">Loading Blueprint...</div>;
    if (!farm) return null;

    const currentZoneDevices = selectedZoneId
        ? devices.filter(d => selectedZoneId === 'unassigned' ? !d.zone_id : d.zone_id === selectedZoneId)
        : [];

    const currentDeviceRegisters = selectedDeviceId
        ? registers[selectedDeviceId] || []
        : [];

    return (
        <div className="farm-detail-container">
            <div className="detail-header panel">
                <button className="back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <div className="farm-title-info">
                    <h2>{farm.name} <span className="farm-code">[{farm.code}]</span></h2>
                    <p className="subtitle">Location: {farm.location} | Status: {farm.is_active ? 'Active' : 'Inactive'}</p>
                </div>
                <button
                    className="export-btn flex-center"
                    onClick={handleExport}
                    disabled={exporting}
                >
                    <Download size={16} />
                    {exporting ? 'Exporting...' : 'Export Config'}
                </button>
            </div>

            <div className="blueprint-canvas new-horizontal-layout">
                <div className="canvas-inner">
                    {/* Dynamic SVG Connections Overlay */}
                    <svg ref={svgRef} className="connections-svg">
                        {/* 1. Core to Zone Connections */}
                        {zoneConnections.map(conn => {
                            const isSelected = conn.id === selectedZoneId;
                            const cp1X = conn.startX + (conn.endX - conn.startX) * 0.5;
                            const cp1Y = conn.startY;
                            const cp2X = conn.endX - (conn.endX - conn.startX) * 0.5;
                            const cp2Y = conn.endY;
                            const pathD = `M ${conn.startX},${conn.startY} C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${conn.endX},${conn.endY}`;

                            const midX = conn.startX + (conn.endX - conn.startX) * 0.5;
                            const midY = conn.startY + (conn.endY - conn.startY) * 0.5;

                            const deviceCount = conn.id === 'unassigned'
                                ? devices.filter(d => !d.zone_id).length
                                : devices.filter(d => d.zone_id === conn.id).length;

                            const color = isSelected ? 'var(--primary)' : 'rgba(0, 119, 182, 0.15)';
                            const strokeWidth = isSelected ? '3' : '1.5';

                            return (
                                <g key={`zone-conn-${conn.id}`}>
                                    <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={isSelected ? undefined : '4,4'} />
                                    <circle cx={conn.startX} cy={conn.startY} r={isSelected ? '5' : '3'} fill="var(--panel-bg)" stroke={color} strokeWidth="2" />
                                    <circle cx={conn.endX} cy={conn.endY} r={isSelected ? '5' : '3'} fill="var(--panel-bg)" stroke={color} strokeWidth="2" />
                                    {isSelected && (
                                        <g>
                                            <rect x={midX - 45} y={midY - 12} width="90" height="24" rx="12" fill="var(--panel-bg)" stroke="var(--primary)" strokeWidth="1" />
                                            <text x={midX} y={midY + 1} fill="var(--primary)" fontSize="10" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
                                                {deviceCount} {deviceCount === 1 ? 'Device' : 'Devices'}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* 2. Selected Zone to its Devices */}
                        {deviceConnections.map(conn => {
                            const isSelected = conn.id === selectedDeviceId;
                            const cp1X = conn.startX + (conn.endX - conn.startX) * 0.5;
                            const cp1Y = conn.startY;
                            const cp2X = conn.endX - (conn.endX - conn.startX) * 0.5;
                            const cp2Y = conn.endY;
                            const pathD = `M ${conn.startX},${conn.startY} C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${conn.endX},${conn.endY}`;

                            const midX = conn.startX + (conn.endX - conn.startX) * 0.5;
                            const midY = conn.startY + (conn.endY - conn.startY) * 0.5;

                            const regCount = registers[conn.id]?.length || 0;
                            const color = isSelected ? 'var(--secondary)' : 'rgba(0, 180, 216, 0.2)';
                            const strokeWidth = isSelected ? '3' : '1.5';

                            return (
                                <g key={`dev-conn-${conn.id}`}>
                                    <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} />
                                    <circle cx={conn.startX} cy={conn.startY} r={isSelected ? '5' : '3'} fill="var(--panel-bg)" stroke={color} strokeWidth="2" />
                                    <circle cx={conn.endX} cy={conn.endY} r={isSelected ? '5' : '3'} fill="var(--panel-bg)" stroke={color} strokeWidth="2" />
                                    {isSelected && (
                                        <g>
                                            <rect x={midX - 45} y={midY - 12} width="90" height="24" rx="12" fill="var(--panel-bg)" stroke="var(--secondary)" strokeWidth="1" />
                                            <text x={midX} y={midY + 1} fill="var(--secondary)" fontSize="10" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
                                                {regCount} {regCount === 1 ? 'Register' : 'Registers'}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* 3. Selected Device to its Registers */}
                        {registerConnections.map(conn => {
                            const cp1X = conn.startX + (conn.endX - conn.startX) * 0.5;
                            const cp1Y = conn.startY;
                            const cp2X = conn.endX - (conn.endX - conn.startX) * 0.5;
                            const cp2Y = conn.endY;
                            const pathD = `M ${conn.startX},${conn.startY} C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${conn.endX},${conn.endY}`;

                            const color = 'var(--accent)';

                            return (
                                <g key={`reg-conn-${conn.id}`}>
                                    <path d={pathD} fill="none" stroke={color} strokeWidth="2" />
                                    <circle cx={conn.startX} cy={conn.startY} r="4" fill="var(--panel-bg)" stroke={color} strokeWidth="2" />
                                    <circle cx={conn.endX} cy={conn.endY} r="4" fill="var(--panel-bg)" stroke={color} strokeWidth="2" />
                                </g>
                            );
                        })}
                    </svg>

                    {/* Column 1: Core - Fixed on left */}
                    <div className="core-column">
                        <div ref={coreRef} className="node farm-node active-glow">
                            <Activity size={32} />
                            <h3>SMARTFARM CORE</h3>
                            <p>{farm.name}</p>
                        </div>
                    </div>

                    {/* Column 2: Zones */}
                    <div className="zones-column">
                        <div className="column-header-row">
                            <h3 className="column-title">Zones</h3>
                            <button className="add-btn-small" onClick={() => setZoneModal({ isOpen: true, type: 'new', data: { is_active: true, display_order: zones.length + 1, default_slave_id: 1 } })}>
                                <Plus size={12} /> Add Zone
                            </button>
                        </div>
                        {zones.map((zone) => (
                            <div
                                key={zone.id}
                                ref={el => zoneRefs.current[zone.id] = el}
                                className={`node zone-node panel ${selectedZoneId === zone.id ? 'selected' : ''}`}
                                onClick={() => handleZoneClick(zone.id)}
                            >
                                <div className="node-head">
                                    <h4>{zone.name} <span className="zone-code">[{zone.code}]</span></h4>
                                    <div className="node-actions">
                                        <button onClick={(e) => { e.stopPropagation(); setZoneModal({ isOpen: true, type: 'edit', data: zone }); }}><Edit2 size={12} /></button>
                                        <button className="del" onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }}><Trash2 size={12} /></button>
                                    </div>
                                </div>
                                <p className="node-desc">{zone.description || 'No description'}</p>
                                <div className="zone-meta">
                                    <span>Slave ID: {zone.default_slave_id}</span>
                                    <span>Order: {zone.display_order}</span>
                                </div>
                            </div>
                        ))}

                        {/* Unassigned Zone Option */}
                        {devices.some(d => !d.zone_id) && (
                            <div
                                ref={el => zoneRefs.current['unassigned'] = el}
                                className={`node zone-node panel unassigned-node ${selectedZoneId === 'unassigned' ? 'selected' : ''}`}
                                onClick={() => handleZoneClick('unassigned')}
                            >
                                <div className="node-head">
                                    <h4>Unassigned <span className="zone-code">[SYSTEM]</span></h4>
                                </div>
                                <p className="node-desc">Devices not assigned to any specific zone.</p>
                            </div>
                        )}
                    </div>

                    {/* Column 3: Devices */}
                    <div className="devices-column">
                        <div className="column-header-row">
                            <h3 className="column-title">Devices</h3>
                            {selectedZoneId && selectedZoneId !== 'unassigned' && (
                                <button className="add-btn-small" onClick={() => setDeviceModal({ isOpen: true, type: 'new', data: { is_active: true, device_kind: 'sensor', device_type: 'sensor_group', slave_id: zones.find(z => z.id === selectedZoneId)?.default_slave_id || 1, zone_id: selectedZoneId } })}>
                                    <Plus size={12} /> Add Device
                                </button>
                            )}
                        </div>

                        {!selectedZoneId ? (
                            <div className="empty-column-placeholder">Select a Zone to view Devices</div>
                        ) : currentZoneDevices.length === 0 ? (
                            <div className="empty-column-placeholder">No devices in this zone</div>
                        ) : (
                            currentZoneDevices.map((dev) => (
                                <div
                                    key={dev.id}
                                    ref={el => deviceRefs.current[dev.id] = el}
                                    className={`node module-node panel ${selectedDeviceId === dev.id ? 'selected' : ''}`}
                                    onClick={() => handleDeviceClick(dev.id)}
                                >
                                    <div className="node-head">
                                        <h4>{dev.name || dev.code}</h4>
                                        <div className="node-actions">
                                            <button onClick={(e) => { e.stopPropagation(); setDeviceModal({ isOpen: true, type: 'edit', data: dev }); }}><Edit2 size={12} /></button>
                                            <button className="del" onClick={(e) => { e.stopPropagation(); deleteDevice(dev.id); }}><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                    <p className="node-desc">{dev.description || 'No description'}</p>
                                    <div className="device-meta">
                                        <span>Slave ID: {dev.slave_id}</span>
                                        <span>Kind: {dev.device_kind}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Column 4: Register Configs */}
                    <div className="registers-column">
                        <div className="column-header-row">
                            <h3 className="column-title">Register Configs</h3>
                            {selectedDeviceId && (
                                <button className="add-btn-small" onClick={() => setRegisterModal({ isOpen: true, type: 'new', data: { is_active: true }, deviceId: selectedDeviceId })}>
                                    <Plus size={12} /> Add Register
                                </button>
                            )}
                        </div>

                        {!selectedDeviceId ? (
                            <div className="empty-column-placeholder">Select a Device to view Registers</div>
                        ) : currentDeviceRegisters.length === 0 ? (
                            <div className="empty-column-placeholder">No registers configured for this device</div>
                        ) : (
                            currentDeviceRegisters.map((reg) => (
                                <div
                                    key={reg.id}
                                    ref={el => registerRefs.current[reg.id] = el}
                                    className={`node register-node compact panel ${!reg.is_active ? 'deactivated' : ''}`}
                                    onDoubleClick={() => setRegisterModal({ isOpen: true, type: 'edit', data: reg, deviceId: selectedDeviceId })}
                                >
                                    <div className="node-head">
                                        <h5>{reg.code} <span className="reg-addr">0x{reg.address.toString(16).toUpperCase()}</span></h5>
                                        <div className="node-actions hidden-actions">
                                            <button onClick={(e) => { e.stopPropagation(); toggleRegisterActive(reg); }} className={!reg.is_active ? 'deactivated-btn' : ''} title={reg.is_active ? "Activate" : "Deactivate"}><Power size={12} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); setRegisterModal({ isOpen: true, type: 'edit', data: reg, deviceId: selectedDeviceId }); }}><Edit2 size={12} /></button>
                                            <button className="del" onClick={(e) => { e.stopPropagation(); deleteRegister(reg.id); }}><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                    <p className="node-desc">{reg.description || 'No description'}</p>
                                    <div className="reg-meta">
                                        <span>Role: {reg.role}</span>
                                        <span>[{reg.data_type}]</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Zone Modal */}
            {zoneModal.isOpen && (
                <div className="modal-overlay">
                    <div className="modal-content panel">
                        <h3>{zoneModal.type === 'new' ? 'New Zone' : 'Edit Zone'}</h3>
                        <div className="form-group">
                            <label>Zone Code</label>
                            <input value={zoneModal.data.code || ''} onChange={e => setZoneModal({ ...zoneModal, data: { ...zoneModal.data, code: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Zone Name</label>
                            <input value={zoneModal.data.name || ''} onChange={e => setZoneModal({ ...zoneModal, data: { ...zoneModal.data, name: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input value={zoneModal.data.description || ''} onChange={e => setZoneModal({ ...zoneModal, data: { ...zoneModal.data, description: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Default Slave ID</label>
                            <input type="number" value={zoneModal.data.default_slave_id ?? 1} onChange={e => setZoneModal({ ...zoneModal, data: { ...zoneModal.data, default_slave_id: Number(e.target.value) } })} />
                        </div>
                        <div className="form-group">
                            <label>Display Order</label>
                            <input type="number" value={zoneModal.data.display_order ?? 1} onChange={e => setZoneModal({ ...zoneModal, data: { ...zoneModal.data, display_order: Number(e.target.value) } })} />
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setZoneModal({ ...zoneModal, isOpen: false })}>Cancel</button>
                            <button className="primary" onClick={saveZone}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Device Modal */}
            {deviceModal.isOpen && (
                <div className="modal-overlay">
                    <div className="modal-content panel">
                        <h3>{deviceModal.type === 'new' ? 'New Device' : 'Edit Device'}</h3>
                        <div className="form-group">
                            <label>Device Code</label>
                            <input value={deviceModal.data.code || ''} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, code: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Device Name</label>
                            <input value={deviceModal.data.name || ''} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, name: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input value={deviceModal.data.description || ''} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, description: e.target.value } })} />
                        </div>
                        <div className="form-group">
                            <label>Zone</label>
                            <select value={deviceModal.data.zone_id || ''} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, zone_id: e.target.value || null } })}>
                                <option value="">-- No Zone (Unassigned) --</option>
                                {zones.map(zone => (
                                    <option key={zone.id} value={zone.id}>{zone.name} ({zone.code})</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Device Kind</label>
                            <select value={deviceModal.data.device_kind || 'sensor'} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, device_kind: e.target.value as any } })}>
                                <option value="sensor">Sensor</option>
                                <option value="actuator">Actuator</option>
                                <option value="system">System</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Device Type</label>
                            <select value={deviceModal.data.device_type || 'sensor_group'} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, device_type: e.target.value as any } })}>
                                <option value="switch">Switch</option>
                                <option value="open_close">Open/Close</option>
                                <option value="sensor_group">Sensor Group</option>
                                <option value="control_mode">Control Mode</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Slave ID</label>
                            <input type="number" value={deviceModal.data.slave_id ?? 1} onChange={e => setDeviceModal({ ...deviceModal, data: { ...deviceModal.data, slave_id: Number(e.target.value) } })} />
                        </div>
                        <div className="modal-actions">
                            <button onClick={() => setDeviceModal({ ...deviceModal, isOpen: false })}>Cancel</button>
                            <button className="primary" onClick={saveDevice}>Save</button>
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
                                <label>Code</label>
                                <input value={registerModal.data.code || ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, code: e.target.value } })} />
                            </div>
                            <div className="form-group">
                                <label>Address (Base 10)</label>
                                <input type="number" value={registerModal.data.address ?? ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, address: e.target.value as any } })} />
                            </div>
                            <div className="form-group full-width">
                                <label>Description</label>
                                <input value={registerModal.data.description || ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, description: e.target.value } })} />
                            </div>
                            <div className="form-group">
                                <label>Bit Start</label>
                                <input type="number" value={registerModal.data.bit_start ?? ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, bit_start: e.target.value as any } })} />
                            </div>
                            <div className="form-group">
                                <label>Bit End</label>
                                <input type="number" value={registerModal.data.bit_end ?? ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, bit_end: e.target.value as any } })} />
                            </div>
                            <div className="form-group">
                                <label>Unit</label>
                                <select value={registerModal.data.unit || ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, unit: e.target.value } })}>
                                    <option value="">-- No Unit --</option>
                                    <option value="°C">°C (Celsius)</option>
                                    <option value="°F">°F (Fahrenheit)</option>
                                    <option value="%">% (Percentage)</option>
                                    <option value="ppm">ppm (Parts Per Million)</option>
                                    <option value="pH">pH</option>
                                    <option value="Lux">Lux</option>
                                    <option value="m/s">m/s (Meters per second)</option>
                                    <option value="mm/h">mm/h (Millimeters per hour)</option>
                                    <option value="W/m²">W/m² (Watts per square meter)</option>
                                    <option value="kPa">kPa (Kilopascals)</option>
                                    <option value="hPa">hPa (Hectopascals)</option>
                                    <option value="m³">m³ (Cubic meters)</option>
                                    <option value="L">L (Liters)</option>
                                    <option value="kg">kg (Kilograms)</option>
                                    <option value="g">g (Grams)</option>
                                    <option value="A">A (Amperes)</option>
                                    <option value="V">V (Volts)</option>
                                    <option value="W">W (Watts)</option>
                                    <option value="kWh">kWh (Kilowatt-hours)</option>
                                    <option value="Hz">Hz (Hertz)</option>
                                    <option value="µmol/m²/s">µmol/m²/s (Micro moles per square meter per second)</option>
                                    <option value="minutes">Minutes</option>
                                    <option value="hours">Hours</option>
                                    <option value="days">Days</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Scale Factor</label>
                                <input type="number" step="any" value={registerModal.data.scale_factor ?? '1'} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, scale_factor: e.target.value as any } })} />
                            </div>
                            <div className="form-group">
                                <label>Min Value</label>
                                <input type="number" step="any" value={registerModal.data.min_value ?? ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, min_value: e.target.value as any } })} />
                            </div>
                            <div className="form-group">
                                <label>Max Value</label>
                                <input type="number" step="any" value={registerModal.data.max_value ?? ''} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, max_value: e.target.value as any } })} />
                            </div>
                            <div className="form-group">
                                <label>Data Type</label>
                                <select value={registerModal.data.data_type || 'FLOAT'} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, data_type: e.target.value as any } })}>
                                    <option value="FLOAT">FLOAT</option>
                                    <option value="UNSIGNED_INT">UNSIGNED_INT</option>
                                    <option value="INT">INT</option>
                                    <option value="BOOL">BOOL</option>
                                </select>
                            </div>
                            <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1.8rem', marginRight: '8rem' }}>
                                <input type="checkbox" id="signed-checkbox" checked={registerModal.data.is_signed ?? false} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, is_signed: e.target.checked } })} />
                                <label htmlFor="signed-checkbox" style={{ margin: 0, marginLeft: '1rem' }}>Is_Signed</label>
                            </div>
                            <div className="form-group">
                                <label>Role</label>
                                <select value={registerModal.data.role || 'value'} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, role: e.target.value as any } })}>
                                    <option value="value">value</option>
                                    <option value="status">status</option>
                                    <option value="command">command</option>
                                    <option value="set_point">set_point</option>
                                    <option value="open_degree">open_degree</option>
                                </select>
                            </div>
                            <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1.8rem', marginRight: '8rem', marginLeft: '-0.5rem' }}>
                                <input type="checkbox" id="writable-checkbox" checked={registerModal.data.writable ?? false} onChange={e => setRegisterModal({ ...registerModal, data: { ...registerModal.data, writable: e.target.checked } })} />
                                <label htmlFor="writable-checkbox" style={{ margin: 0, marginLeft: '1rem' }}>Writable</label>
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
