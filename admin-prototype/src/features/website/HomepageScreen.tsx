import React, { useState } from 'react';
import { Home, Sparkles, Image, CheckCircle2, TrendingUp, Layers } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../context/ToastContext';

export const HomepageScreen: React.FC = () => {
  const { addToast } = useToast();

  const [stats, setStats] = useState({
    branches: '60+',
    depositsCr: '₹ 751+ Cr',
    businessCr: '₹ 1195+ Cr',
    membersCount: '1,50,000+',
  });

  const [announcementText, setAnnouncementText] = useState(
    'दिवाळी सणानिमित्त आकर्षक ठेव योजना व सवलतीच्या दरात सुवर्ण व गृहकर्ज उपलब्ध! जवळच्या शाखेस त्वरित भेट द्या.'
  );
  const [announcementActive, setAnnouncementActive] = useState(true);

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'Homepage Content Saved (Draft)',
      message: 'Hero and announcement bar saved as draft for next release.',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homepage & Hero Management (मुख्यपृष्ठ)"
        description="Public homepage hero slides, public counters and top announcement bar."
        actions={
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
          >
            Save Draft Changes
          </button>
        }
      />

      {/* Announcement Bar Settings */}
      <div className="p-5 rounded-panel bg-surface border border-border shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">
            Top Announcement Bar (सूचना पट्टी)
          </h3>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text-primary">
            <input
              type="checkbox"
              checked={announcementActive}
              onChange={(e) => setAnnouncementActive(e.target.checked)}
              className="rounded border-border text-brand-primary focus:ring-brand-primary"
            />
            <span>Active on Website</span>
          </label>
        </div>
        <textarea
          rows={2}
          value={announcementText}
          onChange={(e) => setAnnouncementText(e.target.value)}
          className="w-full p-3 bg-canvas border border-border rounded-control text-xs text-text-primary leading-relaxed font-marathi font-medium"
        />
      </div>

      {/* Key Public Figures & Counters */}
      <div className="p-5 rounded-panel bg-surface border border-border shadow-card space-y-4">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Public Financial Counter Badges</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Verified public figures displayed in homepage stats ribbon (Source: 2026–27 Leaflets).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 bg-canvas border border-border rounded-control">
            <label className="text-[11px] font-bold text-text-secondary uppercase block mb-1">
              Branches Count
            </label>
            <input
              type="text"
              value={stats.branches}
              onChange={(e) => setStats({ ...stats, branches: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm font-bold bg-surface border border-border rounded-control text-text-primary"
            />
            <span className="text-[10px] text-text-secondary mt-1 block">Automated from 60 active branches</span>
          </div>

          <div className="p-3.5 bg-canvas border border-border rounded-control">
            <label className="text-[11px] font-bold text-text-secondary uppercase block mb-1">
              Total Deposits (ठेवी)
            </label>
            <input
              type="text"
              value={stats.depositsCr}
              onChange={(e) => setStats({ ...stats, depositsCr: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm font-bold bg-surface border border-border rounded-control text-text-primary"
            />
            <span className="text-[10px] text-text-secondary mt-1 block">FY 2026–27 Verified Leaflet</span>
          </div>

          <div className="p-3.5 bg-canvas border border-border rounded-control">
            <label className="text-[11px] font-bold text-text-secondary uppercase block mb-1">
              Business Turnover (व्यवसाय)
            </label>
            <input
              type="text"
              value={stats.businessCr}
              onChange={(e) => setStats({ ...stats, businessCr: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm font-bold bg-surface border border-border rounded-control text-text-primary"
            />
            <span className="text-[10px] text-text-secondary mt-1 block">FY 2026–27 Verified Leaflet</span>
          </div>

          <div className="p-3.5 bg-canvas border border-border rounded-control">
            <label className="text-[11px] font-bold text-text-secondary uppercase block mb-1">
              Satisfied Members (सभासद)
            </label>
            <input
              type="text"
              value={stats.membersCount}
              onChange={(e) => setStats({ ...stats, membersCount: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm font-bold bg-surface border border-border rounded-control text-text-primary"
            />
            <span className="text-[10px] text-text-secondary mt-1 block">Active cooperative membership</span>
          </div>
        </div>
      </div>

      {/* Hero Slides Preview */}
      <div className="p-5 rounded-panel bg-surface border border-border shadow-card space-y-4">
        <h3 className="text-sm font-bold text-text-primary">Featured Hero Slides</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'विश्वासू आणि सुरक्षित सहकार बँकिंग',
              subtitle: 'महाराष्ट्रात ६० पेक्षा जास्त शाखांचे जाळे',
              img: '/images/hero/hero-1.webp',
            },
            {
              title: 'लक्षाधीश आणि दाम दुप्पट ठेव योजना',
              subtitle: 'आकर्षक व्याजदर आणि सुरक्षित परतावा',
              img: '/images/hero/hero-2.webp',
            },
            {
              title: 'शेतकरी आणि उद्योजकांसाठी सुलभ कर्ज',
              subtitle: 'कमीत कमी कागदपत्रांत त्वरित कर्ज मंजुरी',
              img: '/images/hero/hero-3.webp',
            },
          ].map((slide, i) => (
            <div key={i} className="p-3 rounded-control border border-border bg-canvas space-y-2">
              <div className="h-28 rounded-sm bg-zinc-200 overflow-hidden flex items-center justify-center text-xs font-mono text-zinc-500">
                {slide.img}
              </div>
              <p className="text-xs font-bold text-text-primary font-marathi">{slide.title}</p>
              <p className="text-[11px] text-text-secondary font-marathi">{slide.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
