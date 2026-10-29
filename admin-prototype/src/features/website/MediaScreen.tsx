import React, { useState } from 'react';
import { FolderOpen, Upload, Image, FileText, CheckCircle2, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../context/ToastContext';

interface MediaItem {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  size: string;
  dimensions?: string;
  altText: string;
  url: string;
  whereUsedCount: number;
}

const INITIAL_MEDIA: MediaItem[] = [
  {
    id: 'm_1',
    name: 'hero-1.webp',
    type: 'image',
    size: '142 KB',
    dimensions: '1920 × 1080',
    altText: 'Lokmangal Multistate customer service in branch',
    url: '/images/hero/hero-1.webp',
    whereUsedCount: 1,
  },
  {
    id: 'm_2',
    name: 'creative-duppat.webp',
    type: 'image',
    size: '88 KB',
    dimensions: '800 × 600',
    altText: 'Daam Duppat doubling scheme banner',
    url: '/images/schemes/creative-duppat.webp',
    whereUsedCount: 2,
  },
  {
    id: 'm_3',
    name: 'chairman.webp',
    type: 'image',
    size: '95 KB',
    dimensions: '600 × 750',
    altText: 'Portrait of Founder and Chairman',
    url: '/images/people/chairman.webp',
    whereUsedCount: 3,
  },
  {
    id: 'm_4',
    name: 'annual-report-2025-26.pdf',
    type: 'pdf',
    size: '5.2 MB',
    altText: 'Official 24th Annual Report Document',
    url: '/docs/annual-report-2025-26.pdf',
    whereUsedCount: 1,
  },
];

export const MediaScreen: React.FC = () => {
  const { addToast } = useToast();
  const [mediaList, setMediaList] = useState<MediaItem[]>(INITIAL_MEDIA);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  const handleUploadSimulate = () => {
    addToast({
      type: 'success',
      title: 'Image Processed (WebP)',
      message: 'Uploaded file re-encoded to WebP format with stripped metadata.',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media Library (चित्रे व दस्तऐवज)"
        description="Public image assets and PDFs. Images are converted to WebP in 3 responsive sizes with stripped EXIF metadata."
        actions={
          <button
            onClick={handleUploadSimulate}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle flex items-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload New Media</span>
          </button>
        }
      />

      {/* Grid of media items */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {mediaList.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className={`p-3 rounded-panel bg-surface border cursor-pointer transition-all ${
              selectedItem?.id === item.id
                ? 'border-brand-primary shadow-dropdown ring-1 ring-brand-primary/20'
                : 'border-border hover:border-brand/40 shadow-card'
            }`}
          >
            <div className="h-32 rounded-control bg-canvas border border-border flex items-center justify-center overflow-hidden mb-2">
              {item.type === 'image' ? (
                <div className="text-center p-2">
                  <Image className="w-8 h-8 text-brand-primary/60 mx-auto mb-1" />
                  <span className="text-[10px] font-mono text-text-secondary truncate block max-w-[130px]">
                    {item.name}
                  </span>
                </div>
              ) : (
                <div className="text-center p-2">
                  <FileText className="w-8 h-8 text-red-500/70 mx-auto mb-1" />
                  <span className="text-[10px] font-mono text-text-secondary truncate block max-w-[130px]">
                    {item.name}
                  </span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-text-primary truncate">{item.name}</p>
              <div className="flex items-center justify-between text-[11px] text-text-secondary mt-1">
                <span>{item.size}</span>
                <span className="text-emerald-700 font-semibold">{item.whereUsedCount} uses</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
