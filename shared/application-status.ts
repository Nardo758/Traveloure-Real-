/**
 * One application timeline, and the sentences a denied supply page is allowed to say.
 *
 * Pending expert and provider accounts stay `users.role = user` until an admin approves
 * the application. The status pages used to mark every unfinished column `in_progress`
 * (including provider columns that do not exist) and badge a missing form as "Under Review".
 * This walker is the only place those steps are decided. At most one step is current.
 *
 * No database. Safe for the client.
 */
import { isEarnerRole, isExpertRole, isProviderRole } from "./roles";

export type StepStatus = "completed" | "in_progress" | "pending" | "failed";
export type ApplicationPhase = "not_started" | "action_needed" | "under_review" | "approved" | "rejected";

export interface TimelineStep {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  completedAt?: string;
  note?: string;
}

export interface ApplicationTimeline {
  steps: TimelineStep[];
  phase: ApplicationPhase;
  phaseTitle: string;
  phaseDetail: string;
  currentStepId: number | null;
}

export interface ExpertApplicationFacts {
  hasForm: boolean;
  formStatus: string | null;
  destinationsCount: number;
  specialtiesCount: number;
  hasBio: boolean;
  hasPortfolio: boolean;
  /** pending | processing | verified | failed */
  identityStatus: string;
  basicCompletedAt?: string | null;
}

export interface ProviderApplicationFacts {
  hasForm: boolean;
  formStatus: string | null;
  hasServiceOffers: boolean;
  hasOfferingTypeKey: boolean;
  hasDescription: boolean;
  hasLocation: boolean;
  identityStatus: string;
  /** pending | submitted | processing | verified | failed */
  businessStatus: string;
  basicCompletedAt?: string | null;
}

interface GateSpec {
  id: number;
  title: string;
  description: string;
  gate: "done" | "open" | "waiting" | "failed" | "not_yet";
  note?: string;
}

const PHASE_TITLE: Record<ApplicationPhase, string> = {
  not_started: "Not started",
  action_needed: "Action needed",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Not Approved",
};

const NOT_STARTED_DETAIL = "Submit an application to open this page. Nothing is in review yet.";
const APPROVED_DETAIL = "Your application is approved. Listings you saved as drafts can be submitted for review.";
const REJECTED_DETAIL = "Your application was not approved. Update it and resubmit. Draft listings stay private.";
const ADMIN_REVIEW_DETAIL =
  "Your application is under review. You can save a draft listing from your dashboard. It stays private and cannot be published until your application is approved.";
const IDENTITY_PROCESSING_DETAIL =
  "Your identity check is being processed. This usually takes a few minutes. Your application is not with the review team yet.";
const BUSINESS_PROCESSING_DETAIL =
  "Your business check is being processed. This usually takes a few minutes. Your application is not with the review team yet.";
const IDENTITY_ACTION_DETAIL = "Your application is saved. Verify your identity next. Review starts after that check is done.";
const IDENTITY_FAILED_DETAIL = "Your identity check needs another try. Review starts after that check is done.";
const BUSINESS_ACTION_DETAIL = "Your identity check is done. Verify your business next. Review starts after that check is done.";
const BUSINESS_FAILED_DETAIL = "Your business check needs another try. Review starts after that check is done.";
const PROFILE_ACTION_DETAIL = "Finish the open step below. Review starts once the earlier steps are done.";

function terminal(status: string | null): "approved" | "rejected" | "closed" | "open" {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "deleted" || status === "deactivated") return "closed";
  return "open";
}

function identityGate(status: string, hasForm: boolean): GateSpec["gate"] {
  if (status === "verified") return "done";
  if (!hasForm) return "not_yet";
  if (status === "processing") return "waiting";
  if (status === "failed") return "failed";
  return "open";
}

function businessGate(status: string, identityDone: boolean): GateSpec["gate"] {
  if (!identityDone) return "not_yet";
  if (status === "verified") return "done";
  if (status === "submitted" || status === "processing") return "waiting";
  if (status === "failed") return "failed";
  return "open";
}

function detailFor(phase: ApplicationPhase, current: GateSpec | null): string {
  if (phase === "not_started") return NOT_STARTED_DETAIL;
  if (phase === "approved") return APPROVED_DETAIL;
  if (phase === "rejected") return REJECTED_DETAIL;
  if (!current) return PROFILE_ACTION_DETAIL;
  const title = current.title;
  if (current.gate === "waiting" && (title === "Identity Verification" || title === "Owner Identity Verification")) {
    return IDENTITY_PROCESSING_DETAIL;
  }
  if (current.gate === "waiting" && title === "Business Verification") return BUSINESS_PROCESSING_DETAIL;
  if (current.gate === "waiting") return ADMIN_REVIEW_DETAIL;
  if (current.gate === "failed" && (title === "Identity Verification" || title === "Owner Identity Verification")) {
    return IDENTITY_FAILED_DETAIL;
  }
  if (current.gate === "failed" && title === "Business Verification") return BUSINESS_FAILED_DETAIL;
  if (title === "Identity Verification" || title === "Owner Identity Verification") return IDENTITY_ACTION_DETAIL;
  if (title === "Business Verification") return BUSINESS_ACTION_DETAIL;
  return PROFILE_ACTION_DETAIL;
}

function assemble(specs: GateSpec[], outcome: "none" | "approved" | "rejected" | "open", basicCompletedAt: string | null): ApplicationTimeline {
  if (outcome === "none") {
    return {
      steps: specs.map((s) => ({ id: s.id, title: s.title, description: s.description, status: "pending" as const })),
      phase: "not_started",
      phaseTitle: PHASE_TITLE.not_started,
      phaseDetail: NOT_STARTED_DETAIL,
      currentStepId: null,
    };
  }
  if (outcome === "approved") {
    return {
      steps: specs.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        status: "completed" as const,
        ...(s.id === 1 && basicCompletedAt ? { completedAt: basicCompletedAt } : {}),
      })),
      phase: "approved",
      phaseTitle: PHASE_TITLE.approved,
      phaseDetail: APPROVED_DETAIL,
      currentStepId: null,
    };
  }

  const steps: TimelineStep[] = [];
  let current: GateSpec | null = null;
  let phase: ApplicationPhase = outcome === "rejected" ? "rejected" : "action_needed";

  if (outcome === "rejected") {
    for (const spec of specs) {
      const isReview = spec.title === "Admin Review";
      const isActivation = spec.title === "Account Activation";
      const status: StepStatus = isReview ? "failed" : !isActivation && spec.gate === "done" ? "completed" : "pending";
      if (isReview) current = spec;
      steps.push({
        id: spec.id,
        title: spec.title,
        description: spec.description,
        status,
        ...(spec.id === 1 && status === "completed" && basicCompletedAt ? { completedAt: basicCompletedAt } : {}),
      });
    }
  } else {
    let assigned = false;
    for (const spec of specs) {
      let status: StepStatus;
      if (spec.gate === "done") status = "completed";
      else if (!assigned) {
        assigned = true;
        current = spec;
        status = spec.gate === "failed" ? "failed" : "in_progress";
        phase = spec.gate === "waiting" ? "under_review" : "action_needed";
      } else status = "pending";
      const showNote = status === "in_progress" && spec.gate === "open" && spec.note;
      steps.push({
        id: spec.id,
        title: spec.title,
        description: spec.description,
        status,
        ...(spec.id === 1 && status === "completed" && basicCompletedAt ? { completedAt: basicCompletedAt } : {}),
        ...(showNote ? { note: spec.note } : {}),
      });
    }
  }

  return {
    steps,
    phase,
    phaseTitle: PHASE_TITLE[phase],
    phaseDetail: detailFor(phase, current),
    currentStepId: current?.id ?? null,
  };
}

export function buildExpertApplicationTimeline(facts: ExpertApplicationFacts): ApplicationTimeline {
  const end = terminal(facts.hasForm ? facts.formStatus : "closed");
  const expertiseDone = facts.destinationsCount > 0 || facts.specialtiesCount > 0;
  const portfolioDone = facts.hasBio || facts.hasPortfolio;
  const identity = identityGate(facts.identityStatus, facts.hasForm);
  const profileDone = facts.hasForm && expertiseDone && portfolioDone && identity === "done";
  const specs: GateSpec[] = [
    {
      id: 1,
      title: "Basic Information",
      description: "Personal details and contact information",
      gate: facts.hasForm ? "done" : "not_yet",
    },
    {
      id: 2,
      title: "Expertise & Destinations",
      description: "Your specialties and destination knowledge",
      gate: expertiseDone ? "done" : facts.hasForm ? "open" : "not_yet",
    },
    {
      id: 3,
      title: "Experience & Portfolio",
      description: "Professional background and work samples",
      gate: portfolioDone ? "done" : facts.hasForm ? "open" : "not_yet",
    },
    {
      id: 4,
      title: "Identity Verification",
      description: "Government ID and liveness check via Stripe Identity",
      gate: identity,
      note: "Click 'Verify My Identity' above to begin",
    },
    {
      id: 5,
      title: "Admin Review",
      description: "Our team reviews your application — typically 2-3 business days",
      gate: profileDone ? "waiting" : "not_yet",
    },
    {
      id: 6,
      title: "Account Activation",
      description: "Your expert account is activated and ready",
      gate: "not_yet",
    },
  ];
  const outcome = !facts.hasForm || end === "closed" ? "none" : end === "approved" ? "approved" : end === "rejected" ? "rejected" : "open";
  return assemble(specs, outcome, facts.basicCompletedAt ?? null);
}

export function buildProviderApplicationTimeline(facts: ProviderApplicationFacts): ApplicationTimeline {
  const end = terminal(facts.hasForm ? facts.formStatus : "closed");
  const categoriesDone = facts.hasServiceOffers || facts.hasOfferingTypeKey || facts.hasDescription;
  const identity = identityGate(facts.identityStatus, facts.hasForm);
  const business = businessGate(facts.businessStatus, identity === "done");
  const profileDone =
    facts.hasForm && categoriesDone && facts.hasLocation && identity === "done" && business === "done";
  const specs: GateSpec[] = [
    {
      id: 1,
      title: "Business Information",
      description: "Business name, type, and contact details",
      gate: facts.hasForm ? "done" : "not_yet",
    },
    {
      id: 2,
      title: "Service Categories",
      description: "Types of services you offer",
      gate: categoriesDone ? "done" : facts.hasForm ? "open" : "not_yet",
    },
    {
      id: 3,
      title: "Location & Documentation",
      description: "Location, compliance, and supporting documents",
      gate: facts.hasLocation ? "done" : facts.hasForm ? "open" : "not_yet",
    },
    {
      id: 4,
      title: "Owner Identity Verification",
      description: "Government ID verification for the business owner",
      gate: identity,
      note: "Click 'Verify Owner ID' above to begin",
    },
    {
      id: 5,
      title: "Business Verification",
      description: "Registry check against national business databases",
      gate: business,
      note: "Enter your business details above to begin",
    },
    {
      id: 6,
      title: "Admin Review",
      description: "Our team reviews your application — typically 3-5 business days",
      gate: profileDone ? "waiting" : "not_yet",
    },
    {
      id: 7,
      title: "Account Activation",
      description: "Your provider account is activated and ready",
      gate: "not_yet",
    },
  ];
  const outcome = !facts.hasForm || end === "closed" ? "none" : end === "approved" ? "approved" : end === "rejected" ? "rejected" : "open";
  return assemble(specs, outcome, facts.basicCompletedAt ?? null);
}

/** How many steps are current. The walker promises this is never more than one. */
export function currentStepCount(steps: TimelineStep[]): number {
  return steps.filter((s) => s.status === "in_progress" || s.status === "failed").length;
}

export interface SupplyWriteAccount {
  publishesFreely: boolean;
  canSaveDraftListing: boolean;
  phase: ApplicationPhase;
  /** Null when this user has no application row. */
  applicationStatus: string | null;
}

export interface ListingWriteIntent {
  draft: boolean;
  /** Submit, born-submitted create, or approvalStatus submitted. */
  enteringReview: boolean;
  statusActive: boolean;
}

const DRAFT_OK_UNDER_REVIEW =
  "Your application is under review. You can save this as a draft. It stays private and cannot be published until your application is approved.";
const DRAFT_OK_NOT_YET =
  "Your application is not approved yet. You can save this as a draft. It stays private and cannot be published until your application is approved.";
const DRAFT_OK_APPROVED_INACTIVE =
  "Your application is approved. Publishing stays closed until your account is activated. You can still save a draft.";
const CLOSED_REJECTED =
  "Your application was not approved, so new listings stay closed. Update and resubmit your application first.";
const CLOSED_NONE = "Submit an expert or provider application before creating a listing.";

/** Null when the write may proceed. Otherwise the 403 body, with no partial save. */
export function listingWriteRefusal(
  account: SupplyWriteAccount,
  write: ListingWriteIntent,
): { code: string; message: string } | null {
  if (account.publishesFreely) return null;
  const publishing = write.enteringReview || write.statusActive;
  if (!publishing) {
    if (account.canSaveDraftListing) return null;
  } else if (account.canSaveDraftListing) {
    if (account.phase === "under_review") return { code: "APPLICATION_UNDER_REVIEW", message: DRAFT_OK_UNDER_REVIEW };
    if (account.phase === "approved") return { code: "APPLICATION_UNDER_REVIEW", message: DRAFT_OK_APPROVED_INACTIVE };
    return { code: "APPLICATION_UNDER_REVIEW", message: DRAFT_OK_NOT_YET };
  }
  if (account.applicationStatus === "rejected" || account.phase === "rejected") {
    return { code: "APPLICATION_NOT_APPROVED", message: CLOSED_REJECTED };
  }
  return { code: "APPLICATION_REQUIRED", message: CLOSED_NONE };
}

export interface AccessDeniedInput {
  requiredRole: string;
  userRole: string;
  supply: {
    kind: "expert" | "provider" | null;
    phase: ApplicationPhase;
    canSaveDraftListing: boolean;
  } | null;
  loadState: "loading" | "error" | "ready";
}

export interface AccessDeniedCopy {
  reason: string;
  next: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

const BACK = { primaryHref: "/dashboard", primaryLabel: "Back to Dashboard" };

function applyHref(kind: "expert" | "provider" | null, requiredRole: string): string {
  if (kind === "provider" || (kind == null && requiredRole === "provider")) return "/become-provider";
  return "/expert/apply";
}

function statusHref(kind: "expert" | "provider" | null): string {
  return kind === "provider" ? "/provider-status" : "/expert-status";
}

/**
 * Plain reason and next step for a page the role check refused.
 * Supply pages (expert, provider, earner) read the application. Other pages keep a short reason.
 */
export function accessDeniedCopy(input: AccessDeniedInput): AccessDeniedCopy {
  const supplyPage = input.requiredRole === "expert" || input.requiredRole === "provider" || input.requiredRole === "earner";
  if (supplyPage && input.loadState === "loading") {
    return { ...BACK, reason: "Checking your account.", next: "This page stays closed until that check finishes." };
  }
  if (supplyPage && input.loadState === "error") {
    return {
      ...BACK,
      reason: "We couldn't load your application status. This page stays closed.",
      next: "Go back to your dashboard and try again.",
    };
  }
  if (input.requiredRole === "admin") {
    return { ...BACK, reason: "This page is for administrators.", next: "Your dashboard is the way back." };
  }
  if (input.requiredRole === "executive_assistant") {
    return { ...BACK, reason: "This page is for executive assistants.", next: "Your dashboard is the way back." };
  }
  if (isProviderRole(input.userRole) && input.requiredRole === "expert") {
    return {
      reason: "This page is for experts.",
      next: "Your provider console is where you manage your listings.",
      primaryHref: "/provider/dashboard",
      primaryLabel: "Provider console",
    };
  }
  if (isExpertRole(input.userRole) && input.requiredRole === "provider") {
    return {
      reason: "This page is for providers.",
      next: "Your expert console is where you manage your listings.",
      primaryHref: "/expert/today",
      primaryLabel: "Expert console",
    };
  }

  const supply = input.supply;
  const pendingSupply = supplyPage && !isEarnerRole(input.userRole) && input.userRole !== "admin";
  if (pendingSupply && supply) {
    const draft = supply.canSaveDraftListing
      ? { secondaryHref: "/dashboard/listing", secondaryLabel: "Draft a listing" }
      : {};
    if (supply.phase === "under_review") {
      return {
        ...BACK,
        ...draft,
        reason: "Your application is under review, so this page is closed.",
        next: "You can save a draft listing from your dashboard. It stays private until your application is approved. This page opens after approval.",
      };
    }
    if (supply.phase === "action_needed") {
      return {
        ...BACK,
        ...draft,
        reason: "Your application still needs a step from you, so this page is closed.",
        next: "Finish the open step on your application status page. You can save a draft listing from your dashboard while you wait. This page opens after your application is approved.",
        secondaryHref: supply.canSaveDraftListing ? "/dashboard/listing" : statusHref(supply.kind),
        secondaryLabel: supply.canSaveDraftListing ? "Draft a listing" : "Application status",
      };
    }
    if (supply.phase === "rejected") {
      return {
        ...BACK,
        reason: "Your application was not approved, so this page is closed.",
        next: "Update and resubmit your application. This page opens after it is approved.",
        secondaryHref: applyHref(supply.kind, input.requiredRole),
        secondaryLabel: "Update application",
      };
    }
    if (supply.phase === "approved") {
      return {
        ...BACK,
        ...draft,
        reason: "Your application is approved, but this page opens once your account is activated.",
        next: "You can save a draft listing from your dashboard until then. It stays private.",
      };
    }
    if (input.requiredRole === "provider") {
      return {
        ...BACK,
        reason: "This page is for approved providers.",
        next: "Submit a provider application first. After you submit, you can save a draft listing from your dashboard. This page opens once your application is approved.",
        secondaryHref: "/become-provider",
        secondaryLabel: "Apply as a provider",
      };
    }
    if (input.requiredRole === "expert") {
      return {
        ...BACK,
        reason: "This page is for approved experts.",
        next: "Submit an expert application first. After you submit, you can save a draft listing from your dashboard. This page opens once your application is approved.",
        secondaryHref: "/expert/apply",
        secondaryLabel: "Apply as an expert",
      };
    }
    return {
      ...BACK,
      reason: "This page is for approved experts and providers.",
      next: "Submit an application first. After you submit, you can save a draft listing from your dashboard. This page opens once your application is approved.",
      secondaryHref: "/expert/apply",
      secondaryLabel: "Apply as an expert",
    };
  }

  return {
    ...BACK,
    reason: "You don't have permission to access this page.",
    next: "Your dashboard is the way back.",
  };
}
