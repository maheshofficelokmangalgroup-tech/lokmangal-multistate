import React, { useState } from 'react';
import { MapPin, Phone, Mail, Building, Plus, CheckCircle2, Clock } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { INITIAL_BRANCHES } from '../../lib/api';
import type { Branch } from '../../types';

export const BranchesScreen: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  const filteredBranches = selectedRegion === 'all'
    ? branches
    : branches.filter((b) => b.region.toLowerCase() === selectedRegion.toLowerCase());

  const columns: Column<Branch>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (b) => (
        <span className="font-mono font-bold text-xs text-brand-primary">{b.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Branch Name',
      sortable: true,
      render: (b) => (
        <div>
          <span className="font-bold text-text-primary block">{b.name}</span>
          <span className="text-xs text-text-secondary truncate max-w-xs block">{b.address}</span>
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Region',
      sortable: true,
      render: (b) => (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-canvas border border-border">
          {b.region}
        </span>
      ),
    },
    {
      key: 'manager',
      header: 'Branch Manager',
      render: (b) => (
        <div className="text-xs">
          <span className="font-semibold text-text-primary block">{b.manager}</span>
          <span className="text-text-secondary tabular-nums">{b.phone}</span>
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (b) => <StatusBadge status={b.isActive ? 'active' : 'closed'} />,
    },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedBranch(b);
          }}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          {user?.role === 'branch_manager' ? 'Suggest Change' : 'Edit Branch'}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches Management (६०+ शाखा)"
        description="Branch network locations, managers, contact numbers and operating timings."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
            {branches.length} Active Branches
          </span>
        }
      />

      <DataTable
        data={filteredBranches}
        columns={columns}
        keyExtractor={(b) => b.id}
        searchKey={(b) => `${b.name} ${b.code} ${b.region} ${b.manager} ${b.address}`}
        searchPlaceholder="Search branch by name, code or region..."
        onRowClick={(b) => setSelectedBranch(b)}
        filterElement={
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="text-xs bg-canvas border border-border rounded-control px-2.5 py-2 focus:outline-none focus:border-brand-primary"
          >
            <option value="all">All Regions</option>
            <option value="Solapur">Solapur</option>
            <option value="Pune">Pune</option>
            <option value="Marathwada">Marathwada</option>
            <option value="Western Maharashtra">Western Maharashtra</option>
          </select>
        }
      />

      <Drawer
        isOpen={!!selectedBranch}
        onClose={() => setSelectedBranch(null)}
        title={selectedBranch?.name || 'Branch Details'}
        subtitle={`Branch Code: ${selectedBranch?.code} · Region: ${selectedBranch?.region}`}
        size="lg"
        footer={
          <button
            onClick={() => {
              addToast({
                type: 'success',
                title: user?.role === 'branch_manager' ? 'Suggestion Submitted' : 'Branch Updated',
                message:
                  user?.role === 'branch_manager'
                    ? 'Branch change suggestion submitted to Admin for approval.'
                    : 'Branch details saved as draft for next website release.',
              });
              setSelectedBranch(null);
            }}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-xs transition-colors"
          >
            {user?.role === 'branch_manager' ? 'Submit Suggestion for Sign-off' : 'Save Branch Details'}
          </button>
        }
      >
        {selectedBranch && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-text-secondary block mb-1">Branch Name</label>
              <input
                type="text"
                value={selectedBranch.name}
                onChange={(e) => setSelectedBranch({ ...selectedBranch, name: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Branch Code</label>
                <input
                  type="text"
                  value={selectedBranch.code}
                  readOnly
                  className="w-full px-3 py-2 bg-canvas/70 border border-border rounded-control font-mono font-bold text-text-secondary cursor-not-allowed"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Region</label>
                <input
                  type="text"
                  value={selectedBranch.region}
                  onChange={(e) => setSelectedBranch({ ...selectedBranch, region: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Physical Address</label>
              <textarea
                rows={2}
                value={selectedBranch.address}
                onChange={(e) => setSelectedBranch({ ...selectedBranch, address: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Branch Manager</label>
                <input
                  type="text"
                  value={selectedBranch.manager}
                  onChange={(e) => setSelectedBranch({ ...selectedBranch, manager: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Phone Number</label>
                <input
                  type="text"
                  value={selectedBranch.phone}
                  onChange={(e) => setSelectedBranch({ ...selectedBranch, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Operating Hours</label>
              <input
                type="text"
                value={selectedBranch.openingHours}
                onChange={(e) =>
                  setSelectedBranch({ ...selectedBranch, openingHours: e.target.value })
                }
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={selectedBranch.latitude}
                  onChange={(e) =>
                    setSelectedBranch({ ...selectedBranch, latitude: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums text-text-primary"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={selectedBranch.longitude}
                  onChange={(e) =>
                    setSelectedBranch({ ...selectedBranch, longitude: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums text-text-primary"
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
