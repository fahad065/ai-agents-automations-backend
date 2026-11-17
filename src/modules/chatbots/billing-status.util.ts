import { UserServiceStatus } from '../userservices/schemas/userservice.schema';

// Single source of truth for "can this chatbot answer right now, billing-wise".
// Takes the userservices row (status / trialEndDate / isFreeForever). Used by
// the live chat engine (real-time gate) and ChatbotBillingCron (which moves
// status forward once a day) — the real-time check covers the window between
// a trial's actual end and the next cron run, so a lapsed trial can never
// answer for free.
export function isChatbotBillingActive(row: {
  status?: string; trialEndDate?: Date | string | null; isFreeForever?: boolean;
}): boolean {
  if (row.isFreeForever) return true;
  if (row.status === UserServiceStatus.ACTIVE) return true;
  if (row.status === UserServiceStatus.TRIAL) {
    if (!row.trialEndDate) return true;
    return new Date(row.trialEndDate).getTime() > Date.now();
  }
  // past_due | suspended | cancelled
  return false;
}
