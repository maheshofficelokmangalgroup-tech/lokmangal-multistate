// Social responsibility pillars and initiatives (admin panel: Pages & people).

import { singleton } from '../lib/content';

type Pillar = { icon: string; title: string };
type Initiative = { icon: string; title: string; stat: string; text: string; link?: string } & Record<string, unknown>;
const content = singleton<{ pillars: Pillar[]; initiatives: Initiative[] }>('csr');

export const csrPillars = content.pillars;
export const initiatives = content.initiatives;
