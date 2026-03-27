import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
});

class StripeConnectService {
  async createConnectedAccount(
    userId: string,
    email: string,
    type: 'expert' | 'provider',
    businessName?: string
  ): Promise<{ accountId: string }> {
    const account = await stripe.accounts.create({
      type: 'express',
      email,
      metadata: {
        userId,
        userType: type,
        platform: 'traveloure',
      },
      business_profile: {
        name: businessName || undefined,
        product_description: type === 'expert'
          ? 'Travel expert services on Traveloure'
          : 'Service provider on Traveloure',
      },
      capabilities: {
        transfers: { requested: true },
      },
    });

    return { accountId: account.id };
  }

  async createOnboardingLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<{ url: string }> {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    return { url: link.url };
  }

  async createLoginLink(accountId: string): Promise<{ url: string }> {
    const link = await stripe.accounts.createLoginLink(accountId);
    return { url: link.url };
  }

  async getAccountStatus(accountId: string): Promise<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    status: string;
  }> {
    const account = await stripe.accounts.retrieve(accountId);

    let status = 'pending';
    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      status = 'active';
    } else if (account.details_submitted) {
      status = 'under_review';
    } else {
      status = 'onboarding_incomplete';
    }

    return {
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      detailsSubmitted: account.details_submitted || false,
      status,
    };
  }

  async createTransfer(
    amount: number,
    currency: string,
    connectedAccountId: string,
    description: string,
    metadata: Record<string, string>
  ): Promise<{ transferId: string; amount: number }> {
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      destination: connectedAccountId,
      description,
      metadata,
    });

    return {
      transferId: transfer.id,
      amount: transfer.amount / 100,
    };
  }

  async getTransfer(transferId: string): Promise<Stripe.Transfer> {
    return await stripe.transfers.retrieve(transferId);
  }

  async getAccountBalance(): Promise<{
    available: number;
    pending: number;
    currency: string;
  }> {
    const balance = await stripe.balance.retrieve();
    const usdAvailable = balance.available.find(b => b.currency === 'usd');
    const usdPending = balance.pending.find(b => b.currency === 'usd');

    return {
      available: (usdAvailable?.amount || 0) / 100,
      pending: (usdPending?.amount || 0) / 100,
      currency: 'usd',
    };
  }
}

export const stripeConnectService = new StripeConnectService();
