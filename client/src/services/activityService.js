// API call for the activity log (actions the agent performed).
import { api } from '../lib/api';

// filters: { status?: 'success'|'failed', before?: ISO date for pagination }
export const listActivity = (filters = {}) => api.get('/activity', { params: filters }).then((r) => r.data);
