# 0002: Calculation policy `lmcs-fin-2026.1`

**Status: proposed, needs the society's sign-off.** The rules below reproduce the figures printed in the 2026–27 leaflets, which is good evidence but not approval. A responsible officer should confirm the method for each product and the rounding, then this record should say who approved it and when.

**Where it lives.** One TypeScript package, `packages/finance`, used by the public calculators, the maturity examples on scheme pages (through `{calc}` placeholders) and the admin's preview. The policy version is recorded in every release. The backend does not compute interest; it only checks that placeholders resolve. If it ever must, it has to pass the same fixtures (`packages/finance/test/fixtures.json`).

| Product | Rule |
| --- | --- |
| Fixed deposit | Up to 12 months: simple interest, `P × (1 + r × months / 1200)`. Beyond 12 months: compounded half-yearly with part periods compounded fractionally, `P × (1 + r/200)^(months/6)`. |
| Recurring deposit | Equal instalments at the start of each month, each compounded half-yearly for the months it stays invested: `Σ R × (1 + r/200)^(k/6)` for `k = 1 … n`. |
| Monthly income | `P × r / 1200` each month; principal returned at maturity. |
| Loan EMI | Reducing balance: `P × i × (1+i)^n / ((1+i)^n − 1)`, `i = r/1200`; a 0 % rate divides the principal evenly. |
| Doubling plan | **Not calculated.** 88 months (86 for special categories) are approved *terms* stored in the rate set; the calculator uses an illustrative annual rate (9.67 %) that is also a rate-set entry. |

**Conventions.** Tenure in calculators is in whole months (a month is not converted to 30 days). Days are used only to pick an FD rate slab. Published figures are rounded to whole rupees, half up; calculation itself is in floating point and is rounded once, at display. Rates are stored as decimals with up to three places and travel as strings.

**Evidence.** The four Lakshadish variants (₹3,800×24, ₹2,450×36, ₹1,750×48, ₹1,350×60 at 9.25 %) reproduce the printed maturities ₹1,00,344, ₹1,01,705, ₹1,01,583 and ₹1,02,799 exactly; the 12-month FD (₹1,00,000 at 10 %) gives ₹1,10,000; the monthly-income example (9.75 %) gives ₹813; a ₹5 lakh, 12 %, 60-month loan gives an EMI of ₹11,122. These are fixtures in the test suite. The formula was inferred from the leaflet figures, so please check it against the original leaflet working.

**Open questions for the society.** Does TDS change any published example? Is part-period compounding (months/6) the intended method? What happens to an RD instalment paid late? Which rounding applies to payouts (the leaflets show whole rupees)?

**Public wording.** Calculators show their assumptions and say the figures are indicative. They must not be presented as guaranteed returns.
