import { Farm, Module, Register } from '../types';

// Mock Data Initializer
const initializeData = () => {
    const defaultFarms: Farm[] = [
        {
            id: "f1",
            farm_code: "FARM-A",
            name: "Alpha Greenhouse",
            location: "Sector 7G",
            is_active: true,
            created_at: new Date().toISOString()
        }
    ];

    const defaultModules: Module[] = [
        {
            id: "m1",
            farm_id: "f1",
            name: "Climate Control Unit",
            description: "Controls temperature and humidity",
            is_active: true,
            created_at: new Date().toISOString()
        }
    ];

    const defaultRegisters: Register[] = [
        {
            id: "r1",
            module_id: "m1",
            name: "Temp Setpoint",
            description: "Target temperature in Celsius",
            address: 40001,
            bit_start: 0,
            bit_end: 15,
            unit: "C",
            writable: true,
            data_type: "float32",
            role: "config",
            scale_factor: 1.0,
            is_signed: true,
            min_value: 0,
            max_value: 50,
            is_active: true,
            created_at: new Date().toISOString()
        }
    ];

    localStorage.setItem('farms', JSON.stringify(defaultFarms));
    localStorage.setItem('modules', JSON.stringify(defaultModules));
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

    getAllModules: (): Module[] => JSON.parse(localStorage.getItem('modules') || '[]'),
    getModules: (farmId: string): Module[] => mockDb.getAllModules().filter(m => m.farm_id === farmId),
    createModule: (module: Omit<Module, 'id' | 'created_at'>): Module => {
        const newModule = { ...module, id: generateUUID(), created_at: new Date().toISOString() };
        const modules = [...mockDb.getAllModules(), newModule];
        localStorage.setItem('modules', JSON.stringify(modules));
        return newModule;
    },
    updateModule: (id: string, updates: Partial<Module>): Module | undefined => {
        const modules = mockDb.getAllModules();
        const idx = modules.findIndex(m => m.id === id);
        if (idx === -1) return undefined;
        modules[idx] = { ...modules[idx], ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('modules', JSON.stringify(modules));
        return modules[idx];
    },
    deleteModule: (id: string) => {
        const modules = mockDb.getAllModules().filter(m => m.id !== id);
        localStorage.setItem('modules', JSON.stringify(modules));
    },

    getAllRegisters: (): Register[] => JSON.parse(localStorage.getItem('registers') || '[]'),
    getRegisters: (moduleId: string): Register[] => mockDb.getAllRegisters().filter(r => r.module_id === moduleId),
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
