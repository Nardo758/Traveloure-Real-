import { verifyEmailMessage } from "./auth-verification-email";
import { welcomeMessage } from "./auth-welcome-email";
import { resetRequestMessage } from "./auth-password-reset-email";
import { verifyReminder1h } from "./verify_reminder_1h";
import { verifyReminder1d } from "./verify_reminder_1d";
import { verifyReminder3d } from "./verify_reminder_3d";
import { alreadyHaveAccount } from "./already_have_account";
import { googleLoginAdded } from "./google_login_added";
import { passwordChanged } from "./password_changed";
import { newDeviceLogin } from "./new_device_login";
import { accountLocked } from "./account_locked";
import { deletionConfirm } from "./deletion_confirm";
import { deletionComplete } from "./deletion_complete";
import { profileNudge } from "./profile_nudge";
import { plannerNudge } from "./planner_nudge";
import type { CoreKind } from "./_core-definition";
export const coreMessages = [verifyEmailMessage, welcomeMessage, verifyReminder1h, verifyReminder1d,
  verifyReminder3d, alreadyHaveAccount, googleLoginAdded, resetRequestMessage, passwordChanged,
  newDeviceLogin, accountLocked, deletionConfirm, deletionComplete, profileNudge, plannerNudge] as const;
export const coreByKind = new Map(coreMessages.map((message) => [message.kind as CoreKind, message]));