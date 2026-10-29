import React, { useState } from 'react';
import { Image, Plus, Upload, Calendar, Eye, Edit3, Trash2, GripVertical } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Drawer } from '../../components/common/Drawer';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../context/ToastContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface GalleryPhoto {
  id: string;
  filename: string;
  caption: string;
  altText: string;
  dimensions: string;
  size: string;
  order: number;
}

interface Album {
  id: string;
  title: string;
  date: string;
  description: string;
  coverPhotoId: string;
  photoCount: number;
  status: 'draft' | 'published';
  photos: GalleryPhoto[];
}

/* ------------------------------------------------------------------ */
/*  Seed Data                                                          */
/* ------------------------------------------------------------------ */
const SEED_ALBUMS: Album[] = [
  {
    id: 'alb_1',
    title: 'रौप्यमहोत्सवी वर्ष — Silver Jubilee Celebration 2026',
    date: '2026-03-15',
    description: 'लोकमंगल समूहाच्या २५ व्या वर्धापनदिनी आयोजित कार्यक्रमाची छायाचित्रे.',
    coverPhotoId: 'ph_1',
    photoCount: 12,
    status: 'published',
    photos: [
      { id: 'ph_1', filename: 'jubilee-stage.webp', caption: 'मंचावरील मान्यवर', altText: 'Silver Jubilee stage ceremony', dimensions: '1920 × 1080', size: '245 KB', order: 1 },
      { id: 'ph_2', filename: 'jubilee-crowd.webp', caption: 'उपस्थित सभासद', altText: 'Members attending jubilee', dimensions: '1920 × 1080', size: '312 KB', order: 2 },
      { id: 'ph_3', filename: 'jubilee-award.webp', caption: 'पुरस्कार सोहळा', altText: 'Award ceremony at jubilee', dimensions: '1600 × 900', size: '198 KB', order: 3 },
    ],
  },
  {
    id: 'alb_2',
    title: 'शेतकरी मेळावा — Farmer Meet Bhogavati 2026',
    date: '2026-04-10',
    description: 'सोलापूर शाखा भोगावतीच्या शेतकरी मेळाव्याचे फोटो.',
    coverPhotoId: 'ph_4',
    photoCount: 8,
    status: 'published',
    photos: [
      { id: 'ph_4', filename: 'farmer-meet-1.webp', caption: 'शेतकरी बांधवांचा सहभाग', altText: 'Farmers at Bhogavati meet', dimensions: '1600 × 900', size: '220 KB', order: 1 },
      { id: 'ph_5', filename: 'farmer-meet-2.webp', caption: 'योजनांची माहिती', altText: 'Scheme information session', dimensions: '1600 × 900', size: '185 KB', order: 2 },
    ],
  },
  {
    id: 'alb_3',
    title: 'नवीन शाखा उद्घाटन — New Branch Opening',
    date: '2026-10-05',
    description: 'Kolhapur नवीन शाखेचे उद्घाटन सोहळा.',
    coverPhotoId: 'ph_6',
    photoCount: 6,
    status: 'draft',
    photos: [
      { id: 'ph_6', filename: 'branch-opening.webp', caption: 'उद्घाटन सोहळा', altText: 'Branch opening ceremony', dimensions: '1920 × 1080', size: '276 KB', order: 1 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export const GalleryScreen: React.FC = () => {
  const { addToast } = useToast();
  const [albums, setAlbums] = useState<Album[]>(SEED_ALBUMS);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const handleCreateAlbum = () => {
    addToast({
      type: 'info',
      title: 'Create Album',
      message: 'New album creation form opened.',
    });
  };

  const handleSaveAlbum = () => {
    addToast({
      type: 'success',
      title: 'Album Saved (Draft)',
      message: 'Album changes saved as draft. Publish via Publish Center.',
    });
    setSelectedAlbum(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photo Gallery (फोटो गॅलरी)"
        description="Manage photo albums displayed on the public website. Images are converted to WebP in responsive sizes."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
            {albums.length} Albums
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex border border-border rounded-control overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-brand-soft text-brand-primary' : 'text-text-secondary hover:bg-canvas'}`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-brand-soft text-brand-primary' : 'text-text-secondary hover:bg-canvas'}`}
              >
                List
              </button>
            </div>
            <button
              onClick={handleCreateAlbum}
              className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Album</span>
            </button>
          </div>
        }
      />

      {/* Albums Grid */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {albums.map((album) => (
            <div
              key={album.id}
              onClick={() => setSelectedAlbum(album)}
              className="group bg-surface border border-border rounded-panel overflow-hidden shadow-card hover:shadow-dropdown transition-all cursor-pointer"
            >
              {/* Cover Image */}
              <div className="relative aspect-video bg-canvas flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-10" />
                <Image className="w-10 h-10 text-text-secondary/30" />
                <div className="absolute bottom-2 left-3 z-20">
                  <span className="text-white text-xs font-bold drop-shadow-sm">
                    {album.photoCount} photos
                  </span>
                </div>
                <div className="absolute top-2 right-2 z-20">
                  <StatusBadge status={album.status} />
                </div>
              </div>

              {/* Info */}
              <div className="p-4 space-y-1.5">
                <h3 className="text-sm font-bold text-text-primary line-clamp-1 font-marathi">
                  {album.title}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {new Date(album.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 font-marathi">
                  {album.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Albums List View */
        <div className="bg-surface border border-border rounded-panel divide-y divide-border">
          {albums.map((album) => (
            <div
              key={album.id}
              onClick={() => setSelectedAlbum(album)}
              className="flex items-center gap-4 p-4 hover:bg-canvas/50 cursor-pointer transition-colors"
            >
              <div className="w-20 h-14 bg-canvas rounded-control flex items-center justify-center border border-border flex-shrink-0">
                <Image className="w-6 h-6 text-text-secondary/40" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-text-primary truncate font-marathi">{album.title}</h4>
                <div className="flex items-center gap-3 text-[11px] text-text-secondary mt-0.5">
                  <span>{album.photoCount} photos</span>
                  <span>·</span>
                  <span>
                    {new Date(album.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <StatusBadge status={album.status} />
            </div>
          ))}
        </div>
      )}

      {/* Album Editor Drawer */}
      <Drawer
        isOpen={!!selectedAlbum}
        onClose={() => setSelectedAlbum(null)}
        title={selectedAlbum?.title || 'Album Editor'}
      >
        {selectedAlbum && (
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Album Title</label>
                <input
                  type="text"
                  defaultValue={selectedAlbum.title}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm font-marathi focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Event Date</label>
                  <input
                    type="date"
                    defaultValue={selectedAlbum.date}
                    className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Status</label>
                  <div className="flex items-center h-[42px]">
                    <StatusBadge status={selectedAlbum.status} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Description</label>
                <textarea
                  rows={3}
                  defaultValue={selectedAlbum.description}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm font-marathi focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>

            {/* Photos List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-text-primary uppercase">
                  Photos ({selectedAlbum.photos.length})
                </h4>
                <button className="px-3 py-1.5 rounded-control bg-canvas border border-border text-xs font-semibold text-text-primary hover:bg-zinc-100 flex items-center gap-1.5 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                </button>
              </div>

              <div className="space-y-2">
                {selectedAlbum.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="flex items-center gap-3 p-3 bg-canvas border border-border rounded-control"
                  >
                    <GripVertical className="w-4 h-4 text-text-secondary/50 cursor-grab flex-shrink-0" />
                    <div className="w-12 h-9 bg-zinc-200 rounded flex-shrink-0 flex items-center justify-center">
                      <Image className="w-4 h-4 text-text-secondary/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate">{photo.filename}</p>
                      <p className="text-[11px] text-text-secondary truncate font-marathi">{photo.caption}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-text-secondary">{photo.dimensions}</p>
                      <p className="text-[10px] text-text-secondary">{photo.size}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button
                onClick={handleSaveAlbum}
                className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
              >
                Save Draft
              </button>
              <button
                onClick={() => setSelectedAlbum(null)}
                className="px-4 py-2 rounded-control bg-canvas border border-border text-text-primary text-xs font-semibold hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
