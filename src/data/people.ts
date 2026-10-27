export const chairman = {
  name: 'Hon. Mr. Rohan Subhash Deshmukh',
  role: 'Chairman, Lokmangal Multistate Co-operative Society Ltd.',
  photo: '/images/people/chairman.webp',
};

export const mentor = { name: 'Hon. Mr. Subhash (Bapu) Deshmukh', role: 'Mentor & Founder' };

export const board = [
  { name: 'Mr. Rohan Subhash Deshmukh', role: 'Chairman' },
  { name: 'Mr. Avinash Laxman Mahagaonkar', role: 'Director' },
  { name: 'Mr. Shivaji Kalyanrao Patil', role: 'Director' },
  { name: 'Mr. Ramraje Rajesaheb Patil', role: 'Director' },
  { name: 'Mr. Bhimashankar Sidram Narasgonde', role: 'Director' },
  { name: 'Mr. Shilratna Chandrakant Gaikwad', role: 'Director' },
  { name: 'Mr. Nilesh Mahendrabhai Patel', role: 'Director' },
  { name: 'Mr. Abhimanyu Ashok Jadhav', role: 'Director' },
  { name: 'Mr. Deviprasad Sharadsharan Kulkarni', role: 'Director' },
  { name: 'Mrs. Vaishali Avinash Bhise', role: 'Director' },
  { name: 'Mrs. Ujjawala Dattajirao Suryawanshi', role: 'Director' },
].map((p, i) => ({ ...p, photo: `/images/people/board-${String(i + 1).padStart(2, '0')}.webp` }));
