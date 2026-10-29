// Chairman, mentor and Board of Directors (admin panel: Pages & people).

import { singleton } from '../lib/content';

type Person = { name: string; role: string; photo?: string };
const people = singleton<{ chairman: Required<Person>; mentor: Person; board: Required<Person>[] }>('people');

export const chairman = people.chairman;
export const mentor = people.mentor;
export const board = people.board;
