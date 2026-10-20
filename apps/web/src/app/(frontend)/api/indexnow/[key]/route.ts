// IndexNow ownership file: /<INDEXNOW_KEY>.txt (rewritten here by next.config) must return the key as plain text.
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const expected = process.env.INDEXNOW_KEY
  if (!expected || key !== expected) return new Response('Not found', { status: 404 })
  return new Response(expected, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
