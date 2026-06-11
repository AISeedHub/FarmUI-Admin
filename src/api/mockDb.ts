import { Farm, Device, Register } from '../types';

// Mock Data Initializer
const initializeData = () => {
    const defaultFarms: Farm[] = [
        {
            id: "f1",
            code: "FARM-A",
            name: "Alpha Greenhouse",
            location: "Sector 7G",
            timezone: "Asia/Seoul",
            default_language: "en",
            primary_crop: null,
            planting_date: null,
            latitude: null,
            longitude: null,
            weather_grid_nx: null,
            weather_grid_ny: null,
            is_active: true,
            created_at: new Date().toISOString()
        }
    ];

    const defaultDevices: Device[] = [
        {
            id: "d1",
            farm_id: "f1",
            zone_id: null,
            code: "CLIMATE_CTRL",
            name: "Climate Control Unit",
            description: "Controls temperature and humidity",
            device_kind: "actuator",
            device_type: "switch",
            unit_id: 1,
            display_order: 0,
            is_active: true,
            created_at: new Date().toISOString()
        }
    ];

    const defaultRegisters: Register[] = [
        {
            id: "r1",
            device_id: "d1",
            code: "TEMP_SETPOINT",
            description: "Target temperature in Celsius",
            address: 40001,
            bit_start: 0,
            bit_end: 15,
            unit: "C",
            writable: true,
            data_type: "FLOAT",
            role: "set_point",
            scale_factor: 1.0,
            is_signed: true,
            min_value: 0,
            max_value: 50,
            is_active: true,
            created_at: new Date().toISOString()
        }
    ];

    localStorage.setItem('farms', JSON.stringify(defaultFarms));
    localStorage.setItem('devices', JSON.stringify(defaultDevices));
    localStorage.setItem('registers', JSON.stringify(defaultRegisters));
};

if (!localStorage.getItem('farms')) {
    initializeData();
}

const generateUUID = () => crypto.randomUUID();

export const mockDb = {
    getFarms: (): Farm[] => JSON.parse(localStorage.getItem('farms') || '[]'),
    getFarm: (id: string): Farm | undefined => mockDb.getFarms().find(f => f.id === id),
    createFarm: (farm: Omit<Farm, 'id' | 'created_at'>): Farm => {
        const newFarm = { ...farm, id: generateUUID(), created_at: new Date().toISOString() };
        const farms = [...mockDb.getFarms(), newFarm];
        localStorage.setItem('farms', JSON.stringify(farms));
        return newFarm;
    },
    updateFarm: (id: string, updates: Partial<Farm>): Farm | undefined => {
        const farms = mockDb.getFarms();
        const idx = farms.findIndex(f => f.id === id);
        if (idx === -1) return undefined;
        farms[idx] = { ...farms[idx], ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('farms', JSON.stringify(farms));
        return farms[idx];
    },
    deleteFarm: (id: string) => {
        const farms = mockDb.getFarms().filter(f => f.id !== id);
        localStorage.setItem('farms', JSON.stringify(farms));
    },

    getAllDevices: (): Device[] => JSON.parse(localStorage.getItem('devices') || '[]'),
    getDevices: (farmId: string): Device[] => mockDb.getAllDevices().filter(d => d.farm_id === farmId),
    createDevice: (device: Omit<Device, 'id' | 'created_at'>): Device => {
        const newDevice = { ...device, id: generateUUID(), created_at: new Date().toISOString() };
        const devices = [...mockDb.getAllDevices(), newDevice];
        localStorage.setItem('devices', JSON.stringify(devices));
        return newDevice;
    },
    updateDevice: (id: string, updates: Partial<Device>): Device | undefined => {
        const devices = mockDb.getAllDevices();
        const idx = devices.findIndex(d => d.id === id);
        if (idx === -1) return undefined;
        devices[idx] = { ...devices[idx], ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('devices', JSON.stringify(devices));
        return devices[idx];
    },
    deleteDevice: (id: string) => {
        const devices = mockDb.getAllDevices().filter(d => d.id !== id);
        localStorage.setItem('devices', JSON.stringify(devices));
    },

    getAllRegisters: (): Register[] => JSON.parse(localStorage.getItem('registers') || '[]'),
    getRegisters: (deviceId: string): Register[] => mockDb.getAllRegisters().filter(r => r.device_id === deviceId),
    createRegister: (register: Omit<Register, 'id' | 'created_at'>): Register => {
        const newRegister = { ...register, id: generateUUID(), created_at: new Date().toISOString() };
        const registers = [...mockDb.getAllRegisters(), newRegister];
        localStorage.setItem('registers', JSON.stringify(registers));
        return newRegister;
    },
    updateRegister: (id: string, updates: Partial<Register>): Register | undefined => {
        const registers = mockDb.getAllRegisters();
        const idx = registers.findIndex(r => r.id === id);
        if (idx === -1) return undefined;
        registers[idx] = { ...registers[idx], ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('registers', JSON.stringify(registers));
        return registers[idx];
    },
    deleteRegister: (id: string) => {
        const registers = mockDb.getAllRegisters().filter(r => r.id !== id);
        localStorage.setItem('registers', JSON.stringify(registers));
    }
};
