// Chairman, mentor and Board of Directors (admin panel: Pages & people).

import { singleton } from '../lib/content';
import type { Lang } from '../i18n';

type Person = { name: string; role: string; photo?: string };

export const peopleFor = (lang: Lang) => {
  const people = singleton<{ chairman: Required<Person>; mentor: Person; board: Required<Person>[] }>('people', lang);
  return { chairman: people.chairman, mentor: people.mentor, board: people.board };
};

export const { chairman, mentor, board } = peopleFor('en');
