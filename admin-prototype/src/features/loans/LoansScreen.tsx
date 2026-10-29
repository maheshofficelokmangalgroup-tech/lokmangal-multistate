import React, { useState } from 'react';
import { Landmark, TrendingUp, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { INITIAL_RATE_SET } from '../../lib/api';
import type { LoanScheme } from '../../types';

const INITIAL_LOANS: LoanScheme[] = [
  {
    id: 'loan_1',
    slug: 'housing-loan',
    nameEn: 'Housing Loan (गृहकर्ज)',
    nameMr: 'गृहकर्ज योजना',
    summary: 'Competitive interest rates for home construction, purchase or renovation.',
    maxAmount: '₹ 75,00,000',
    tenure: 'Up to 240 Months (20 Years)',
    rateKey: 'loan.housing',
    showInEnquiryForm: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'loan_2',
    slug: 'vehicle-loan',
    nameEn: 'Vehicle Loan (वाहन कर्ज)',
    nameMr: 'वाहन कर्ज योजना',
    summary: 'Fast sanction for two-wheeler and four-wheeler vehicle purchases.',
    maxAmount: '₹ 25,00,000',
    tenure: 'Up to 84 Months (7 Years)',
    rateKey: 'loan.vehicle',
    showInEnquiryForm: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'loan_3',
    slug: 'gold-loan',
    nameEn: 'Gold Loan (सुवर्ण कर्ज)',
    nameMr: 'सुवर्ण तारण कर्ज',
    summary: 'Instant loan against gold jewellery with lowest interest rates.',
    maxAmount: '₹ 15,00,000',
    tenure: 'Up to 12 Months',
    rateKey: 'loan.gold',
    showInEnquiryForm: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'loan_4',
    slug: 'business-loan',
    nameEn: 'Business & Mortgage Loan (व्यवसाय कर्ज)',
    nameMr: 'तारण / व्यवसाय कर्ज',
    summary: 'Working capital and term loans for local business growth.',
    maxAmount: '₹ 1,00,00,000',
    tenure: 'Up to 120 Months',
    rateKey: 'loan.business',
    showInEnquiryForm: true,
    status: 'published',
    updatedAt: '2026-03-20T10:00:00Z',
  },
];

export const LoansScreen: React.FC = () => {
  const { permissions } = useAuth();
  const { addToast } = useToast();

  const [loans, setLoans] = useState<LoanScheme[]>(INITIAL_LOANS);
  const [selectedLoan, setSelectedLoan] = useState<LoanScheme | null>(null);

  const getResolvedRate = (rateKey: string) => {
    const entry = INITIAL_RATE_SET.entries.find((e) => e.key === rateKey);
    return entry ? `${entry.value}% p.a.` : '—';
  };

  const columns: Column<LoanScheme>[] = [
    {
      key: 'nameEn',
      header: 'Loan Product',
      sortable: true,
      render: (loan) => (
        <div>
          <span className="font-bold text-text-primary block">{loan.nameEn}</span>
          <span className="text-xs text-text-secondary font-marathi">{loan.nameMr}</span>
        </div>
      ),
    },
    {
      key: 'rateKey',
      header: 'Interest Rate',
      render: (loan) => (
        <span className="font-bold text-brand-primary tabular-nums text-xs">
          {getResolvedRate(loan.rateKey)}
        </span>
      ),
    },
    {
      key: 'maxAmount',
      header: 'Max Amount',
      sortable: true,
      render: (loan) => (
        <span className="font-semibold tabular-nums text-xs text-text-primary">
          {loan.maxAmount}
        </span>
      ),
    },
    {
      key: 'tenure',
      header: 'Max Tenure',
      render: (loan) => <span className="text-xs text-text-secondary">{loan.tenure}</span>,
    },
    {
      key: 'showInEnquiryForm',
      header: 'Public Form',
      render: (loan) =>
        loan.showInEnquiryForm ? (
          <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            Active in Form
          </span>
        ) : (
          <span className="text-[11px] text-text-secondary">Hidden</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (loan) => <StatusBadge status={loan.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (loan) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLoan(loan);
          }}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Edit Terms
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan Products & Credit Schemes (कर्ज योजना)"
        description="Public loans configuration. Interest rates resolve dynamically from the Rate Set."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
            {loans.length} Products
          </span>
        }
      />

      <DataTable
        data={loans}
        columns={columns}
        keyExtractor={(loan) => loan.id}
        searchKey={(loan) => `${loan.nameEn} ${loan.nameMr} ${loan.slug}`}
        searchPlaceholder="Search loan products..."
        onRowClick={(loan) => setSelectedLoan(loan)}
      />

      <Drawer
        isOpen={!!selectedLoan}
        onClose={() => setSelectedLoan(null)}
        title={selectedLoan?.nameEn || 'Loan Product Configuration'}
        subtitle={`URL Slug: /loans/#${selectedLoan?.slug}`}
        size="lg"
        footer={
          <button
            onClick={() => {
              addToast({
                type: 'success',
                title: 'Loan Terms Saved (Draft)',
                message: 'Changes saved as draft. Ready for release preview.',
              });
              setSelectedLoan(null);
            }}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-xs transition-colors"
          >
            Save Draft Terms
          </button>
        }
      >
        {selectedLoan && (
          <div className="space-y-5 text-xs">
            <div>
              <label className="font-bold text-text-secondary block mb-1">Loan Title (English)</label>
              <input
                type="text"
                value={selectedLoan.nameEn}
                onChange={(e) => setSelectedLoan({ ...selectedLoan, nameEn: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            <div className="p-3.5 rounded-control bg-brand-soft border border-brand/20">
              <span className="font-bold text-brand-primary block uppercase text-[11px] mb-1">
                Resolved Rate from Rate Set (Read Only)
              </span>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-text-secondary">Token Key:</span>{' '}
                  <code className="font-mono font-bold text-text-primary">{selectedLoan.rateKey}</code>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-brand-primary tabular-nums">
                    {getResolvedRate(selectedLoan.rateKey)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Maximum Amount</label>
                <input
                  type="text"
                  value={selectedLoan.maxAmount}
                  onChange={(e) => setSelectedLoan({ ...selectedLoan, maxAmount: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Maximum Tenure</label>
                <input
                  type="text"
                  value={selectedLoan.tenure}
                  onChange={(e) => setSelectedLoan({ ...selectedLoan, tenure: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Product Summary</label>
              <textarea
                rows={3}
                value={selectedLoan.summary}
                onChange={(e) => setSelectedLoan({ ...selectedLoan, summary: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="showInFormCheck"
                checked={selectedLoan.showInEnquiryForm}
                onChange={(e) =>
                  setSelectedLoan({ ...selectedLoan, showInEnquiryForm: e.target.checked })
                }
                className="rounded border-border text-brand-primary focus:ring-brand-primary"
              />
              <label htmlFor="showInFormCheck" className="font-semibold text-text-primary">
                Display this loan option in website enquiry application form
              </label>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
