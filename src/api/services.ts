import { Farm, Module, Register } from '../types';
import { mockDb } from './mockDb';

// Simulate network delay
const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

export const farmsApi = {
    getAll: async () => {
        await delay();
        return mockDb.getFarms();
    },
    getById: async (id: string) => {
        await delay();
        return mockDb.getFarm(id);
    },
    create: async (data: Omit<Farm, 'id' | 'created_at'>) => {
        await delay();
        return mockDb.createFarm(data);
    },
    update: async (id: string, data: Partial<Farm>) => {
        await delay();
        return mockDb.updateFarm(id, data);
    },
    delete: async (id: string) => {
        await delay();
        mockDb.deleteFarm(id);
        return true;
    }
};

export const modulesApi = {
    getByFarm: async (farmId: string) => {
        await delay();
        return mockDb.getModules(farmId);
    },
    create: async (data: Omit<Module, 'id' | 'created_at'>) => {
        await delay();
        return mockDb.createModule(data);
    },
    update: async (id: string, data: Partial<Module>) => {
        await delay();
        return mockDb.updateModule(id, data);
    },
    delete: async (id: string) => {
        await delay();
        mockDb.deleteModule(id);
        return true;
    }
};

export const registersApi = {
    getByModule: async (moduleId: string) => {
        await delay();
        return mockDb.getRegisters(moduleId);
    },
    create: async (data: Omit<Register, 'id' | 'created_at'>) => {
        await delay();
        return mockDb.createRegister(data);
    },
    update: async (id: string, data: Partial<Register>) => {
        await delay();
        return mockDb.updateRegister(id, data);
    },
    delete: async (id: string) => {
        await delay();
        mockDb.deleteRegister(id);
        return true;
    }
};
