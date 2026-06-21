import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { resourcesApi } from '@/services/backendApi';

const RESOURCE_TYPES = ['ambulance', 'fire_truck', 'helicopter', 'shelter', 'food', 'water', 'medical', 'rescue_team', 'other'];
const STATUS_COLORS = {
  available:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  deployed:    'text-amber-400 bg-amber-500/10 border-amber-500/30',
  maintenance: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  unavailable: 'text-red-400 bg-red-500/10 border-red-500/30',
};

export default function ResourcePanel() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [newResource, setNewResource] = useState({ name: '', type: 'ambulance', quantity: 1, status: 'available' });

  const { data, isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: () => resourcesApi.getAll(),
    staleTime: 60 * 1000,
    retry: 1,
    throwOnError: false,
  });

  const createMutation = useMutation({
    mutationFn: (data) => resourcesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      setShowForm(false);
      setNewResource({ name: '', type: 'ambulance', quantity: 1, status: 'available' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => resourcesApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources'] }),
  });

  const resources = data?.data || [];
  const summary = {
    available: resources.filter(r => r.status === 'available').length,
    deployed: resources.filter(r => r.status === 'deployed').length,
    total: resources.length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Available', value: summary.available, color: 'text-emerald-400' },
          { label: 'Deployed', value: summary.deployed, color: 'text-amber-400' },
          { label: 'Total', value: summary.total, color: 'text-white' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card text-center py-3">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {profile?.states && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
          <span>Resources Scope</span>
          <span className="text-brand-400">📍 {profile.states.name}</span>
        </div>
      )}

      {/* Add Resource Button */}
      <button
        id="add-resource-btn"
        onClick={() => setShowForm(!showForm)}
        className="btn-outline w-full justify-center"
      >
        {showForm ? '✕ Cancel' : '+ Add Resource'}
      </button>

      {/* Add Resource Form */}
      {showForm && (
        <form
          id="resource-form"
          className="glass-card space-y-3 animate-slide-up"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(newResource);
          }}
        >
          <input
            id="resource-name"
            className="input"
            placeholder="Resource name (e.g., Ambulance Unit 4)"
            value={newResource.name}
            onChange={(e) => setNewResource(r => ({ ...r, name: e.target.value }))}
            required
          />
          <select
            id="resource-type"
            className="input"
            value={newResource.type}
            onChange={(e) => setNewResource(r => ({ ...r, type: e.target.value }))}
          >
            {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <input
            id="resource-quantity"
            type="number"
            min="1"
            className="input"
            placeholder="Quantity"
            value={newResource.quantity}
            onChange={(e) => setNewResource(r => ({ ...r, quantity: parseInt(e.target.value) }))}
          />
          <button type="submit" id="resource-submit" disabled={createMutation.isPending} className="btn-primary w-full justify-center">
            {createMutation.isPending ? 'Adding…' : 'Add Resource'}
          </button>
        </form>
      )}

      {/* Resource List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><div className="spinner" /></div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {resources.length === 0 ? (
            <p className="text-center text-slate-500 py-8 text-sm">No resources added yet</p>
          ) : (
            resources.map((r) => (
              <div key={r.id} id={`resource-${r.id}`} className="glass-card flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{r.name}</p>
                  <p className="text-xs text-slate-500 capitalize">{r.type?.replace('_', ' ')} · qty {r.quantity}</p>
                </div>
                <select
                  value={r.status}
                  className={`text-xs border rounded-lg px-2 py-1 bg-transparent cursor-pointer ${STATUS_COLORS[r.status]}`}
                  onChange={(e) => updateStatusMutation.mutate({ id: r.id, status: e.target.value })}
                  aria-label={`Update status for ${r.name}`}
                >
                  {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} className="bg-surface-800">{s}</option>)}
                </select>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
