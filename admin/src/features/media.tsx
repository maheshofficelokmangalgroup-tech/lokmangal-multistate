// Media library (M14): upload with per-file progress, alt text, versions and "where used".
// Files are re-encoded by the server; only released content makes them public.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FileText, ImageIcon, Search, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, Drawer, EmptyState, ErrorState, ErrorSummary, Field, Input, KeyValue, PageHeader, Pagination, Select, TableSkeleton, useToast } from '../components/ui';
import { api, ApiError, qs, type Data, type List, type MediaDetail, type MediaItem, type MediaVariant } from '../lib/api';
import { fmtBytes, fmtDateTime } from '../lib/format';
import { useSession } from '../lib/session';

const fileUrl = (versionId: string | null, file: string) => (versionId ? `/api/admin/media/files/${versionId}/${file}` : '');

/** Public URL used in content: the 960px variant for images (or the largest), document.pdf for PDFs. */
export function publicUrl(variants: MediaVariant[] | null) {
  if (!variants?.length) return '';
  const best = variants.find((v) => v.file === '960.webp') ?? variants[variants.length - 1];
  return best.url;
}

function Thumb({ item }: { item: Pick<MediaItem, 'kind' | 'version_id' | 'variants' | 'alt' | 'title'> }) {
  const small = item.variants?.[0];
  return item.kind === 'image' && small ? (
    <img src={fileUrl(item.version_id, small.file)} alt={item.alt ?? ''} loading="lazy" className="size-full object-cover" />
  ) : (
    <div className="grid size-full place-items-center text-text-secondary">
      <FileText className="size-8" aria-hidden />
    </div>
  );
}

function UploadForm({ onDone }: { onDone: (m: MediaDetail) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isImage = file ? file.type.startsWith('image/') : true;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError(null);
        const form = new FormData();
        form.append('file', file);
        form.append('title', title || file.name);
        if (alt) form.append('alt', alt);
        if (decorative) form.append('decorative', 'true');
        try {
          const r = await api.upload<Data<MediaDetail>>('/media', form);
          onDone(r.data);
          setFile(null);
          setTitle('');
          setAlt('');
          if (input.current) input.current.value = '';
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorSummary error={error} />
      <Field label="File" required help="JPEG, PNG or WebP images up to 15 MB; PDFs up to 50 MB. Images are converted to WebP in three sizes.">
        {({ id, describedBy }) => <input ref={input} id={id} aria-describedby={describedBy} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-brand-hover" />}
      </Field>
      <Field label="Title">{({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name} />}</Field>
      {isImage && (
        <>
          <Field label="Description for screen readers (alt text)" required={!decorative} help="Describe what the image shows, e.g. “Chairman Rohan Deshmukh at the 2025 AGM”." error={error instanceof ApiError ? error.fields.alt : undefined}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} value={alt} onChange={(e) => setAlt(e.target.value)} disabled={decorative} />}
          </Field>
          <Checkbox label="This image is decorative" description="It adds no information (e.g. a background pattern)." checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
        </>
      )}
      <Button variant="primary" loading={busy} disabled={!file} icon={<UploadCloud className="size-4" />}>
        Upload
      </Button>
    </form>
  );
}

function MediaGrid({ kind, onSelect, selected }: { kind?: 'image' | 'document'; onSelect: (m: MediaItem) => void; selected?: string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(kind ?? '');
  const list = useQuery({ queryKey: ['media', q, filter, page], queryFn: () => api.get<List<MediaItem>>(`/media${qs({ q, kind: filter, page, per_page: 50 })}`), placeholderData: (p) => p });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
          <Input aria-label="Search media" placeholder="Search by title or description" className="pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        {!kind && (
          <Select aria-label="Type" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-[150px]">
            <option value="">All files</option>
            <option value="image">Images</option>
            <option value="document">PDFs</option>
          </Select>
        )}
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <TableSkeleton rows={3} />
      ) : list.data.data.length === 0 ? (
        <EmptyState icon={<ImageIcon className="size-5" />} title={q ? 'Nothing matches this search' : 'No files yet'}>Upload images and PDFs to use them in website content.</EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {list.data.data.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelect(m)}
                  aria-pressed={selected === m.id}
                  className={clsx('group w-full overflow-hidden rounded-[var(--radius-panel)] border bg-surface text-left transition-colors', selected === m.id ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-line hover:border-brand-primary/50')}
                >
                  <div className="aspect-[4/3] bg-canvas">
                    <Thumb item={m} />
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[13px] font-medium">{m.title}</p>
                    <p className="text-[11px] text-text-secondary">
                      {m.kind === 'image' ? `${m.width}×${m.height}` : 'PDF'} · {fmtBytes(m.size_bytes)}
                      {m.usage > 0 && ` · used ${m.usage}×`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={list.data.meta.page} perPage={list.data.meta.per_page} total={list.data.meta.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

/** Used by content forms: pick an existing file or upload one, returning its public URL. */
export function MediaPicker({ open, onOpenChange, accept, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; accept?: 'image' | 'document'; onPick: (url: string) => void }) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const { can } = useSession();
  const qc = useQueryClient();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={accept === 'document' ? 'Choose a PDF' : 'Choose an image'} wide>
      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={tab === 'library' ? 'primary' : 'secondary'} onClick={() => setTab('library')}>
          Media library
        </Button>
        {can('media.upload') && (
          <Button size="sm" variant={tab === 'upload' ? 'primary' : 'secondary'} onClick={() => setTab('upload')}>
            Upload new
          </Button>
        )}
      </div>
      {tab === 'library' ? (
        <MediaGrid
          kind={accept}
          onSelect={(m) => {
            onPick(publicUrl(m.variants));
            onOpenChange(false);
          }}
        />
      ) : (
        <UploadForm
          onDone={(m) => {
            qc.invalidateQueries({ queryKey: ['media'] });
            onPick(publicUrl(m.current.variants));
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}

function MediaDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const detail = useQuery({ queryKey: ['media', 'detail', id], queryFn: () => api.get<Data<MediaDetail>>(`/media/${id}`).then((r) => r.data), enabled: !!id });
  const [edit, setEdit] = useState<{ title: string; alt: string; decorative: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch<Data<MediaDetail>>(`/media/${id}`, { title: edit!.title, alt: edit!.alt || null, decorative: edit!.decorative }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] });
      setEdit(null);
      toast('success', 'Saved.');
    },
  });
  const replace = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData();
      f.append('file', file);
      return api.upload<Data<MediaDetail>>(`/media/${id}/versions`, f);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] });
      toast('success', 'New version uploaded. Update content to use it, then publish.');
    },
  });
  const retire = useMutation({
    mutationFn: () => api.del(`/media/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] });
      setConfirm(false);
      onClose();
      toast('success', 'File retired.');
    },
  });
  const m = detail.data;
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={m?.title ?? 'File'}>
      {detail.isError && <ErrorState error={detail.error} />}
      {m && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-canvas">
            {m.kind === 'image' && m.current.variants?.length ? (
              <img src={fileUrl(m.current.id, m.current.variants[m.current.variants.length - 1].file)} alt={m.alt ?? ''} className="max-h-72 w-full object-contain" />
            ) : (
              <a href={fileUrl(m.current.id, 'document.pdf')} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-6 text-brand-primary underline">
                <FileText className="size-6" /> Open PDF
              </a>
            )}
          </div>
          <ErrorSummary error={save.error ?? replace.error ?? retire.error} />
          {edit ? (
            <div className="space-y-3">
              <Field label="Title" required>{({ id: fid }) => <Input id={fid} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />}</Field>
              {m.kind === 'image' && (
                <>
                  <Field label="Alt text" required={!edit.decorative}>{({ id: fid }) => <Input id={fid} value={edit.alt} disabled={edit.decorative} onChange={(e) => setEdit({ ...edit, alt: e.target.value })} />}</Field>
                  <Checkbox label="Decorative image" checked={edit.decorative} onChange={(e) => setEdit({ ...edit, decorative: e.target.checked })} />
                </>
              )}
              <div className="flex gap-2">
                <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
                <Button onClick={() => setEdit(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <KeyValue
              items={[
                ['Alt text', m.decorative ? <Badge key="d">Decorative</Badge> : m.alt ?? <span className="text-danger" key="a">Missing</span>],
                ['Original file', m.current.original_name],
                ['Size', `${fmtBytes(m.current.size_bytes)}${m.current.width ? ` · ${m.current.width}×${m.current.height}px` : ''}`],
                ['Public URL', <code className="text-[12px] break-all" key="u">{publicUrl(m.current.variants)}</code>],
                ['Checksum', <code className="text-[11px] break-all" key="c">{m.current.sha256}</code>],
                ['Uploaded', `${fmtDateTime(m.created_at)} by ${m.created_by ?? '—'}`],
                ['Versions', m.versions.map((v) => `v${v.version} ${v.original_name}`).join(', ')],
              ]}
            />
          )}
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Where used</h3>
            {m.used_by.length === 0 ? (
              <p className="text-[13px] text-text-secondary">Not used by any content.</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {m.used_by.map((u) => (
                  <li key={u.item_id}>
                    <a className="text-brand-primary underline" href={`/content/${u.collection}/${u.item_id}`}>
                      {u.collection.replace('_', ' ')} / {u.slug}
                    </a>{' '}
                    {u.live && <Badge tone="success">Live</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {can('media.manage') && !edit && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button onClick={() => setEdit({ title: m.title, alt: m.alt ?? '', decorative: m.decorative })}>Edit details</Button>
              <label className="inline-flex h-[42px] cursor-pointer items-center rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas">
                Upload new version
                <input type="file" className="sr-only" accept={m.kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'application/pdf'} onChange={(e) => e.target.files?.[0] && replace.mutate(e.target.files[0])} />
              </label>
              <Button variant="danger" disabled={m.used_by.length > 0} title={m.used_by.length > 0 ? 'Remove it from content first' : undefined} onClick={() => setConfirm(true)}>
                Retire
              </Button>
            </div>
          )}
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Retire this file?" description="It will no longer be offered in the media library. Releases that already include it keep their copy." confirmLabel="Retire" danger loading={retire.isPending} onConfirm={() => retire.mutate()} />
        </div>
      )}
    </Drawer>
  );
}

export function MediaPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Media library"
        description="Images and PDFs used on the website. A file becomes public only when content that uses it is published."
        actions={can('media.upload') && <Button variant="primary" icon={<UploadCloud className="size-4" />} onClick={() => setUploadOpen(true)}>Upload</Button>}
      />
      <Card>
        <MediaGrid onSelect={(m) => setSelected(m.id)} selected={selected ?? undefined} />
      </Card>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Upload a file">
        <UploadForm
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['media'] });
            setUploadOpen(false);
            toast('success', 'Uploaded.');
          }}
        />
      </Dialog>
      <MediaDetailDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
