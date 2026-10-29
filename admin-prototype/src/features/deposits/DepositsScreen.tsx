import React, { useState } from 'react';
import { PiggyBank, Eye, Sparkles, CheckCircle2, TrendingUp, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { INITIAL_RATE_SET } from '../../lib/api';
import type { DepositScheme } from '../../types';

const INITIAL_SCHEMES: DepositScheme[] = [
  {
    id: 'sch_1',
    slug: 'lakshadish-deposit-scheme-1',
    nameEn: 'Lakshadish Deposit Scheme 1',
    nameMr: 'लक्षाधीश ठेव योजना क्र. १',
    type: 'rd',
    shortPitch: 'Invest ₹2,000 monthly for 36 months to receive maturity payout.',
    rateKey: 'deposit.lakshadish_1',
    minAmount: 2000,
    tenureMonths: 36,
    isFeatured: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'sch_2',
    slug: 'lakshadish-deposit-scheme-2',
    nameEn: 'Lakshadish Deposit Scheme 2',
    nameMr: 'लक्षाधीश ठेव योजना क्र. २',
    type: 'rd',
    shortPitch: 'Invest ₹1,500 monthly for 48 months for wealth growth.',
    rateKey: 'deposit.lakshadish_2',
    minAmount: 1500,
    tenureMonths: 48,
    isFeatured: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'sch_3',
    slug: 'vishwamangal-fixed-deposit-scheme',
    nameEn: 'Vishwamangal Fixed Deposit Scheme',
    nameMr: 'विश्वमंगल मुदत ठेव योजना',
    type: 'fd',
    shortPitch: 'High return fixed deposits with safety and security.',
    rateKey: 'deposit.vishwamangal_fd',
    minAmount: 10000,
    tenureMonths: 24,
    isFeatured: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'sch_4',
    slug: 'daam-duppat-yojna',
    nameEn: 'Daam Duppat Deposit Scheme (दाम दुप्पट)',
    nameMr: 'लोकमंगल दाम दुप्पट योजना',
    type: 'doubling',
    shortPitch: 'Double your money in approved tenure months safely.',
    rateKey: 'doubling.months',
    minAmount: 5000,
    tenureMonths: 72,
    isFeatured: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
];

export const DepositsScreen: React.FC = () => {
  const { permissions } = useAuth();
  const { addToast } = useToast();

  const [schemes, setSchemes] = useState<DepositScheme[]>(INITIAL_SCHEMES);
  const [selectedScheme, setSelectedScheme] = useState<DepositScheme | null>(null);

  // Helper to resolve current rate dynamically from Rate Set
  const getResolvedRate = (rateKey: string) => {
    const entry = INITIAL_RATE_SET.entries.find((e) => e.key === rateKey);
    return entry ? `${entry.value} ${entry.unit === 'percent' ? '% p.a.' : 'Months'}` : '—';
  };

  const columns: Column<DepositScheme>[] = [
    {
      key: 'nameEn',
      header: 'Scheme Name',
      sortable: true,
      render: (sch) => (
        <div>
          <span className="font-bold text-text-primary block">{sch.nameEn}</span>
          <span className="text-xs text-text-secondary font-marathi">{sch.nameMr}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (sch) => (
        <span className="uppercase text-xs font-semibold px-2 py-0.5 rounded-full bg-canvas border border-border">
          {sch.type}
        </span>
      ),
    },
    {
      key: 'rateKey',
      header: 'Linked Rate (Rate Set)',
      render: (sch) => (
        <div className="text-xs">
          <span className="font-bold text-brand-primary tabular-nums block">
            {getResolvedRate(sch.rateKey)}
          </span>
          <span className="font-mono text-[10px] text-text-secondary">{sch.rateKey}</span>
        </div>
      ),
    },
    {
      key: 'minAmount',
      header: 'Min Amount',
      sortable: true,
      render: (sch) => (
        <span className="font-semibold tabular-nums text-xs text-text-primary">
          ₹ {sch.minAmount.toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'isFeatured',
      header: 'Homepage',
      render: (sch) =>
        sch.isFeatured ? (
          <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-orange-50 text-brand-primary border border-brand/20">
            Featured
          </span>
        ) : (
          <span className="text-[11px] text-text-secondary">Standard</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (sch) => <StatusBadge status={sch.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (sch) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedScheme(sch);
          }}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Edit Scheme
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Deposit Schemes (ठेवी योजना)"
        description="Public deposit products. The scheme editor contains NO independent rate field — rates are derived automatically from the approved Rate Set."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
            {schemes.length} Schemes
          </span>
        }
      />

      {/* Info Callout */}
      <div className="p-4 rounded-panel bg-canvas border border-border flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary">
          <span className="font-bold text-text-primary block mb-0.5">
            Single Source of Financial Truth:
          </span>
          Texts such as &quot;Earn {'{rate}'}% p.a.&quot; and maturity calculations populate directly from the active rate set. When interest rates change, all scheme pages update automatically without manual re-typing.
        </div>
      </div>

      {/* Schemes Data Table */}
      <DataTable
        data={schemes}
        columns={columns}
        keyExtractor={(sch) => sch.id}
        searchKey={(sch) => `${sch.nameEn} ${sch.nameMr} ${sch.slug}`}
        searchPlaceholder="Search schemes by English or Marathi name..."
        onRowClick={(sch) => setSelectedScheme(sch)}
      />

      {/* Scheme Detail & Token Drawer */}
      <Drawer
        isOpen={!!selectedScheme}
        onClose={() => setSelectedScheme(null)}
        title={selectedScheme?.nameEn || 'Scheme Configuration'}
        subtitle={`URL Slug: /deposits/${selectedScheme?.slug}/`}
        size="lg"
        footer={
          <button
            onClick={() => {
              addToast({
                type: 'success',
                title: 'Scheme Saved (Draft)',
                message: 'Changes saved as draft. Ready for release preview.',
              });
              setSelectedScheme(null);
            }}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-xs transition-colors"
          >
            Save Draft Changes
          </button>
        }
      >
        {selectedScheme && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Scheme Name (English)</label>
                <input
                  type="text"
                  value={selectedScheme.nameEn}
                  onChange={(e) =>
                    setSelectedScheme({ ...selectedScheme, nameEn: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">योजनेचे नाव (मराठी)</label>
                <input
                  type="text"
                  value={selectedScheme.nameMr}
                  onChange={(e) =>
                    setSelectedScheme({ ...selectedScheme, nameMr: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold font-marathi text-text-primary"
                />
              </div>
            </div>

            {/* Readonly Rate Resolution Box */}
            <div className="p-3.5 rounded-control bg-brand-soft border border-brand/20">
              <span className="font-bold text-brand-primary block uppercase text-[11px] mb-1">
                Resolved Rate from Rate Set (Read Only)
              </span>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-text-secondary">Token Key:</span>{' '}
                  <code className="font-mono font-bold text-text-primary">{selectedScheme.rateKey}</code>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-brand-primary tabular-nums">
                    {getResolvedRate(selectedScheme.rateKey)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Short Pitch & Introduction</label>
              <textarea
                rows={3}
                value={selectedScheme.shortPitch}
                onChange={(e) =>
                  setSelectedScheme({ ...selectedScheme, shortPitch: e.target.value })
                }
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Minimum Investment (₹)</label>
                <input
                  type="number"
                  value={selectedScheme.minAmount}
                  onChange={(e) =>
                    setSelectedScheme({ ...selectedScheme, minAmount: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Tenure (Months)</label>
                <input
                  type="number"
                  value={selectedScheme.tenureMonths}
                  onChange={(e) =>
                    setSelectedScheme({ ...selectedScheme, tenureMonths: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="featuredCheck"
                checked={selectedScheme.isFeatured}
                onChange={(e) =>
                  setSelectedScheme({ ...selectedScheme, isFeatured: e.target.checked })
                }
                className="rounded border-border text-brand-primary focus:ring-brand-primary"
              />
              <label htmlFor="featuredCheck" className="font-semibold text-text-primary">
                Feature prominently on website homepage
              </label>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
