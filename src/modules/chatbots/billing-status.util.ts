import { ChatbotDocument } from './schemas/chatbot.schema';

// Single source of truth for "can this chatbot answer right now, billing-wise".
// Used by both the live chat engine (real-time gate) and ChatbotBillingCron
// (which flips billing.status once a day) — the real-time check is the safety
// net for the window between a trial's actual expiry and the next cron run,
// so a lapsed trial can never answer for free just because the cron hasn't
// run yet.
export function isChatbotBillingActive(chatbot: ChatbotDocument): boolean {
  const billing = chatbot.billing;
  if (!billing) return true; // legacy bots created before billing existed

  if (billing.status === 'active') return true;

  if (billing.status === 'trial') {
    // No trialEndsAt set (legacy bots created before auto-trial) — don't
    // retroactively lock out existing customers.
    if (!billing.trialEndsAt) return true;
    return new Date(billing.trialEndsAt).getTime() > Date.now();
  }

  // awaiting_setup_payment | past_due | suspended
  return false;
}
