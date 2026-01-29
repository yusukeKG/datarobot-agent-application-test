import axios from 'axios';

const API_BASE_URL = '/api/v1/snowflake';

export interface PumpData {
  TIMESTAMP: string;
  TEMPERATURE_C: number;
  FLUID_TEMPERATURE_C: number;
  PUMP_OUTLET_PRESSURE_MPA: number;
  POWER_CONSUMPTION_KWH: number;
  PUMP_FLOW_L_PER_H: number;
  ANOMALY_FLAG: string;
  CREATED_AT: string;
}

export interface SnowflakeStatus {
  configured: boolean;
  database: string | null;
  schema: string | null;
  warehouse: string | null;
}

export const snowflakeApi = {
  getStatus: async (): Promise<SnowflakeStatus> => {
    const response = await axios.get(`${API_BASE_URL}/status`);
    return response.data;
  },

  getPumpData: async (
    startDate?: string,
    endDate?: string
  ): Promise<PumpData[]> => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await axios.get(`${API_BASE_URL}/pump-data?${params}`);
    return response.data;
  },

  getTables: async (): Promise<any[]> => {
    const response = await axios.get(`${API_BASE_URL}/tables`);
    return response.data;
  },
};
