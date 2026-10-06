import { classError } from "@/lib/classes/request";
import { authenticatedRpc, rewardApi } from "@/lib/rewards/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await authenticatedRpc("reward_workspace");
    const catalog = await rewardApi(
      "/api/v2/products?id=ALL_FEE_FREE&country=US&currency=USD",
    );
    return Response.json(
      {
        products: (catalog.products || [])
          .filter(
            (p: {
              category: string;
              currency_codes: string[];
              countries: { abbr: string }[];
            }) =>
              p.category === "merchant_card" &&
              p.currency_codes?.includes("USD") &&
              p.countries?.some((c) => c.abbr === "US"),
          )
          .map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          }))
          .slice(0, 500),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return classError(
      e instanceof Response
        ? e
        : new Response("Gift-card catalog unavailable.", { status: 503 }),
    );
  }
}
