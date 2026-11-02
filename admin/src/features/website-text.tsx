// "Website text": every fixed wording on the public site, in English and Marathi, editable page by page.
// The list comes from src/generated/page-text.json, written by the site build. Only changed texts are saved, as the
// page_text and product_text content items, so they have versions, an audit trail and publish like any other content.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Dialog, ErrorState, ErrorSummary, Field, InlineAlert, Input, PageHeader, Select, TableSkeleton, Textarea, useToast, useUnsavedChangesWarning } from '../components/ui';
import { api, ApiError, type ContentDetail, type ContentListItem, type Data, type List } from '../lib/api';
import { fmtRelative } from '../lib/format';

type Lang = 'en' | 'mr';
type Pair = { en?: string; mr?: string };
export type Texts = Record<string, Record<string, Pair>>;
type Catalog = Record<string, Record<string, { en: string; mr: string }>>;
type Collection = 'page_text' | 'product_text';

// Must match PRODUCT_TEXT_PAGES in backend/src/content/collections.rs.
const PRODUCT_PAGES = new Set(['deposits', 'deposit-scheme', 'loans', 'interest-rates', 'calculators', 'apply-desk', 'rate-wording']);
const collectionOf = (page: string): Collection => (PRODUCT_PAGES.has(page) ? 'product_text' : 'page_text');

// Sections in the order staff think of the site; a page added later still appears, after these.
const GROUPS: [string, string][] = [
  ['site:home', 'Home page'],
  ['about-us', 'About us'],
  ['chairman-message', "Chairman's message"],
  ['board-of-directors', 'Board of Directors'],
  ['social-responsibility', 'Social responsibility'],
  ['deposits', 'Deposits'],
  ['deposit-scheme', 'Each deposit scheme page'],
  ['loans', 'Loans'],
  ['interest-rates', 'Interest rates'],
  ['calculators', 'Calculators page'],
  ['apply-desk', 'Apply for a deposit or loan'],
  ['open-an-account', 'Open an account'],
  ['other-services', 'Other services'],
  ['rural-wealth-manager', 'Rural Wealth Manager'],
  ['branches', 'Branches'],
  ['careers', 'Careers'],
  ['contact-us', 'Contact us'],
  ['faq', 'FAQ'],
  ['blog', 'Blog and news list'],
  ['blog-post', 'A blog or news article'],
  ['gallery', 'Gallery'],
  ['notices', 'Notices'],
  ['annual-reports', 'Annual reports'],
  ['list-of-members', 'List of members'],
  ['sitemap', 'Sitemap'],
  ['privacy-policy', 'Privacy policy'],
  ['terms-of-use', 'Terms of use'],
  ['legal-doc', 'Privacy and terms: small labels'],
  ['enquiry-form', 'Enquiry forms'],
  ['site:menu', 'Header and menu'],
  ['site:footer', 'Footer'],
  ['site:forms', 'Form messages'],
  ['site:calc', 'Calculator'],
  ['site:search', 'Search'],
  ['site:other', 'Buttons and small labels'],
  ['rate-wording', 'Rates mentioned on other pages'],
];

export function groupOf(page: string, key: string): string {
  if (page !== 'site') return page;
  const prefix = key.split('.')[0];
  if (prefix === 'home') return 'site:home';
  if (['nav', 'mega', 'brand', 'lang', 'login', 'announce'].includes(prefix)) return 'site:menu';
  if (prefix === 'footer') return 'site:footer';
  if (prefix === 'form') return 'site:forms';
  if (prefix === 'calc') return 'site:calc';
  if (prefix === 'search') return 'site:search';
  return 'site:other';
}

const placeholdersIn = (s: string) => s.match(/\{[A-Za-z0-9_]+\}/g) ?? [];

/** The `{name}` placeholders of the original that a new text has lost. An emptied text goes back to the original, so it loses none. */
export function missingPlaceholders(original: string, value: string): string[] {
  return value.trim() ? placeholdersIn(original).filter((p) => !value.includes(p)) : [];
}

/** What gets saved: only texts that really differ from the original wording. */
export function pruneTexts(texts: Texts, catalog: Catalog): Texts {
  const out: Texts = {};
  for (const [page, rows] of Object.entries(texts)) {
    for (const [key, pair] of Object.entries(rows)) {
      const original = catalog[page]?.[key];
      const keep: Pair = {};
      for (const lang of ['en', 'mr'] as Lang[]) {
        const v = pair[lang];
        if (v?.trim() && v !== original?.[lang]) keep[lang] = v;
      }
      if (keep.en !== undefined || keep.mr !== undefined) (out[page] ??= {})[key] = keep;
    }
  }
  return out;
}

const rowsFor = (s: string) => Math.min(12, Math.max(1, Math.ceil(s.length / 52)));

type RowProps = { page: string; id: string; en: string; mr: string; valueEn?: string; valueMr?: string; group?: string; disabled: boolean; onChange: (page: string, id: string, lang: Lang, value: string | undefined) => void };

const Row = memo(function Row({ page, id, en, mr, valueEn, valueMr, group, disabled, onChange }: RowProps) {
  const shownEn = valueEn ?? en;
  const shownMr = valueMr ?? mr;
  const changed = shownEn !== en || shownMr !== mr;
  const lost = [...new Set([...missingPlaceholders(en, shownEn), ...missingPlaceholders(mr, shownMr)])];
  const needed = placeholdersIn(en);
  const hasTags = /<[a-z]/i.test(en);
  return (
    <div className="border-b border-line-subtle px-4 py-4 last:border-b-0 md:px-5">
      {(group || changed) && (
        <div className="mb-2 flex items-center gap-2">
          {group && <span className="text-[12px] font-semibold text-text-secondary">{group}</span>}
          {changed && <Badge tone="brand">Changed</Badge>}
          {changed && !disabled && (
            <button
              type="button"
              className="text-[12px] text-brand-primary underline"
              onClick={() => {
                onChange(page, id, 'en', undefined);
                onChange(page, id, 'mr', undefined);
              }}
            >
              Back to the original
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-text-secondary">English</span>
          <Textarea className="!min-h-0" rows={rowsFor(shownEn)} value={shownEn} disabled={disabled} invalid={missingPlaceholders(en, shownEn).length > 0} onChange={(e) => onChange(page, id, 'en', e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-text-secondary">मराठी</span>
          <Textarea className="!min-h-0" lang="mr" rows={rowsFor(shownMr)} value={shownMr} disabled={disabled} invalid={missingPlaceholders(mr, shownMr).length > 0} onChange={(e) => onChange(page, id, 'mr', e.target.value)} />
        </label>
      </div>
      {lost.length > 0 ? (
        <p className="mt-2 text-[12px] font-medium text-danger">Put {lost.join(' and ')} back: the website fills in the real value there.</p>
      ) : (
        (needed.length > 0 || hasTags) && (
          <p className="mt-2 text-[12px] text-text-secondary">
            {needed.length > 0 && `Keep ${[...new Set(needed)].join(' and ')} as written: the website fills in the real value. `}
            {hasTags && 'Keep the parts in angle brackets, such as <strong>: they make text bold or a link.'}
          </p>
        )
      )}
    </div>
  );
});

function useTextDoc(collection: Collection, catalog: Catalog | undefined) {
  const qc = useQueryClient();
  const queryKey = ['website-text', collection];
  const item = useQuery({
    queryKey,
    queryFn: async () => {
      const list = await api.get<List<ContentListItem, unknown>>(`/content/${collection}?per_page=1`);
      const id = list.data[0]?.id;
      return id ? (await api.get<Data<ContentDetail>>(`/content/${collection}/${id}`)).data : null;
    },
    retry: false,
  });
  const [texts, setTexts] = useState<Texts | null>(null);
  const server = (item.data?.draft.data as { texts?: Texts } | undefined)?.texts ?? {};
  useEffect(() => {
    if (item.data && texts === null) setTexts(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.data]);
  const current = texts ?? server;
  const pruned = useMemo(() => (catalog ? pruneTexts(current, catalog) : current), [current, catalog]);
  const dirty = !!item.data && JSON.stringify(pruned) !== JSON.stringify(pruneTexts(server, catalog ?? {}));
  const saved = (d: ContentDetail) => {
    qc.setQueryData(queryKey, d);
    setTexts((d.draft.data as { texts?: Texts }).texts ?? {});
    qc.invalidateQueries({ queryKey: ['content'] });
  };
  const save = useMutation({
    mutationFn: () => api.patch<Data<ContentDetail>>(`/content/${collection}/${item.data!.id}`, { data: { texts: pruned }, revision_id: item.data!.draft.id, lock_version: item.data!.draft.lock_version }),
    onSuccess: (r) => saved(r.data),
  });
  const submit = useMutation({
    mutationFn: (note: string) => api.post<Data<ContentDetail>>(`/content/${collection}/${item.data!.id}/submit`, { note }),
    onSuccess: (r) => saved(r.data),
  });
  const reload = async () => {
    save.reset();
    setTexts(null);
    await item.refetch();
  };
  return { item, current, setTexts, dirty, save, submit, reload };
}

export function WebsiteTextPage() {
  const search = useSearch({ strict: false }) as { page?: string };
  const navigate = useNavigate();
  const toast = useToast();
  const catalogQuery = useQuery({ queryKey: ['website-text-catalog'], queryFn: () => import('../generated/page-text.json').then((m) => m.default as Catalog), staleTime: Infinity });
  const catalog = catalogQuery.data;
  const docs = { page_text: useTextDoc('page_text', catalog), product_text: useTextDoc('product_text', catalog) };
  const [q, setQ] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [note, setNote] = useState('');
  const group = search.page ?? GROUPS[0][0];
  const labels = useMemo(() => new Map(GROUPS), []);

  const rows = useMemo(() => {
    const out: { page: string; id: string; en: string; mr: string; group: string }[] = [];
    for (const [page, texts] of Object.entries(catalog ?? {})) for (const [id, t] of Object.entries(texts)) out.push({ page, id, ...t, group: groupOf(page, id) });
    return out;
  }, [catalog]);

  const setTextsPage = docs.page_text.setTexts;
  const setTextsProduct = docs.product_text.setTexts;
  const onChange = useCallback(
    (page: string, id: string, lang: Lang, value: string | undefined) => {
      (collectionOf(page) === 'product_text' ? setTextsProduct : setTextsPage)((prev) => {
        const pair = { ...prev?.[page]?.[id] };
        if (value === undefined) delete pair[lang];
        else pair[lang] = value;
        return { ...prev, [page]: { ...prev?.[page], [id]: pair } };
      });
    },
    [setTextsPage, setTextsProduct],
  );

  const valueOf = (page: string, id: string) => docs[collectionOf(page)].current[page]?.[id];

  const changedByGroup = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const v = (collectionOf(r.page) === 'product_text' ? docs.product_text.current : docs.page_text.current)[r.page]?.[r.id];
      if (v && ((v.en !== undefined && v.en !== r.en) || (v.mr !== undefined && v.mr !== r.mr))) out[r.group] = (out[r.group] ?? 0) + 1;
    }
    return out;
  }, [rows, docs.page_text.current, docs.product_text.current]);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return rows.filter((r) => r.group === group);
    return rows.filter((r) => {
      const v = (collectionOf(r.page) === 'product_text' ? docs.product_text.current : docs.page_text.current)[r.page]?.[r.id];
      return [v?.en ?? r.en, v?.mr ?? r.mr].some((t) => t.toLowerCase().includes(needle));
    });
    // Searching follows what is on screen; retyping a text should not make it jump out of the results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, group, needle]);
  const shown = matches.slice(0, 100);

  const collection = needle ? (shown[0] ? collectionOf(shown[0].page) : 'page_text') : collectionOf(rows.find((r) => r.group === group)?.page ?? 'site');
  const doc = docs[collection];
  const d = doc.item.data;
  const anyDirty = docs.page_text.dirty || docs.product_text.dirty;
  useUnsavedChangesWarning(anyDirty);

  const canEdit = (c: Collection) => !!docs[c].item.data?.allowed.edit;
  const broken = rows.some((r) => {
    const v = valueOf(r.page, r.id);
    return v && (missingPlaceholders(r.en, v.en ?? r.en).length > 0 || missingPlaceholders(r.mr, v.mr ?? r.mr).length > 0);
  });

  const saveAll = async () => {
    try {
      for (const c of ['page_text', 'product_text'] as Collection[]) if (docs[c].dirty) await docs[c].save.mutateAsync();
      toast('success', 'Saved. Visitors see this after you publish the website.');
    } catch {
      /* the error is shown above the list */
    }
  };

  if (catalogQuery.isError) return <ErrorState error={catalogQuery.error} onRetry={() => catalogQuery.refetch()} />;
  if (!catalog || docs.page_text.item.isPending) return <TableSkeleton rows={10} />;
  if (docs.page_text.item.isError) return <ErrorState error={docs.page_text.item.error} onRetry={() => docs.page_text.item.refetch()} />;
  if (docs.page_text.item.data === null) {
    return (
      <InlineAlert tone="warning" title="Website text is not set up on this server yet">
        Run the content import once (see the runbook). The website keeps showing its original wording until then.
      </InlineAlert>
    );
  }
  const saveError = docs.page_text.save.error ?? docs.product_text.save.error;
  const conflict = saveError instanceof ApiError && saveError.code === 'edit_conflict';
  const inReview = d?.draft.status === 'in_review';
  const needsApproval = collection === 'product_text' && !!d;

  return (
    <>
      <PageHeader
        title="Website text"
        description="Change the wording of any page, in English and Marathi. Visitors see the new wording after you publish the website."
        meta={needsApproval && <Badge tone="warning">This section needs a checker's approval</Badge>}
      />

      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <label className="min-w-[220px] flex-1">
            <span className="sr-only">Choose a page</span>
            <Select
              value={group}
              disabled={!!needle}
              onChange={(e) => navigate({ to: '.', search: { page: e.target.value } as never, replace: true })}
            >
              {GROUPS.filter(([g]) => rows.some((r) => r.group === g)).map(([g, label]) => (
                <option key={g} value={g}>
                  {label}
                  {changedByGroup[g] ? ` (${changedByGroup[g]} changed)` : ''}
                </option>
              ))}
              {[...new Set(rows.map((r) => r.group))]
                .filter((g) => !labels.has(g))
                .map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
            </Select>
          </label>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
            <Input aria-label="Search all wording" placeholder="Search all wording, English or मराठी" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {saveError && !conflict && (
          <div className="p-4">
            <ErrorSummary error={saveError} />
          </div>
        )}
        {conflict && (
          <div className="p-4">
            <InlineAlert
              tone="danger"
              title="Someone else saved website text while you were editing"
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    docs.page_text.reload();
                    docs.product_text.reload();
                  }}
                >
                  Load their version
                </Button>
              }
            >
              Your unsaved changes here will be lost. Note them down first if you need them.
            </InlineAlert>
          </div>
        )}
        {inReview && (
          <div className="p-4">
            <InlineAlert tone="warning" title="Waiting for approval">
              Sent {fmtRelative(d?.draft.submitted_at)}. Saving another change withdraws that request.
            </InlineAlert>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-text-secondary">No wording matches “{q.trim()}”.</p>
        ) : (
          shown.map((r) => {
            const v = valueOf(r.page, r.id);
            return <Row key={`${r.page}/${r.id}`} page={r.page} id={r.id} en={r.en} mr={r.mr} valueEn={v?.en} valueMr={v?.mr} group={needle ? (labels.get(r.group) ?? r.group) : undefined} disabled={!canEdit(collectionOf(r.page))} onChange={onChange} />;
          })
        )}
        {matches.length > shown.length && <p className="px-5 py-3 text-center text-[13px] text-text-secondary">Showing the first {shown.length} of {matches.length}. Type more words to narrow it down.</p>}
      </Card>

      <div className="sticky bottom-0 z-20 -mx-4 mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        {anyDirty ? (
          <>
            <span className="mr-auto text-[13px] font-medium text-warning">{broken ? 'A text has lost a placeholder. Fix it to save.' : 'You have unsaved changes.'}</span>
            <Button variant="primary" disabled={broken} loading={docs.page_text.save.isPending || docs.product_text.save.isPending} onClick={saveAll}>
              Save changes
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto text-[13px] text-text-secondary">{d?.unreleased ? 'Saved, not live yet.' : 'Everything here is live on the website.'}</span>
            {needsApproval && d?.allowed.submit && d.unreleased && <Button onClick={() => setSubmitOpen(true)}>Send for approval</Button>}
            {d?.unreleased && (
              <Link to="/publish" className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-brand-primary px-4 text-[14px] font-medium text-white hover:bg-brand-hover">
                Publish website
              </Link>
            )}
          </>
        )}
      </div>

      <Dialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Send for approval"
        description="Someone else with approval rights must check this. You cannot approve your own change."
        footer={
          <>
            <Button onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!note.trim()}
              loading={doc.submit.isPending}
              onClick={() =>
                doc.submit.mutate(note, {
                  onSuccess: () => {
                    setSubmitOpen(false);
                    setNote('');
                    toast('success', 'Sent for approval. A checker has been notified.');
                  },
                })
              }
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorSummary error={doc.submit.error} />
          <Field label="What changed, and the source document" required>
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
    </>
  );
}
