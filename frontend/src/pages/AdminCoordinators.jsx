import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function AdminCoordinators() {
  const { role, user, loading } = useAuth();
  const [coordinators, setCoordinators] = useState([]);
  const [states, setStates] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (role !== 'admin') return;
    fetchData();
  }, [role]);

  const fetchData = async () => {
    setFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Fetch coordinators
      const coordsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/coordinators`, { headers });
      const coordsData = await coordsRes.json();
      if (!coordsRes.ok) throw new Error(coordsData.error || 'Failed to fetch coordinators');

      // Fetch states
      const statesRes = await fetch(`${import.meta.env.VITE_API_URL}/api/states`);
      const statesData = await statesRes.json();
      if (!statesRes.ok) throw new Error(statesData.error || 'Failed to fetch states');

      setCoordinators(coordsData.data || []);
      setStates(statesData.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const handleReassign = async (coordinatorId, newStateId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/coordinators/${coordinatorId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state_id: newStateId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Update local state
      setCoordinators(prev => prev.map(c => c.id === coordinatorId ? data.data : c));
    } catch (err) {
      alert(`Error updating state assignment: ${err.message}`);
    }
  };

  if (loading) return <div className="min-h-screen bg-surface-900 flex items-center justify-center"><LoadingSpinner /></div>;
  if (role !== 'admin') return <Navigate to="/portal" replace />;

  return (
    <div className="min-h-screen bg-surface-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Panel: Coordinators</h1>
          <p className="text-sm text-slate-400 mt-1">Manage state assignments for CivicShield coordinators</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="glass rounded-2xl border border-white/5 overflow-hidden">
          {fetching ? (
            <div className="p-12 flex justify-center"><LoadingSpinner label="Loading coordinators..." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-white/5">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Current State</th>
                    <th className="px-6 py-4">Reassign State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {coordinators.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                        No coordinators found.
                      </td>
                    </tr>
                  ) : (
                    coordinators.map(c => (
                      <tr key={c.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{c.full_name}</td>
                        <td className="px-6 py-4">
                          {c.states ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/20 text-xs font-semibold">
                              📍 {c.states.name} ({c.states.code})
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-xs">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <select
                            className="bg-surface-800 border border-white/10 text-white text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 block w-full p-2"
                            value={c.state_id || ''}
                            onChange={(e) => handleReassign(c.id, e.target.value)}
                          >
                            <option value="">-- Unassigned --</option>
                            {states.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
