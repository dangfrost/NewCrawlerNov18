// Frontend API client for NeonDB-backed endpoints
import { base44 } from '@/api/base44Client';

async function apiCall(functionName, payload = {}) {
    try {
        console.log(`Calling function: ${functionName}`, payload);
        const { data, error } = await base44.functions.invoke(functionName, payload);
        console.log(`Response from ${functionName}:`, { data, error });
        
        if (error) {
            console.error(`Error from ${functionName}:`, error);
            throw new Error(error.message || error);
        }
        
        if (data && data.error) {
            console.error(`Data error from ${functionName}:`, data.error);
            throw new Error(data.error);
        }
        
        return data;

    } catch (error) {
        console.error(`API call error for ${functionName}:`, error);
        throw error;
    }
}

// Instance API
export const instancesApi = {
    list: async () => {
        const result = await apiCall('instancesList');
        return result.data;
    },
    
    get: async (id) => {
        const result = await apiCall('instancesGet', { id });
        return result.data;
    },
    
    create: async (instanceData) => {
        const result = await apiCall('instancesCreate', instanceData);
        return result.data;
    },
    
    update: async (id, instanceData) => {
        const result = await apiCall('instancesUpdate', { id, data: instanceData });
        return result.data;
    },
    
    delete: async (id) => {
        await apiCall('instancesDelete', { id });
    },
};

// Jobs API
export const jobsApi = {
    list: async (limit = 20) => {
        const result = await apiCall('jobsList', { limit });
        return result.data;
    },
    
    get: async (id) => {
        const result = await apiCall('jobsGet', { id });
        return result.data;
    },
    
    logs: async (job_id) => {
        const result = await apiCall('jobsLogs', { job_id });
        return result.data;
    },
};

// Migration
export const migrationApi = {
    run: async () => {
        return await apiCall('dbMigrate');
    },
};