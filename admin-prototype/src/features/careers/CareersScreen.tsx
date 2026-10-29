import React, { useState } from 'react';
import { Briefcase, Download, User, FileText, CheckCircle2, Clock } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { JobApplication, JobOpening } from '../../types';

const INITIAL_JOBS: JobOpening[] = [
  {
    id: 'job_1',
    title: 'Branch Manager (शाखा व्यवस्थापक)',
    department: 'Branch Banking',
    location: 'Solapur / Pune',
    type: 'Full-time',
    lastDate: '2026-11-30',
    status: 'open',
    applicantCount: 14,
  },
  {
    id: 'job_2',
    title: 'Customer Service & Cash Officer (कॅशियर)',
    department: 'Operations',
    location: 'Pandharpur / Latur',
    type: 'Full-time',
    lastDate: '2026-11-15',
    status: 'open',
    applicantCount: 28,
  },
];

const INITIAL_APPS: JobApplication[] = [
  {
    id: 'app_1',
    jobId: 'job_1',
    jobTitle: 'Branch Manager',
    name: 'Santosh Kulkarni',
    phone: '9822110022',
    email: 'santosh.k@gmail.com',
    resumeFileName: 'Santosh_Kulkarni_Resume_2026.pdf',
    status: 'shortlisted',
    submittedAt: '2026-10-24T10:00:00Z',
    notes: '8 years cooperative banking branch experience in Solapur district.',
  },
  {
    id: 'app_2',
    jobId: 'job_2',
    jobTitle: 'Customer Service & Cash Officer',
    name: 'Pooja Jadhav',
    phone: '9765112233',
    email: 'pooja.jadhav@yahoo.com',
    resumeFileName: 'Pooja_Jadhav_CV.pdf',
    status: 'new',
    submittedAt: '2026-10-26T15:30:00Z',
  },
];

export const CareersScreen: React.FC = () => {
  const { permissions } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'applications' | 'openings'>('applications');
  const [applications, setApplications] = useState<JobApplication[]>(INITIAL_APPS);
  const [jobs, setJobs] = useState<JobOpening[]>(INITIAL_JOBS);

  const handleDownloadResume = (app: JobApplication) => {
    addToast({
      type: 'info',
      title: 'Resume Downloaded',
      message: `Downloading private resume for ${app.name}. Action logged to audit trail.`,
    });
  };

  const appColumns: Column<JobApplication>[] = [
    {
      key: 'name',
      header: 'Applicant Name',
      sortable: true,
      render: (a) => (
        <div>
          <span className="font-bold text-text-primary block">{a.name}</span>
          <span className="text-xs text-text-secondary">{a.phone} · {a.email}</span>
        </div>
      ),
    },
    {
      key: 'jobTitle',
      header: 'Position Applied',
      sortable: true,
      render: (a) => <span className="font-semibold text-xs text-text-primary">{a.jobTitle}</span>,
    },
    {
      key: 'submittedAt',
      header: 'Applied Date',
      sortable: true,
      render: (a) => (
        <span className="text-xs text-text-secondary tabular-nums">
          {new Date(a.submittedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Stage',
      render: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (a) => (
        <button
          onClick={() => handleDownloadResume(a)}
          className="px-2.5 py-1 rounded-control bg-canvas border border-border text-xs font-semibold text-brand-primary hover:bg-brand-soft flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Resume</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Careers & Candidate Hiring (नोकरभरती)"
        description="Public job openings on /careers/ and recruitment application inbox with secure resume access."
      />

      <div className="flex items-center gap-2 border-b border-border pb-px">
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-4 py-2 text-xs font-bold rounded-t-control border-b-2 transition-all ${
            activeTab === 'applications'
              ? 'border-brand-primary text-brand-primary bg-surface'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Applications Inbox ({applications.length})
        </button>
        <button
          onClick={() => setActiveTab('openings')}
          className={`px-4 py-2 text-xs font-bold rounded-t-control border-b-2 transition-all ${
            activeTab === 'openings'
              ? 'border-brand-primary text-brand-primary bg-surface'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Job Openings ({jobs.length})
        </button>
      </div>

      {activeTab === 'applications' ? (
        <DataTable
          data={applications}
          columns={appColumns}
          keyExtractor={(a) => a.id}
          searchKey={(a) => `${a.name} ${a.jobTitle} ${a.phone}`}
          searchPlaceholder="Search candidates..."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => (
            <div key={job.id} className="p-5 bg-surface rounded-panel border border-border shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-primary uppercase">
                  {job.department}
                </span>
                <StatusBadge status={job.status} />
              </div>
              <h3 className="text-base font-bold text-text-primary mt-1.5">{job.title}</h3>
              <p className="text-xs text-text-secondary mt-1">
                Location: {job.location} · {job.type}
              </p>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                <span className="text-text-secondary">Last Date: {job.lastDate}</span>
                <span className="font-bold text-brand-primary tabular-nums">
                  {job.applicantCount} Applicants
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
