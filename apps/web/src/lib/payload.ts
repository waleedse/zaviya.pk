import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

let client: Payload | null = null

export async function getPayloadClient(): Promise<Payload> {
  if (!client) {
    client = await getPayload({ config })
  }
  return client
}
