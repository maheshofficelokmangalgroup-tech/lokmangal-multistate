// Adds Marathi text to seed/snapshot.json as an "mr" overlay next to the English text of each item. Running it
// again replaces the overlay of the items listed here and leaves everything else alone. After changing the
// seed, import it into a running system with:  lokmangal-cli import-seed frontend/seed/snapshot.json
//
//   node scripts/apply-marathi.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../seed/snapshot.json', import.meta.url));
const snap = JSON.parse(readFileSync(path, 'utf8'));

const set = (data, mr) => {
  data.mr = mr;
};
const bySlug = (collection, slug) => {
  const item = snap.collections[collection].find((i) => i.slug === slug || i.data.slug === slug);
  if (!item) throw new Error(`${collection}/${slug} is not in the seed`);
  return item.data;
};

// ---------------------------------------------------------------- organisation
set(snap.singletons.settings, {
  name: 'लोकमंगल मल्टीस्टेट',
  legalName: 'लोकमंगल मल्टीस्टेट को-ऑपरेटिव्ह सोसायटी लि.',
  // The society's own Marathi motto (settings.taglineMr), not a translation of the English one.
  tagline: 'अखंड गतीतून सार्थकता',
  description:
    'लोकमंगल मल्टीस्टेट को-ऑपरेटिव्ह सोसायटी लि., सोलापूर: बचत, मुदत व रिकरिंग ठेवी (वार्षिक 10% पर्यंत व्याज), तसेच महाराष्ट्र आणि कर्नाटकातील 60 शाखांमधून शेती, गृह, वाहन आणि व्यवसाय कर्ज.',
  act: 'बहुराज्य सहकारी संस्था कायदा, 2002',
  address: { line1: 'प्लॉट क्र. 94, मित्र नगर', line2: 'रब्बी रिसर्च सेंटरजवळ, शेळगी', city: 'सोलापूर', state: 'महाराष्ट्र' },
});

set(snap.singletons.home, {
  stats: [
    { label: 'शाखा', sub: 'महाराष्ट्र आणि कर्नाटकात' },
    { suffix: '+ कोटी', label: 'एकूण ठेवी', sub: 'सभासदांनी सोपवलेल्या' },
    { suffix: '+ कोटी', label: 'एकूण व्यवसाय', sub: 'आणि दरवर्षी वाढणारा' },
    { suffix: ' लाख+', label: 'समाधानी सभासद', sub: 'लोकमंगल परिवाराचा भाग' },
  ],
  announcement: { label: 'निवडणूक 2025:', text: 'संचालक मंडळ व पदाधिकारी निवडणुकीच्या सूचना प्रसिद्ध झाल्या आहेत.', linkText: 'सूचना पहा' },
});

set(snap.singletons.navigation, {
  nav: [
    { label: 'मुख्यपृष्ठ' },
    {
      label: 'आमच्याबद्दल',
      children: [
        { label: 'लोकमंगलबद्दल', desc: '2004 पासूनची वाटचाल' },
        { label: 'अध्यक्षांचा संदेश', desc: 'अध्यक्षांचे मनोगत' },
        { label: 'संचालक मंडळ', desc: 'आमचे नेतृत्व करणारे' },
        { label: 'सामाजिक बांधिलकी', desc: 'लोकमंगल फाउंडेशनचे उपक्रम' },
        { label: 'वार्षिक अहवाल', desc: 'कामगिरी आणि माहिती' },
        { label: 'छायाचित्रे', desc: 'आमच्या वाटचालीतील क्षण' },
      ],
    },
    { label: 'आमची उत्पादने' },
    { label: 'इतर सेवा' },
    { label: 'रुरल वेल्थ मॅनेजर' },
    { label: 'प्रश्नोत्तरे' },
    { label: 'शाखा' },
  ],
  footerLinks: {
    quick: [{ label: 'मुख्यपृष्ठ' }, { label: 'आमच्याबद्दल' }, { label: 'मुदत ठेवी' }, { label: 'कर्ज' }, { label: 'व्याजदर' }, { label: 'प्रश्नोत्तरे' }, { label: 'आमच्या शाखा' }],
    other: [{ label: 'संपर्क' }, { label: 'ब्लॉग' }, { label: 'करिअर' }, { label: 'सूचना' }, { label: 'कॅल्क्युलेटर' }, { label: 'वापराच्या अटी' }, { label: 'गोपनीयता धोरण' }, { label: 'साइटमॅप' }],
  },
});

set(snap.singletons.people, {
  chairman: { name: 'मा. श्री. रोहन सुभाष देशमुख', role: 'अध्यक्ष, लोकमंगल मल्टीस्टेट को-ऑपरेटिव्ह सोसायटी लि.' },
  mentor: { name: 'मा. श्री. सुभाष (बापू) देशमुख', role: 'मार्गदर्शक आणि संस्थापक' },
  // Same order as the English board list.
  board: [
    ['श्री. रोहन सुभाष देशमुख', 'अध्यक्ष'],
    ['श्री. अविनाश लक्ष्मण महागावकर', 'संचालक'],
    ['श्री. शिवाजी कल्याणराव पाटील', 'संचालक'],
    ['श्री. रामराजे राजेसाहेब पाटील', 'संचालक'],
    ['श्री. भीमाशंकर सिद्राम नरसगोंडे', 'संचालक'],
    ['श्री. शीलरत्न चंद्रकांत गायकवाड', 'संचालक'],
    ['श्री. निलेश महेंद्रभाई पटेल', 'संचालक'],
    ['श्री. अभिमन्यू अशोक जाधव', 'संचालक'],
    ['श्री. देवीप्रसाद शरदशरण कुलकर्णी', 'संचालक'],
    ['सौ. वैशाली अविनाश भिसे', 'संचालक'],
    ['सौ. उज्ज्वला दत्ताजीराव सूर्यवंशी', 'संचालक'],
  ].map(([name, role]) => ({ name, role })),
});
if (snap.singletons.people.mr.board.length !== snap.singletons.people.board.length) throw new Error('board changed; update the Marathi list');

// ---------------------------------------------------------------- deposit schemes
const tds = { label: 'टीडीएस', value: 'व्याजावर लागू, संस्थेच्या सभासदांना वगळून' };
const type = (value) => ({ label: 'योजनेचा प्रकार', value });
const lakshadish = (slug, n, monthly, months) =>
  set(bySlug('deposit_scheme', slug), {
    name: `लक्षदिश (रिकरिंग) ठेव योजना ${n}`,
    rateNote: 'वार्षिक',
    pitch: `दरमहा ₹${monthly} बचत करा आणि ${months} महिन्यांत लखपती व्हा.`,
    highlight: [{ label: 'मासिक' }, { label: 'मुदत', value: `${months} महिने` }, { label: 'परिपक्वता' }],
    facts: [type('रिकरिंग ठेव'), { label: 'व्याजदर', value: 'वार्षिक {rate2:deposit.lakshadish}%' }, { label: 'मासिक हप्ता' }, { label: 'मुदत', value: `${months} महिने` }, { label: 'मुदतपूर्ती रक्कम' }, tds],
  });

// Shared Marathi for the longer scheme text (intro, features, eligibility), keyed by the English wording.
const featureMr = {
  'Attractive interest rates': 'आकर्षक व्याजदर',
  'Flexible tenure': 'लवचिक मुदत',
  'Ease and convenience': 'सोपी आणि सोयीची प्रक्रिया',
  'Stable, assured returns': 'स्थिर आणि खात्रीशीर परतावा',
  'Safety and liquidity': 'सुरक्षितता आणि तरलता',
  'Nomination facility': 'वारसदार नेमण्याची सुविधा',
  'Easy monthly instalments': 'सोपे मासिक हप्ते',
  'Build a significant corpus': 'मोठी रक्कम जमा होते',
  'Guaranteed maturity value': 'खात्रीशीर मुदतपूर्ती रक्कम',
  'Convenient to operate': 'वापरण्यास सोपे',
  'One-time deposit': 'एकदाच ठेव',
};
const lakshadishText = {
  intro: 'लक्षदिश, म्हणजेच लखपती ठेव योजना, दरमहा ठराविक छोट्या बचतीतून एक लाख रुपयांहून अधिक खात्रीशीर रक्कम उभी करते. तुमच्या बजेटला साजेसा हप्ता निवडा, तो दर महिन्याला भरा आणि मुदत संपल्यावर मुदतपूर्ती रक्कम मिळवा.',
  eligibility: 'व्यक्ती (एकट्या किंवा संयुक्त), पालकांमार्फत अज्ञान, एचयूएफ, संघटना, संस्था, ट्रस्ट आणि क्लब लक्षदिशमध्ये गुंतवणूक करू शकतात.',
};
const schemeTextMr = {
  'vishwamangal-fixed-deposit-scheme': {
    intro: 'निष्क्रिय बचत निर्धास्तपणे वाढवा. विश्वमंगल मुदत ठेव सहकार क्षेत्रातील सर्वात आकर्षक दरांपैकी एक देते; मुदत 7 दिवसांपासून पुढे, मुलांचे शिक्षण, नवीन घर किंवा घरातील लग्न अशा उद्दिष्टांसाठी उपयुक्त.',
    eligibility: 'ज्येष्ठ नागरिक आणि हिंदू अविभक्त कुटुंबांसह (एचयूएफ) कोणतीही निवासी भारतीय व्यक्ती किंवा संस्था मुदत ठेव उघडू शकते.',
  },
  'vishvamangal-monthly-interest': {
    intro: 'एकदाच रक्कम ठेवा आणि दर महिन्याला व्याज खात्यात मिळवा. मुद्दलाला हात न लावता नियमित मासिक उत्पन्न हवे असलेले निवृत्त, गृहिणी आणि इतर सर्वांसाठी विश्वमंगल मासिक व्याज योजना.',
    eligibility: 'ज्येष्ठ नागरिक आणि एचयूएफसह कोणतीही निवासी भारतीय व्यक्ती किंवा संस्था गुंतवणूक करू शकते.',
  },
  'vishvamangal-recurring-deposit': {
    intro: 'दर महिन्याला थोडी बचत करून बचतीची सवय लावा. 12 ते 60 महिन्यांपैकी कोणतीही मुदत निवडा, दरमहा फक्त ₹100 पासून सुरुवात करा आणि वार्षिक {rate2:deposit.vishwamangal-rd}% दराने पैसे वाढताना पहा.',
    eligibility: 'पालकामार्फत अज्ञानांसह कोणतीही निवासी भारतीय व्यक्ती किंवा संस्था रिकरिंग ठेव उघडू शकते.',
  },
  'lakshadish-deposit-scheme-1': lakshadishText,
  'lakshadish-deposit-scheme-2': lakshadishText,
  'lakshadish-deposit-scheme-3': lakshadishText,
  'lakshadish-deposit-scheme-4': lakshadishText,
  'daam-duppat-yojna': {
    intro: 'साधे वचन: एकदा ठेव ठेवा आणि मुदतपूर्तीला दुप्पट रक्कम मिळवा. दाम दुप्पट योजनेत तुमची ठेव {number:doubling.general.months} महिन्यांत दुप्पट होते; ज्येष्ठ नागरिक, दिव्यांग, माजी सैनिक, एकल पालक आणि 50 वर्षांवरील विधवा यांच्यासाठी त्याहूनही लवकर, {number:doubling.special.months} महिन्यांत.',
    eligibility: 'कोणतीही निवासी भारतीय व्यक्ती किंवा संस्था गुंतवणूक करू शकते; विशेष गटांना कमी, {number:doubling.special.months} महिन्यांची मुदत मिळते.',
  },
  'vishvamangal-fixed-deposit-scheme-2': {
    intro: 'वार्षिक {rate:deposit.vishwamangal-12m}% दराने सरळ एक वर्षाची ठेव. आज ₹1,00,000 गुंतवा आणि 12 महिन्यांनंतर {calc} मिळवा; अल्प मुदतीच्या उद्दिष्टांसाठी स्पष्ट आणि निश्चित परतावा.',
    eligibility: 'ज्येष्ठ नागरिक आणि एचयूएफसह कोणतीही निवासी भारतीय व्यक्ती किंवा संस्था गुंतवणूक करू शकते.',
  },
};

set(bySlug('deposit_scheme', 'vishwamangal-fixed-deposit-scheme'), {
  name: 'विश्वमंगल मुदत ठेव योजना',
  rateNote: 'वार्षिक, 365 दिवस व त्याहून अधिक मुदतीसाठी',
  pitch: 'वार्षिक {rate:fd.365-plus.regular}% पर्यंत व्याज, मुदत फक्त 7 दिवसांपासून.',
  highlight: [{ label: 'मुदत', value: '7 दिवस +' }, { label: 'कमाल दर' }, { label: 'विशेष दर' }],
  facts: [
    type('मुदत ठेव'),
    { label: '7 ते 30 दिवस', value: 'वार्षिक {rate2:fd.7-30.regular}%' },
    { label: '31 ते 90 दिवस', value: 'वार्षिक {rate2:fd.31-90.regular}%' },
    { label: '91 ते 180 दिवस', value: 'वार्षिक {rate2:fd.91-180.regular}%' },
    { label: '181 ते 364 दिवस', value: 'वार्षिक {rate2:fd.181-364.regular}%' },
    { label: '365 दिवस व त्याहून अधिक', value: 'वार्षिक {rate2:fd.365-plus.regular}%' },
    tds,
  ],
});
set(bySlug('deposit_scheme', 'vishvamangal-monthly-interest'), {
  name: 'विश्वमंगल मासिक ठेव योजना',
  rateNote: 'वार्षिक, दरमहा व्याज',
  pitch: 'तुमच्या बचतीवर दरमहा नियमित उत्पन्न, सर्व ठेवीदारांना {rate2:deposit.vishwamangal-monthly}%.',
  highlight: [{ label: 'ठेव' }, { label: 'दरमहा' }, { label: 'मुदत', value: '12 महिने +' }],
  facts: [
    type('मासिक व्याज योजना'),
    { label: 'व्याजदर', value: 'सर्व ठेवीदारांसाठी वार्षिक {rate2:deposit.vishwamangal-monthly}%' },
    { label: 'मुदत', value: '12 महिने व त्याहून अधिक' },
    { label: 'उदाहरण', value: '₹1,00,000 वर दरमहा सुमारे {calc} व्याज' },
    tds,
  ],
});
set(bySlug('deposit_scheme', 'vishvamangal-recurring-deposit'), {
  name: 'विश्वमंगल रिकरिंग ठेव योजना',
  rateNote: 'वार्षिक',
  pitch: 'दरमहा फक्त ₹100 पासून बचत सुरू करा, वार्षिक {rate2:deposit.vishwamangal-rd}% दराने.',
  highlight: [{ label: 'किमान', value: '₹100/महिना' }, { label: 'मुदत', value: '12 ते 60 महिने' }, { label: 'दर' }],
  facts: [
    type('रिकरिंग ठेव'),
    { label: 'व्याजदर', value: 'वार्षिक {rate2:deposit.vishwamangal-rd}%' },
    { label: 'मुदत', value: '12 ते 60 महिने' },
    { label: 'किमान हप्ता', value: 'दरमहा ₹100' },
    tds,
  ],
});
lakshadish('lakshadish-deposit-scheme-1', 1, '3,800', 24);
lakshadish('lakshadish-deposit-scheme-2', 2, '2,450', 36);
lakshadish('lakshadish-deposit-scheme-3', 3, '1,750', 48);
lakshadish('lakshadish-deposit-scheme-4', 4, '1,350', 60);
set(bySlug('deposit_scheme', 'daam-duppat-yojna'), {
  name: 'दाम दुप्पट ठेव योजना',
  rateNote: 'रक्कम दुप्पट',
  pitch: 'तुमची रक्कम {number:doubling.general.months} महिन्यांत दुप्पट, विशेष गटांसाठी {number:doubling.special.months} महिन्यांत.',
  highlight: [{ label: 'ठेव' }, { label: 'परिपक्वता' }, { label: 'मुदत', value: '{number:doubling.special.months} ते {number:doubling.general.months} महिने' }],
  facts: [
    type('दामदुप्पट ठेव'),
    { label: 'सर्वसाधारण ठेवीदार', value: '{number:doubling.general.months} महिन्यांत दुप्पट' },
    { label: 'विशेष गट', value: '{number:doubling.special.months} महिन्यांत दुप्पट' },
    { label: 'किमान ठेव', value: '₹100 व त्यावर' },
    { label: 'उदाहरण', value: '₹1,00,000 चे ₹2,00,000 होतात' },
    tds,
  ],
});
set(bySlug('deposit_scheme', 'vishvamangal-fixed-deposit-scheme-2'), {
  name: 'विश्वमंगल 12 महिन्यांची मुदत ठेव',
  rateNote: 'वार्षिक, 12 महिन्यांसाठी',
  pitch: 'प्रत्येक ₹1 लाखावर एका वर्षात {calc:interest} व्याज मिळवा.',
  highlight: [{ label: 'ठेव' }, { label: 'परिपक्वता' }, { label: 'मुदत', value: '12 महिने' }],
  facts: [
    type('मुदत ठेव'),
    { label: 'व्याजदर', value: 'वार्षिक {rate:deposit.vishwamangal-12m}%' },
    { label: 'मुदत', value: '12 महिने' },
    { label: 'उदाहरणातील ठेव' },
    { label: 'मिळणारे व्याज' },
    { label: 'मुदतपूर्ती रक्कम' },
    tds,
  ],
});

// Add the longer text to every scheme's overlay.
for (const item of snap.collections.deposit_scheme) {
  const d = item.data;
  const text = schemeTextMr[d.slug];
  if (!text) throw new Error(`no Marathi intro for ${d.slug}`);
  const features = d.features.map((f) => {
    if (!featureMr[f]) throw new Error(`${d.slug}: no Marathi for feature "${f}"`);
    return featureMr[f];
  });
  d.mr = { ...d.mr, intro: text.intro, eligibility: text.eligibility, features };
}

set(snap.singletons.deposit_page, {
  specialCategories: 'ज्येष्ठ नागरिक, दिव्यांग व्यक्ती, माजी सैनिक, एकल पालक, 50 वर्षांवरील विधवा, तसेच ₹25 लाख व त्याहून अधिकच्या मोठ्या ठेवी (किंवा संस्था).',
  documents: ['पॅन कार्ड', 'आधार कार्ड', 'वीज बिल (पत्त्याचा पुरावा)', 'फोटो असलेले ओळखपत्र', 'पासपोर्ट आकाराचे तीन फोटो', 'फॉर्म 60 / 61 (पॅन नसल्यास)'],
  benefits: [
    { title: 'वार्षिक 10% पर्यंत', text: 'सहकार क्षेत्रातील सर्वाधिक फायदेशीर ठेव दरांपैकी एक.' },
    { title: 'सुरक्षित आणि नियमित', text: 'बहुराज्य सहकारी संस्था कायदा, 2002 अंतर्गत नोंदणीकृत.' },
    { title: 'लवचिक मुदत', text: '7 दिवसांपासून 88 महिन्यांपर्यंत. तुमच्या उद्दिष्टाला साजेशी मुदत निवडा.' },
    { title: 'वारसदार सुविधा', text: 'सोप्या वारसदार नोंदणीने कुटुंबाचे भविष्य सुरक्षित करा.' },
  ],
});
if (snap.singletons.deposit_page.documents.length !== 6 || snap.singletons.deposit_page.benefits.length !== 4) throw new Error('deposit page changed; update the Marathi text');

// ---------------------------------------------------------------- loans
const loanLabels = {
  'Loan amount': 'कर्जाची रक्कम',
  'Rate of interest': 'व्याजदर',
  Margin: 'मार्जिन',
  Guarantors: 'जामीनदार',
  Membership: 'सभासदत्व',
  Security: 'तारण',
  Documents: 'कागदपत्रे',
  Instalment: 'हप्ता',
  Period: 'कालावधी',
};
const member = 'सभासद / नाममात्र';
/** values: one entry per English detail row; null keeps the English value (numbers, placeholders). */
const loan = (slug, mr, values) => {
  const data = bySlug('loan', slug);
  if (values.length !== data.details.length) throw new Error(`${slug}: ${values.length} values for ${data.details.length} detail rows`);
  mr.details = data.details.map((d, i) => {
    const label = loanLabels[d.label];
    if (!label) throw new Error(`${slug}: no Marathi label for "${d.label}"`);
    return values[i] === null ? { label } : { label, value: values[i] };
  });
  set(data, mr);
};

loan('agriculture-term-loan', { name: 'कृषी मुदत कर्ज', amount: '₹90 लाखांपर्यंत', summary: 'शेती अवजारे, सिंचन, जमीन विकास आणि शेतीशी संबंधित कामांसाठी अर्थसाहाय्य.' }, [
  '₹90 लाखांपर्यंत',
  '₹25,000 पर्यंत {rate:loan.agriculture.up-to-25000}% · ₹25,000 पेक्षा जास्त {rate:loan.agriculture.above-25000}%',
  'नफ्याच्या 25%',
  null,
  member,
  'जमीन 7/12 गहाण',
  'मूल्यांकन, गहाणखत, कारखाना हमी, फोटो, रेशन कार्ड, मालमत्ता 7/12',
]);
loan('housing-loan', { name: 'गृह कर्ज', amount: '₹90 लाखांपर्यंत', summary: 'परवडणाऱ्या दरात आणि सोयीच्या परतफेडीसह तुमचे स्वप्नातील घर विकत घ्या, बांधा किंवा वाढवा.' }, [
  '₹90 लाखांपर्यंत, गृहप्रकल्पानुसार',
  null,
  'अंदाजपत्रकाच्या 1/4',
  'किमान 2',
  member,
  'जमीन व इमारत',
  'मूल्यांकन, शोध अहवाल, चालू 7/12, खरेदी कागदपत्रे, बांधकाम परवानगी, उत्पन्नाचा पुरावा, फोटो, पत्त्याचा पुरावा, नकाशा',
]);
loan('vehicle-loan', { name: 'वाहन कर्ज', amount: 'कोटेशननुसार', summary: 'नवी कार, दुचाकी किंवा व्यावसायिक वाहन घरी आणा. कोणीही अर्ज करू शकतो.' }, [
  'कोटेशननुसार',
  null,
  '1/4 (25%)',
  null,
  member,
  'वाहनाचे आरसी बुक (हायपोथिकेशन)',
  'कोटेशन, उत्पन्नाचा दाखला, आयकर विवरणपत्रे',
]);
loan('personal-loan', { name: 'वैयक्तिक कर्ज', amount: '₹1 लाखापर्यंत', summary: 'विवाह, वैद्यकीय गरज, प्रवास किंवा कोणत्याही वैयक्तिक गरजेसाठी जलद निधी.' }, [
  '₹1 लाखापर्यंत',
  null,
  null,
  member,
  'हमीपत्र / चेकबुक',
  'फोटो, रेशन कार्ड, पगाराचा दाखला किंवा उत्पन्नाचा पुरावा',
]);
loan('warehouse-loan', { name: 'वखार (वेअरहाउस) कर्ज', amount: 'मूल्यांकनानुसार', summary: 'साठवलेला शेतमाल व वस्तूंचे मूल्य सोयीच्या मासिक हप्त्यांत वापरा.' }, [
  null,
  'मासिक',
  null,
  'मूल्यांकन, गहाणखत, हमी, फोटो, ओळखपत्र, पत्त्याचा पुरावा',
]);
loan('cash-credit', { name: 'कॅश क्रेडिट', rate: 'कृषी मुदत कर्जाप्रमाणे', amount: '₹90 लाखांपर्यंत', summary: 'व्यापारी व व्यावसायिकांसाठी लवचिक खेळते भांडवल. वापरलेल्या रकमेवरच व्याज भरा.' }, [
  '₹90 लाखांपर्यंत',
  'कृषी मुदत कर्जाप्रमाणेच',
  'किमान 2',
  member,
  'मालमत्ता गहाण',
  'चालू 7/12, मूल्यांकन, शोध अहवाल, उत्पन्नाचा पुरावा, पत्त्याचा पुरावा',
]);
loan('hypothecation-loan', { name: 'हायपोथिकेशन कर्ज', rate: 'कृषी मुदत कर्जाप्रमाणे', amount: '₹90 लाखांपर्यंत', summary: 'व्यवसाय सुरळीत चालण्यासाठी तुमच्या मालाच्या साठ्यावर व मालमत्तेवर वित्तपुरवठा.' }, [
  '₹90 लाखांपर्यंत',
  'कृषी मुदत कर्जाप्रमाणेच',
  'किमान 2',
  member,
  'शॉप ॲक्ट परवाना, मालमत्ता, ताळेबंद',
  'फोटो, पत्त्याचा पुरावा, उत्पन्नाचा पुरावा, शोध अहवाल, मूल्यांकन, गहाणखत, शॉप ॲक्ट, ताळेबंद',
]);
loan('land-mortgage-loan', { name: 'जमीन तारण कर्ज', amount: '₹1 कोटी+', summary: 'शेती किंवा बिगरशेती जमिनीच्या तारणावर मोठ्या रकमेचा निधी.' }, [
  '₹1 कोटी व त्यावर',
  '₹90,000 पर्यंत {rate:loan.mortgage.up-to-90000}% · ₹90,000 पेक्षा जास्त {rate:loan.mortgage.above-90000}%',
  null,
  member,
  'जमीन 7/12 गहाण',
  'जमीन हमी, फोटो, रेशन कार्ड, 7/12 गहाणखत',
]);
loan('property-mortgage-loan', { name: 'मालमत्ता तारण कर्ज', amount: '₹1 कोटी+', summary: 'तुमचे घर किंवा व्यावसायिक मालमत्ता तारण ठेवून व्यवसाय किंवा वैयक्तिक गरजेसाठी निधी उभारा.' }, [
  '₹1 कोटी व त्यावर',
  '₹90,000 पर्यंत {rate:loan.mortgage.up-to-90000}% · ₹90,000 पेक्षा जास्त {rate:loan.mortgage.above-90000}%',
  null,
  member,
  'जमीन व इमारत',
  'चालू 7/12, उत्पन्नाचा पुरावा, फोटो, पत्त्याचा पुरावा, खरेदी कागदपत्रे',
]);
loan('microfinance', { name: 'सूक्ष्म वित्त (मायक्रोफायनान्स)', amount: '₹1 लाखापर्यंत', summary: 'लहान उद्योजकांना उपजीविका वाढवण्यासाठी लहान, अल्प मुदतीचे कर्ज.' }, ['₹1 लाखापर्यंत', null, '100 दिवस']);
loan('bachat-gat-loan', { name: 'बचत गट कर्ज', amount: '₹1 लाखापर्यंत', summary: 'महिला बचत गटांना छोटे उद्योग सुरू करण्यासाठी आणि वाढवण्यासाठी गट कर्ज.' }, ['₹1 लाखापर्यंत', null, '100 दिवस']);

set(snap.singletons.loan_page, {
  benefits: [
    { title: 'आकर्षक व्याजदर', text: 'प्रत्येक कर्ज योजनेवर स्पर्धात्मक दर.' },
    { title: 'सोपी कागदपत्रे', text: 'कमी कागदपत्रे आणि प्रत्येक टप्प्यावर मार्गदर्शन.' },
    { title: 'जलद वितरण', text: 'गरजेच्या वेळी पैसे मिळावेत म्हणून जलद प्रक्रिया.' },
    { title: 'तत्पर ग्राहक सेवा', text: 'तुमच्या गरजा समजून घेणारी स्थानिक शाखा टीम.' },
  ],
  // Shown in the Marathi loan form; the form still sends the English name.
  extraFormTypes: ['शैक्षणिक कर्ज', 'सोने तारण कर्ज'],
});
if (snap.singletons.loan_page.benefits.length !== 4 || snap.singletons.loan_page.extraFormTypes.length !== 2) throw new Error('loan page changed; update the Marathi text');

// ---------------------------------------------------------------- services, social responsibility, notices
const services = [
  ['नेट बँकिंग', 'कुठूनही सुरक्षितपणे बँकिंग करा. शाखेत न जाता ऑनलाइन शिल्लक पाहा, स्टेटमेंट पाहा आणि खाती सांभाळा.'],
  ['मोबाइल बँकिंग', 'आमचे मोबाइल ॲप फक्त तुमच्या खात्याशी जोडलेल्या नोंदणीकृत मोबाइल आणि सिमवरच चालते, त्यामुळे प्रवासात बँकिंगसाठी हा अत्यंत सुरक्षित मार्ग आहे.'],
  ['आयएमपीएस आणि यूपीआय', 'ऑनलाइन व प्रत्यक्ष दुकानात पैसे द्या, किंवा कोणत्याही बँक खात्यात लगेच पैसे पाठवा. कार्डचे तपशील किंवा लांब खाते क्रमांक लागत नाहीत.'],
  ['एनईएफटी / आरटीजीएस', 'एनईएफटी, आरटीजीएस किंवा आयएमपीएसद्वारे कोणत्याही लोकमंगल खात्यात किंवा भारतातील इतर कोणत्याही बँकेत पैसे पाठवा. सुरू करण्यासाठी जवळच्या शाखेत जा.'],
  ['एसएमएस बँकिंग', 'इंटरनेट नाही? काळजी नाही. साध्या एसएमएसवर शिल्लक, शेवटचे तीन व्यवहार, डेबिट कार्ड सुरू करणे आणि पिन पुन्हा तयार करणे या सुविधा मिळवा.'],
  ['सुरक्षित तिजोरी (लॉकर)', 'दागिने, कागदपत्रे आणि मौल्यवान वस्तू आमच्या शाखांमधील अत्यंत सुरक्षित लॉकरमध्ये ठेवा. लॉकर उपलब्धतेनुसार दिले जाते.'],
  ['वीज व इतर बिल भरणा', 'वीज, मोबाइल आणि इतर बिले घरबसल्या ऑनलाइन बँकिंगद्वारे किंवा जवळच्या शाखेच्या काउंटरवर भरा.'],
];
if (snap.singletons.services.services.length !== services.length) throw new Error('services changed; update the Marathi list');
set(snap.singletons.services, { services: services.map(([title, text]) => ({ title, text })) });

set(snap.singletons.csr, {
  pillars: [{ title: 'सर्वसमावेशक वाढ आणि विकास' }, { title: 'सामुदायिक सहभाग' }, { title: 'सहकार्याची भागीदारी' }, { title: 'समाजावर सकारात्मक परिणाम' }],
  initiatives: [
    { title: 'लोकमंगल अन्नपूर्णा योजना', stat: '500 वृद्धांना दिवसातून दोनदा जेवण', text: 'बेघर आणि निराधार वृद्धांना रोज दोन वेळा, त्यांच्या दारापर्यंत मोफत आणि पौष्टिक जेवण पोहोचवले जाते, जेणेकरून आपल्या समाजात कोणीही उपाशी राहू नये.' },
    { title: 'लोकमंगल सामुदायिक विवाह', stat: '2,500+ विवाहांना सहाय्य', text: 'शेतकरी आणि कामगारांसाठी विवाह खर्चिक झाले आहेत. सर्वधर्मीय सामुदायिक विवाह सोहळ्याद्वारे आम्ही 2,500 हून अधिक लेकींचे विवाह सन्मानाने पार पाडण्यास मदत केली आहे.' },
    { title: 'जलसंधारण', stat: 'सोलापूर आणि धाराशिव जिल्हे', text: 'पावसाच्या पाण्याची साठवण, पारंपरिक जलस्रोतांचे पुनर्भरण, पाणलोट विकास आणि वनीकरण. शेतकऱ्यांसाठी भूजल पातळी वाढवण्यासाठी अनेक गावांतील ओढे, तळी आणि बंधारे रुंद व खोल करण्यात आले.' },
    { title: 'आरोग्य शिबिरे', stat: 'लोकमंगल जीवक हॉस्पिटलसोबत', text: 'लोकमंगल जीवक हॉस्पिटल अँड रिसर्च सेंटरच्या सहकार्याने गावोगावी नियमित आरोग्य शिबिरे घेतली जातात; ज्यांना सर्वाधिक गरज आहे अशा कुटुंबांपर्यंत उपचार आणि आरोग्य जागृती पोहोचते.' },
    { title: 'वृक्षारोपण', stat: 'दरवर्षी', text: 'दरवर्षी आमचे कर्मचारी आणि त्यांचे कुटुंबीय शाखांजवळ, रस्त्यांलगत आणि शाळांमध्ये रोपे लावतात आणि शेजाऱ्यांनाही ती जगवण्यासाठी प्रोत्साहित करतात.' },
    { title: 'स्वच्छता मोहीम', stat: 'स्वच्छ भारत अभियान', text: 'स्वच्छ भारताच्या भावनेतून आमची पथके शाखांच्या आसपासचा परिसर स्वच्छ करतात आणि रोजच्या स्वच्छतेबद्दल जागृती करतात.' },
    { title: 'जिल्हास्तरीय युवा महोत्सव', stat: 'लोकमंगल फाउंडेशनतर्फे आयोजित', text: 'नामवंत वक्ते आणि युवा आदर्श ग्रामीण व शहरी तरुणांना आपला प्रवास सांगतात आणि पुढच्या पिढीला मोठी स्वप्ने पाहण्याची प्रेरणा देतात.' },
  ],
});

const galleryCaptions = {
  'Lokmangal moments, 2017–18': 'लोकमंगल क्षणचित्रे, 2017–18',
  'Lokmangal moments, 2016–17': 'लोकमंगल क्षणचित्रे, 2016–17',
  'Independence Day, 15 August 2016': 'स्वातंत्र्य दिन, 15 ऑगस्ट 2016',
  'Yashwant Raut felicitation': 'यशवंत राऊत यांचा सत्कार',
  'Swachhata Abhiyan': 'स्वच्छता अभियान',
  'SUS function, 2013': 'SUS कार्यक्रम, 2013',
  'Chhatrapati Shivaji Maharaj statue': 'छत्रपती शिवाजी महाराज पुतळा',
  'Lokmangal moments': 'लोकमंगल क्षणचित्रे',
};
for (const album of snap.collections.gallery_album) {
  const images = album.data.images.map((img) => {
    const caption = galleryCaptions[img.caption];
    if (!caption) throw new Error(`gallery: no Marathi caption for "${img.caption}"`);
    return { caption };
  });
  set(album.data, { title: album.data.title === 'Lokmangal moments' ? 'लोकमंगल क्षणचित्रे' : album.data.title, images });
}

const notice = snap.collections.notice[0].data;
const noticeItems = [
  'संचालक मंडळ व पदाधिकारी निवडणूक 2025: कार्यक्रम',
  'मतदानास पात्र सभासदांची / प्रतिनिधींची तात्पुरती यादी',
  'मतदानास पात्र सभासदांची / प्रतिनिधींची अंतिम यादी',
  'सभासदांची अंतिम यादी, धाराशिव जिल्हा',
  'निवडणूक निर्णय अधिकाऱ्यांकडे प्राप्त एकूण नामनिर्देशनांची यादी',
  'वैध नामनिर्देशनांची यादी, संचालक मंडळ',
  'निवडणूक लढवणाऱ्या उमेदवारांची अंतिम यादी',
  'निवडणूक निकालास मान्यता, संचालक मंडळ (29.05.2025)',
  'आरआर-17 सभेची कार्यसूची (30.05.2025)',
  'पदाधिकाऱ्यांच्या निवडणुकीचा कार्यक्रम',
];
if (notice.items.length !== noticeItems.length) throw new Error('notice items changed; update the Marathi list');
set(notice, { title: 'संचालक मंडळ व पदाधिकारी निवडणूक 2025', items: noticeItems.map((label) => ({ label })) });

writeFileSync(path, JSON.stringify(snap, null, 2) + '\n');
console.log('Marathi text written to seed/snapshot.json');
