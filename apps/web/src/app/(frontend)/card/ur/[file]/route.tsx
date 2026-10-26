import { shareCardResponse } from '@/lib/share-card'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  return shareCardResponse('ur', (await params).file)
}
