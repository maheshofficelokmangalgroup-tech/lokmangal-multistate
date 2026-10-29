// Audit log (M20): read-only, filterable, exportable with its own permission.

import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Drawer, EmptyState, ErrorState, Input, KeyValue, PageHeader, Pagination, Select, StatusBadge, Table, TableSkeleton, Td, Th, useToast } from '../components/ui';
import { api, ApiError, download, qs, type AuditEvent, type List } from '../lib/api';
import { fmtDateTime, istLocalToIso } from '../lib/format';
import { useSession } from '../lib/session';

export function AuditPage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const set = (p: Record<string, string | undefined>) => navigate({ to: '/admin/audit', search: { ...search, page: undefined, ...p } as never, replace: true });
  const params = { ...search, from: search.from ? istLocalToIso(`${search.from}T00:00`) : undefined, to: search.to ? istLocalToIso(`${search.to}T23:59`) : undefined };
  const list = useQuery({ queryKey: ['audit', params], queryFn: () => api.get<List<AuditEvent>>(`/audit${qs(params)}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sign-in, change, approval, export and release. Entries cannot be edited or deleted from the admin panel."
        actions={can('audit.export') && <Button icon={<Download className="size-4" />} onClick={() => download(`/audit/export${qs({ ...params, page: undefined })}`, 'audit-log.csv').then(() => toast('success', 'Exported. The export itself was logged.')).catch((e) => toast('danger', e instanceof ApiError ? e.message : 'Export failed.'))}>Export CSV</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Input aria-label="Action starts with" placeholder="Action, e.g. lead. or release." value={search.action ?? ''} onChange={(e) => set({ action: e.target.value || undefined })} className="w-[240px]" />
          <Input aria-label="Entity type" placeholder="Entity type, e.g. enquiry" value={search.entity_type ?? ''} onChange={(e) => set({ entity_type: e.target.value || undefined })} className="w-[200px]" />
          <Input aria-label="Entity id or reference" placeholder="Reference / id" value={search.entity_id ?? ''} onChange={(e) => set({ entity_id: e.target.value || undefined })} className="w-[200px]" />
          <Select aria-label="Outcome" value={search.outcome ?? ''} onChange={(e) => set({ outcome: e.target.value || undefined })} className="w-[150px]">
            <option value="">Any outcome</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failure">Failure</option>
          </Select>
          <Input aria-label="From date" type="date" value={search.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="w-[160px]" />
          <Input aria-label="To date" type="date" value={search.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className="w-[160px]" />
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.data.length === 0 ? (
          <EmptyState title="No events match" />
        ) : (
          <>
            <Table label="Audit events">
              <thead>
                <tr>
                  <Th>When (IST)</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th className="hidden md:table-cell">Record</Th>
                  <Th>Outcome</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-canvas" onClick={() => setOpen(e)}>
                    <Td className="whitespace-nowrap text-[13px]">{fmtDateTime(e.at)}</Td>
                    <Td className="text-[13px]">{e.actor ?? 'System'}</Td>
                    <Td>
                      <button className="font-mono text-[12px] text-brand-primary underline" onClick={() => setOpen(e)}>
                        {e.action}
                      </button>
                    </Td>
                    <Td className="hidden font-mono text-[12px] md:table-cell">
                      {e.entity_type}
                      {e.entity_id && ` · ${e.entity_id}`}
                    </Td>
                    <Td>
                      <StatusBadge status={e.outcome} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.meta.page} perPage={list.data.meta.per_page} total={list.data.meta.total} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </Card>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title="Audit event">
        {open && (
          <div className="space-y-4">
            <KeyValue
              items={[
                ['When', fmtDateTime(open.at)],
                ['Who', open.actor ?? 'System'],
                ['Action', <code key="a">{open.action}</code>],
                ['Record', `${open.entity_type ?? '—'} ${open.entity_id ?? ''}`],
                ['Outcome', <StatusBadge key="o" status={open.outcome} />],
                ['IP address', open.ip],
                ['Request', open.request_id],
              ]}
            />
            <pre className="max-h-[50vh] overflow-auto rounded-md bg-canvas p-3 text-[12px] whitespace-pre-wrap">{JSON.stringify(open.details, null, 2)}</pre>
          </div>
        )}
      </Drawer>
    </>
  );
}
