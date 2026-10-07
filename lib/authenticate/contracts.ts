export const ORIGIN = "https://api-v3.authenticating.com";
export const FIXTURE_CODE = "100385a1-4308-49db-889f-9a898fa88c21";
export const PRICE_VERSION = "authenticate-public-usd-mock-2026-10-06-v1";
export const PRODUCTS = [
    { id: "criminal-seven", name: "7-year criminal history", description: "Synthetic criminal history report", cents: 500 },
    { id: "employment", name: "Employment verification", description: "Synthetic employer and work history", cents: 500 },
    { id: "education", name: "Education verification", description: "Synthetic degree and institution history", cents: 500 },
    { id: "license", name: "Professional license", description: "Synthetic professional license record", cents: 500 },
    { id: "mvr", name: "Motor vehicle record", description: "Synthetic driver record; additional DMV fees simulated at $0", cents: 500 },
] as const;
export type ProductId = typeof PRODUCTS[number]["id"];
// TXKPRO presets use supported Authenticate products; these are not Checkr packages.
export const PACKAGES = [
    { id: "basic", name: "Basic", description: "Criminal history", products: ["criminal-seven"] },
    { id: "standard", name: "Standard", description: "History, employment and education", products: ["criminal-seven", "employment", "education"] },
    { id: "complete", name: "Complete", description: "All five available checks", products: ["criminal-seven", "employment", "education", "license", "mvr"] },
] as const satisfies readonly { id: string; name: string; description: string; products: readonly ProductId[] }[];
export function matchingPackage(products: readonly ProductId[]) {
    return PACKAGES.find(p => p.products.length === products.length && p.products.every(id => products.includes(id)));
}
export function selectedProducts(input: unknown): ProductId[] {
    if (!Array.isArray(input) || !input.length || input.length > PRODUCTS.length || new Set(input).size !== input.length || input.some(id => !PRODUCTS.some(p => p.id === id)))
        throw new Error("Select available checks");
    return [...input].sort() as ProductId[];
}
export function quoteProducts(input: unknown, bps: number, fixed: number) {
    const products = selectedProducts(input);
    if (!Number.isSafeInteger(bps) || bps < 0 || bps > 1000 || !Number.isSafeInteger(fixed) || fixed < 0 || fixed > 1000)
        throw new Error("Payment fees unavailable");
    const providerCents = products.reduce((n, id) => n + PRODUCTS.find(p => p.id === id)!.cents, 0);
    const platformCents = Math.max(500, Math.ceil(providerCents / 10));
    const thirdPartyCents = Math.ceil((providerCents + platformCents) * bps / 10000) + fixed;
    return { products, providerCents, platformCents, thirdPartyCents, totalCents: providerCents + platformCents + thirdPartyCents, pricingVersion: PRICE_VERSION };
}
export function mockRequest(id: ProductId) {
    const userAccessCode = FIXTURE_CODE;
    switch (id) {
        case "criminal-seven": return { path: "/mock/identity/request/criminal/report/seven", body: { userAccessCode } };
        case "mvr": return { path: "/mock/identity/mvr", body: { userAccessCode, license_number: "MOCK123456", state_abbr: "CA" } };
        case "employment": return { path: "/mock/employment/v2/verify", body: { userAccessCode, employmentList: [{ clientUUID: "7a2effe3-ebfc-484b-b15c-8c36e0b612e1", employerName: "Enterprise Two", jobTitle: "Temp-2", startDate: "27-06-2012", endDate: "27-06-2014", currentlyEmployed: false, manualVerification: false }] } };
        case "education": return { path: "/mock/education/v2/verify", body: { userAccessCode, educationList: [{ clientUUID: "5a2effe2-ebfc-484b-b15c-8c36e0b66233", institutionName: "VS-HOMETOWN UNIVERSITY", degreeTitle: "Bachelors in Engineering", startDate: "31-07-2011", endDate: "31-07-2014", majors: ["Software Engineering"], manualVerification: false }] } };
        case "license": return { path: "/mock/identity/professional/license", body: { userAccessCode, licenseList: [{ license_title: "MECHANIC", license_organization: "Stark Industries", license_number: "ILY3000", startDate: "24-03-1992", endDate: "31-12-2019", state: "PA", country: "USA", manualVerification: 0, uniqueIdentifier: "8eb19799-016e-42e3-a5cf-f559e7cf8139" }] } };
    }
}
export function mockComplete(id: ProductId, r: Record<string, unknown>) {
    if (r.errorCode || r.errorMessage || r.success === false || r.status === false)
        return false;
    if (id === "criminal-seven")
        return r.status === "COMPLETE";
    if (id === "mvr")
        return typeof r.returned_date === "string" && typeof r.current_license === "object" && r.current_license !== null;
    const rows = id === "employment" ? r.employment : id === "education" ? r.education : r.professionalLicense;
    return Array.isArray(rows) && rows.length > 0 && rows.every(x => x && String(x.status).toLowerCase() === "complete" || x && String(x.status).toLowerCase() === "completed");
}
export function sessionMatches(s: {
    id: string;
    livemode: boolean;
    currency: string | null;
    amount_total: number | null;
    metadata: Record<string, string> | null;
}, o: {
    id: string;
    owner_type: string;
    owner_id: string;
    total_cents: number;
    stripe_session: string | null;
}) {
    return s.id === o.stripe_session && !s.livemode && s.currency === "usd" && s.amount_total === o.total_cents && s.metadata?.screening_order_id === o.id && s.metadata.owner_type === o.owner_type && s.metadata.owner_id === o.owner_id && s.metadata.integration_identifier === "txkauths";
}
