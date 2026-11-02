import { describe, expect, it } from 'vitest';
import catalog from '../generated/page-text.json';
import { groupOf, missingPlaceholders, pruneTexts } from '../features/website-text';

describe('website text', () => {
  it('keeps only texts that differ from the original', () => {
    const c = { faq: { a: { en: 'Hello', mr: 'नमस्कार' }, b: { en: 'Bye', mr: 'बाय' } } };
    expect(pruneTexts({ faq: { a: { en: 'Hello', mr: 'नवीन' }, b: { en: '  ' } } }, c)).toEqual({ faq: { a: { mr: 'नवीन' } } });
  });

  it('notices a lost placeholder, but not an emptied text, which goes back to the original', () => {
    expect(missingPlaceholders('Call {phone}', 'Call us')).toEqual(['{phone}']);
    expect(missingPlaceholders('Call {phone}', 'Ring {phone} now')).toEqual([]);
    expect(missingPlaceholders('Call {phone}', '')).toEqual([]);
  });

  it('puts the shared wording into sections', () => {
    expect(groupOf('site', 'home.slide1.title')).toBe('site:home');
    expect(groupOf('site', 'footer.about')).toBe('site:footer');
    expect(groupOf('about-us', 'title')).toBe('about-us');
  });

  it('has the build-generated list, with both languages for every text', () => {
    const pages = Object.values(catalog as Record<string, Record<string, { en: string; mr: string }>>);
    expect(pages.flatMap((p) => Object.keys(p)).length).toBeGreaterThan(1000);
    for (const page of pages) for (const t of Object.values(page)) expect(typeof t.en === 'string' && typeof t.mr === 'string').toBe(true);
  });
});
