import React, { useState } from 'react';
import { Bell, FileText, Pin, Download, Plus, Calendar, AlertCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Notice } from '../../types';

const INITIAL_NOTICES: Notice[] = [
  {
    id: 'not_1',
    title: '२४ वी वार्षिक सर्वसाधारण सभा (AGM) नोटीस व कार्यक्रम पत्रिका २०२६',
    category: 'agm',
    publishDate: '2026-08-10',
    expiryDate: '2026-09-30',
    isPinned: true,
    pdfUrl: '/docs/agm-notice-2026.pdf',
    fileSize: '1.8 MB',
    status: 'active',
  },
  {
    id: 'not_2',
    title: 'दिवाळी सणानिमित्त शाखा कामकाजाच्या वेळा व सुट्ट्यांचे परिपत्रक',
    category: 'public',
    publishDate: '2026-10-25',
    expiryDate: '2026-11-15',
    isPinned: true,
    pdfUrl: '/docs/diwali-circular-2026.pdf',
    fileSize: '450 KB',
    status: 'active',
  },
  {
    id: 'not_3',
    title: 'संस्थेचे वार्षिक आर्थिक विवरणपत्र व ताळेबंद अहवाल २०२५-२६',
    category: 'agm',
    publishDate: '2026-06-30',
    isPinned: false,
    pdfUrl: '/docs/annual-report-2025-26.pdf',
    fileSize: '5.2 MB',
    status: 'active',
  },
  {
    id: 'not_4',
    title: 'संचालक मंडळ निवडणूक प्रारूप मतदार यादी - सोलापूर जिल्हा',
    category: 'election',
    publishDate: '2026-04-01',
    expiryDate: '2026-05-31',
    isPinned: false,
    pdfUrl: '/docs/voter-list-solapur.pdf',
    fileSize: '14.2 MB',
    status: 'expired',
  },
];

export const NoticesScreen: React.FC = () => {
  const { addToast } = useToast();
  const [notices, setNotices] = useState<Notice[]>(INITIAL_NOTICES);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  const columns: Column<Notice>[] = [
    {
      key: 'title',
      header: 'Notice / Document Title',
      sortable: true,
      render: (n) => (
        <div className="flex items-start gap-2">
          {n.isPinned && (
            <Pin className="w-3.5 h-3.5 text-brand-primary fill-brand-primary flex-shrink-0 mt-0.5" />
          )}
          <div>
            <span className="font-bold text-text-primary block">{n.title}</span>
            {n.pdfUrl && (
              <span className="text-[11px] text-text-secondary flex items-center gap-1 mt-0.5">
                <FileText className="w-3 h-3 text-brand-primary" />
                <span>PDF Attachment ({n.fileSize})</span>
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (n) => (
        <span className="uppercase text-xs font-semibold px-2 py-0.5 rounded-full bg-canvas border border-border">
          {n.category}
        </span>
      ),
    },
    {
      key: 'publishDate',
      header: 'Publish Date',
      sortable: true,
      render: (n) => (
        <span className="text-xs text-text-secondary tabular-nums">{n.publishDate}</span>
      ),
    },
    {
      key: 'isPinned',
      header: 'Announcement Bar',
      render: (n) =>
        n.isPinned ? (
          <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            Pinned Top
          </span>
        ) : (
          <span className="text-[11px] text-text-secondary">Standard</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (n) => <StatusBadge status={n.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (n) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedNotice(n);
          }}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Edit Notice
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notices, AGM & Official Documents (सूचना व परिपत्रके)"
        description="Public notices, annual reports and voter list documents with PDF attachment support."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
            {notices.length} Documents
          </span>
        }
      />

      <DataTable
        data={notices}
        columns={columns}
        keyExtractor={(n) => n.id}
        searchKey={(n) => `${n.title} ${n.category}`}
        searchPlaceholder="Search notices and documents..."
        onRowClick={(n) => setSelectedNotice(n)}
      />

      <Drawer
        isOpen={!!selectedNotice}
        onClose={() => setSelectedNotice(null)}
        title={selectedNotice?.title || 'Notice Details'}
        subtitle={`Category: ${selectedNotice?.category} · Attachment: ${selectedNotice?.pdfUrl || 'None'}`}
        size="lg"
        footer={
          <button
            onClick={() => {
              addToast({
                type: 'success',
                title: 'Notice Saved (Draft)',
                message: 'Notice saved for release preview.',
              });
              setSelectedNotice(null);
            }}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-xs transition-colors"
          >
            Save Draft Notice
          </button>
        }
      >
        {selectedNotice && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-text-secondary block mb-1">Notice Headline</label>
              <input
                type="text"
                value={selectedNotice.title}
                onChange={(e) => setSelectedNotice({ ...selectedNotice, title: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-bold text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Publish Date</label>
                <input
                  type="date"
                  value={selectedNotice.publishDate}
                  onChange={(e) =>
                    setSelectedNotice({ ...selectedNotice, publishDate: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={selectedNotice.expiryDate || ''}
                  onChange={(e) =>
                    setSelectedNotice({ ...selectedNotice, expiryDate: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums"
                />
              </div>
            </div>

            <div className="p-3 bg-canvas border border-border rounded-control">
              <span className="font-bold text-text-primary block mb-1">Attached PDF File</span>
              <p className="text-text-secondary font-mono">{selectedNotice.pdfUrl || 'No file selected'}</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="pinTopCheck"
                checked={selectedNotice.isPinned}
                onChange={(e) =>
                  setSelectedNotice({ ...selectedNotice, isPinned: e.target.checked })
                }
                className="rounded border-border text-brand-primary focus:ring-brand-primary"
              />
              <label htmlFor="pinTopCheck" className="font-semibold text-text-primary">
                Pin to top announcement bar on website homepage
              </label>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
