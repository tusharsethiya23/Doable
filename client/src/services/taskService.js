// API calls for reminders and scheduled tasks.
import { api } from '../lib/api';

export const listTasks = () => api.get('/tasks').then((r) => r.data.tasks);
export const setTaskEnabled = (id, enabled) => api.patch(`/tasks/${id}`, { enabled }).then((r) => r.data.task);
export const deleteTask = (id) => api.delete(`/tasks/${id}`);
