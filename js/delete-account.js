/**
 * Delete account — calls Supabase edge function (Part 8).
 */
import { getStudioClient, invokeFunction, signOut } from './studio-api.js';

export async function deleteAccount() {
  await invokeFunction('delete-account', { confirm: true });
  try {
    await signOut();
  } catch (_) {
    const client = await getStudioClient();
    await client.auth.signOut();
  }
}
