// Connections now require browser-bound state through the hosted callback.
export async function POST() {
  return new Response("Start Checkr connection from your employer workspace.", {
    status: 410, headers: { "Cache-Control": "private, no-store" },
  });
}
