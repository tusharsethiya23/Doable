// API calls for the admin dashboard (admins only).
import { api } from '../lib/api';

export const getAdminStats = () => api.get('/admin/stats').then((r) => r.data.stats);
export const listAdminUsers = (q) => api.get('/admin/users', { params: q ? { q } : {} }).then((r) => r.data.users);
// changes: { disabled?: boolean, monthlyBudgetUsd?: number | null }  (null = back to default budget)
export const updateAdminUser = (id, changes) => api.patch(`/admin/users/${id}`, changes).then((r) => r.data.user);
