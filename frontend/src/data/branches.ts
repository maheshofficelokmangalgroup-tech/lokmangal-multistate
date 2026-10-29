// Branch network, maintained in the admin panel (Branches). Inactive branches are left out of releases.

import { items } from '../lib/content';

export type Branch = { name: string; address: string; phones: string[] };
export type Division = { name: string; branches: Branch[] };

type BranchContent = Branch & { code: string; region: string; regionOrder: number; headOffice: boolean; active: boolean; order: number };

const all = items<BranchContent>('branch').filter((b) => b.active);
const office = all.find((b) => b.headOffice);
if (!office) throw new Error('Snapshot has no active head office branch');

export const headOffice: Branch = { name: office.name, address: office.address, phones: office.phones };

export const divisions: Division[] = (() => {
  const regions = new Map<string, { order: number; branches: Branch[] }>();
  for (const b of all.filter((x) => !x.headOffice)) {
    const r = regions.get(b.region) ?? { order: b.regionOrder, branches: [] };
    r.branches.push({ name: b.name, address: b.address, phones: b.phones });
    regions.set(b.region, r);
  }
  return [...regions.entries()].sort((a, b) => a[1].order - b[1].order).map(([name, r]) => ({ name, branches: r.branches }));
})();

export const branchCount = divisions.reduce((n, d) => n + d.branches.length, 0);
