export async function GET() {
  return new Response(
    "Customer OAuth is retired. Return to your TXKPRO workspace.",
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
