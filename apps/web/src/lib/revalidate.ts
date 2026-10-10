import { revalidatePath, revalidateTag } from 'next/cache'

function safeRevalidate(fn: () => void) {
  try {
    fn()
  } catch {
    // Outside Next.js request context (e.g. payload run)
  }
}

export async function revalidateHome() {
  safeRevalidate(() => revalidateTag('home', 'max'))
}

export async function revalidateCategory(slug: string) {
  safeRevalidate(() => revalidateTag(`category:${slug}`, 'max'))
}

export async function revalidateArticle(id: string) {
  safeRevalidate(() => revalidateTag(`article:${id}`, 'max'))
}

export async function revalidateDataTag(key: string) {
  safeRevalidate(() => revalidateTag(`data:${key}`, 'max'))
}

export async function revalidatePathSafe(path: string) {
  safeRevalidate(() => revalidatePath(path))
}
