// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Old WordPress URLs → new clean URLs, so existing Google results and shared links keep working.
const legacyRedirects = {
  '/top-banks-in-pune': '/about-us/',
  '/home-loan-in-solapur': '/social-responsibility/',
  '/investment-schemes-in-osmanabad': '/deposits/',
  '/deposit': '/deposits/',
  '/landing': '/deposits/',
  '/interest-rates-on-fixed-deposits': '/interest-rates/',
  '/agriculture-loan-in-solapur': '/loans/',
  '/salary-account-in-pune': '/other-services/',
  '/bank-in-solapur': '/faq/',
  '/bank-in-belgaon': '/branches/',
  '/top-banks-in-pimpri-chinchwad': '/branches/',
  '/marathi': '/branches/',
  '/cooperative-banks-in-osmanabad': '/contact-us/',
  '/fd-plans-in-pune': '/blog/',
  '/category/blog': '/blog/',
  '/fixed-deposit-interest-rates-in-solapur': '/careers/',
  '/housing-loan': '/terms-of-use/',
  '/savings-account-in-hingoli': '/privacy-policy/',
  '/top-banks-in-tuljapur': '/open-an-account/',
  '/fd-plans-in-osmanabad': '/apply-for-deposits/',
  '/personal-loan-in-solapur': '/apply-loan/',
  '/photo-gallery': '/gallery/',
  '/deposits/millionaire-fixed-deposit': '/deposits/lakshadish-deposit-scheme-1/',
};

export default defineConfig({
  site: 'https://lokmangalmultistate.com',
  trailingSlash: 'always',
  redirects: legacyRedirects,
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [sitemap()],
});
