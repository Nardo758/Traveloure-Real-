/**
 * ProviderPublishService
 * Owns the business rule: can a provider set a service to "active"?
 * Previously this lived inline inside route handlers — it now lives here.
 */
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { serviceCategories, users } from '../../shared/schema';

export interface PublishGateResult {
  allowed: boolean;
  code?: 'VERIFICATION_REQUIRED';
  message?: string;
}

/**
 * Check whether a provider is allowed to publish (status:"active") a service
 * in the given category.  Call this before any create/update that sets status active.
 */
export async function checkProviderPublishGate(
  userId: string,
  categoryId: string | undefined,
): Promise<PublishGateResult> {
  if (!categoryId) return { allowed: true };

  const [cat] = await db
    .select({
      requiresBackgroundCheck: serviceCategories.requiresBackgroundCheck,
      insuranceBand: serviceCategories.insuranceBand,
    })
    .from(serviceCategories)
    .where(eq(serviceCategories.id, categoryId));

  const needsGate = cat?.requiresBackgroundCheck || ((cat?.insuranceBand ?? 0) >= 2);
  if (!needsGate) return { allowed: true };

  const [userRow] = await db
    .select({
      providerVerificationStatus: users.providerVerificationStatus,
      backgroundCheckConfirmed: users.backgroundCheckConfirmed,
    })
    .from(users)
    .where(eq(users.id, userId));

  const verified = userRow?.providerVerificationStatus === 'verified';
  const bgOk = !cat?.requiresBackgroundCheck || userRow?.backgroundCheckConfirmed;

  if (!verified || !bgOk) {
    return {
      allowed: false,
      code: 'VERIFICATION_REQUIRED',
      message:
        'This category requires background verification before publishing. Save as draft and complete your provider verification first.',
    };
  }

  return { allowed: true };
}
