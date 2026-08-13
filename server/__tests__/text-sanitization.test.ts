/**
 * Task 1135 regression tests — provider free-text sanitization on write.
 *
 * Proves (1) the shared sanitizer strips tags / entity-encodes dangerous chars,
 * (2) the exact pipelines the routes use produce sanitized values across every
 * provider-service prose field (including JSON prose: faqs / whatIncluded /
 * requirements / pricingTiers), and (3) validation runs AGAINST the sanitized
 * value — tag-only required fields reject, and entity expansion can't sneak an
 * accepted value past a varchar length limit.
 *
 * Run: npx tsx --test server/__tests__/text-sanitization.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeText,
  sanitizeDeep,
  sanitizeProviderServiceBody,
  sanitizeTextFields,
  PROVIDER_SERVICE_TEXT_FIELDS,
  EXPERT_LISTING_TEXT_FIELDS,
} from "../utils/text-sanitizer";
import { insertProviderServiceSchema, insertProviderServiceListingSchema } from "@shared/schema";
import { bundleCreateSchema, propertyCreateSchema } from "../routes/provider.routes";
import { sendMessageSchema } from "../routes/messages";

const XSS = `<img src=x onerror=alert(1)>`;
const SCRIPT = `<script>steal()</script>`;

test("sanitizeText strips tags and encodes dangerous characters", () => {
  assert.equal(sanitizeText(`${XSS}hello`), "hello");
  assert.equal(sanitizeText(`a "quoted" 'word'`), "a &quot;quoted&quot; &#39;word&#39;");
  assert.equal(sanitizeText("plain prose, no markup."), "plain prose, no markup.");
  // non-strings pass through
  assert.equal(sanitizeText(42 as any), 42);
});

test("sanitizeDeep handles string arrays and nested objects", () => {
  const out = sanitizeDeep({
    list: [`${SCRIPT}a`, "b"],
    faqs: [{ question: `${XSS}Q?`, answer: `<b>A</b>` }],
    tiers: [{ label: `<i>Basic</i>`, price: "29.99", unit: null, n: 3 }],
  });
  assert.deepEqual(out.list, ["a", "b"]);
  assert.deepEqual(out.faqs, [{ question: "Q?", answer: "A" }]);
  assert.deepEqual(out.tiers, [{ label: "Basic", price: "29.99", unit: null, n: 3 }]);
});

test("provider service create pipeline sanitizes every prose field (route order: sanitize → parse)", () => {
  const body: Record<string, any> = {
    serviceName: `${SCRIPT}Tokyo Tour`,
    shortDescription: `${XSS}Short`,
    description: `<div onclick="x()">Long description</div>`,
    priceBasedOn: `<b>per group</b>`,
    deliveryTimeframe: `<i>24-48 hours</i>`,
    location: `${XSS}Tokyo`,
    meetingPoint: `<a href="javascript:x">Station</a>`,
    pickupAddress: `${SCRIPT}1-1 Chiyoda`,
    cancellationPolicy: `${XSS}Full refund 48h before`,
    whatIncluded: [`${SCRIPT}3 hours shooting`, "50+ edited photos"],
    requirements: [`<img src=x onerror=hack()>Comfortable shoes`],
    faqs: [{ question: `${XSS}Is lunch included?`, answer: `<script>x</script>No` }],
    pricingTiers: [{ label: `<b>Basic</b>`, price: "100", unit: "per person", description: `${XSS}Entry tier` }],
    price: "100",
  };
  const input = insertProviderServiceSchema.parse(sanitizeProviderServiceBody(body)) as Record<string, any>;
  assert.equal(input.serviceName, "Tokyo Tour");
  assert.equal(input.shortDescription, "Short");
  assert.equal(input.description, "Long description");
  assert.equal(input.priceBasedOn, "per group");
  assert.equal(input.deliveryTimeframe, "24-48 hours");
  assert.equal(input.location, "Tokyo");
  assert.equal(input.meetingPoint, "Station");
  assert.equal(input.pickupAddress, "1-1 Chiyoda");
  assert.equal(input.cancellationPolicy, "Full refund 48h before");
  assert.deepEqual(input.whatIncluded, ["3 hours shooting", "50+ edited photos"]);
  assert.deepEqual(input.requirements, ["Comfortable shoes"]);
  assert.deepEqual(input.faqs, [{ question: "Is lunch included?", answer: "No" }]);
  assert.deepEqual(input.pricingTiers, [
    { label: "Basic", price: "100", unit: "per person", description: "Entry tier" },
  ]);
  // No raw markup survives anywhere in the sanitized payload.
  assert.ok(!JSON.stringify(sanitizeProviderServiceBody(body)).includes("<"));
});

test("deliverables and dynamic categoryAttributes text are sanitized on the service pipeline", () => {
  const input = insertProviderServiceSchema.partial().parse(
    sanitizeProviderServiceBody({
      deliverables: [`${SCRIPT}PDF guide`, `<img src=x onerror=hack()>Map`],
      categoryAttributes: {
        vehicleType: `<b>Sedan</b>`,
        notes: `${XSS}Meet at gate`,
        nested: { freeText: `<script>x()</script>ok` },
        maxSeats: 4,
      },
      availability: [{ day: `<i>Monday</i>`, slots: ["09:00"] }],
    }),
  ) as Record<string, any>;
  assert.deepEqual(input.deliverables, ["PDF guide", "Map"]);
  assert.deepEqual(input.categoryAttributes, {
    vehicleType: "Sedan",
    notes: "Meet at gate",
    nested: { freeText: "ok" },
    maxSeats: 4,
  });
  assert.deepEqual(input.availability, [{ day: "Monday", slots: ["09:00"] }]);
  assert.ok(!JSON.stringify(input.deliverables).includes("<"));
});

test("provider service PATCH pipeline (partial) sanitizes too", () => {
  const patched = insertProviderServiceSchema
    .partial()
    .parse(sanitizeProviderServiceBody({ description: `${SCRIPT}Updated` })) as Record<string, any>;
  assert.equal(patched.description, "Updated");
});

test("PROVIDER_SERVICE_TEXT_FIELDS covers the JSON prose fields", () => {
  for (const f of ["cancellationPolicy", "whatIncluded", "requirements", "faqs", "pricingTiers"]) {
    assert.ok((PROVIDER_SERVICE_TEXT_FIELDS as readonly string[]).includes(f), `missing ${f}`);
  }
});

test("tag-only required names reject AFTER sanitization (never reach storage)", () => {
  // Provider service create: `<script></script>` serviceName sanitizes to "" → schema min(1) rejects.
  assert.throws(() =>
    insertProviderServiceSchema.parse(sanitizeProviderServiceBody({ serviceName: "<script></script>", price: "10" })),
  );
  assert.throws(() =>
    insertProviderServiceSchema.parse(sanitizeProviderServiceBody({ serviceName: "<b> </b>", price: "10" })),
  );
  // PATCH partial: a present-but-tag-only serviceName also rejects (min survives .partial()).
  assert.throws(() =>
    insertProviderServiceSchema.partial().parse(sanitizeProviderServiceBody({ serviceName: "<i></i>" })),
  );
  // Expert listing create pipeline (route order: sanitize → parse): tag-only title rejects.
  assert.throws(() =>
    insertProviderServiceListingSchema.parse(
      sanitizeTextFields(
        { title: "<img src=x onerror=alert(1)>", price: "10" },
        EXPERT_LISTING_TEXT_FIELDS,
      ),
    ),
  );
  // Entity expansion on serviceName can't sneak past the varchar(255) limit.
  assert.throws(() =>
    insertProviderServiceSchema.parse(sanitizeProviderServiceBody({ serviceName: "'".repeat(250), price: "10" })),
  );
});

test("expert listing pipeline sanitizes prose fields", () => {
  const parsed = insertProviderServiceListingSchema.partial().parse(
    sanitizeTextFields(
      { title: `${XSS}Hidden Gems`, description: `<b>desc</b>`, deliverables: [`${SCRIPT}PDF guide`] },
      EXPERT_LISTING_TEXT_FIELDS,
    ),
  ) as Record<string, any>;
  assert.equal(parsed.title, "Hidden Gems");
  assert.equal(parsed.description, "desc");
  assert.deepEqual(parsed.deliverables, ["PDF guide"]);
});

test("bundle/property schemas sanitize BEFORE min/max validation", () => {
  const bundle = bundleCreateSchema.parse({
    serviceName: `${SCRIPT}Weekend Bundle`,
    description: `${XSS}Two services`,
    price: "50",
    componentServiceIds: ["a", "b"],
  });
  assert.equal(bundle.serviceName, "Weekend Bundle");
  assert.equal(bundle.description, "Two services");

  // A tag-only required name sanitizes to "" and must FAIL min(1), not persist empty.
  assert.throws(() =>
    bundleCreateSchema.parse({ serviceName: "<b></b>", price: "50", componentServiceIds: ["a", "b"] }),
  );

  // Entity expansion: 250 apostrophes encode to 5×250 chars — must fail max(255), not
  // pass validation and blow up at the varchar(255) column.
  assert.throws(() =>
    propertyCreateSchema.parse({
      serviceName: "'".repeat(250),
      rooms: [{ roomName: "Room", price: "10" }],
    }),
  );

  // Sane property create passes and is sanitized.
  const prop = propertyCreateSchema.parse({
    serviceName: `${XSS}Ryokan`,
    location: `<i>Kyoto</i>`,
    rooms: [{ roomName: `${SCRIPT}Twin`, description: `<b>nice</b>`, price: "120" }],
  });
  assert.equal(prop.serviceName, "Ryokan");
  assert.equal(prop.location, "Kyoto");
  assert.equal(prop.rooms[0].roomName, "Twin");
  assert.equal(prop.rooms[0].description, "nice");
});

test("provider/expert application pipelines sanitize prose and JSONB (route order: sanitize → parse)", async () => {
  const { sanitizeBodyFields, PROVIDER_APPLICATION_TEXT_FIELDS, EXPERT_APPLICATION_TEXT_FIELDS } =
    await import("../utils/text-sanitizer");
  const { insertServiceProviderFormSchema, insertLocalExpertFormSchema } = await import("@shared/schema");

  const provider = insertServiceProviderFormSchema.partial().parse(
    sanitizeBodyFields(
      {
        businessName: `${SCRIPT}Acme Tours`,
        name: `${XSS}Jane`,
        address: `<b>1 Main St</b>`,
        description: `<div onclick=x>We do tours</div>`,
        serviceOffers: [{ category: `<i>transport</i>`, notes: [`${SCRIPT}airport pickup`] }],
      },
      PROVIDER_APPLICATION_TEXT_FIELDS,
    ),
  ) as Record<string, any>;
  assert.equal(provider.businessName, "Acme Tours");
  assert.equal(provider.name, "Jane");
  assert.equal(provider.address, "1 Main St");
  assert.equal(provider.description, "We do tours");
  assert.deepEqual(provider.serviceOffers, [{ category: "transport", notes: ["airport pickup"] }]);

  // insertLocalExpertFormSchema has effects (no .partial()); the route sanitizes BEFORE
  // parse, so asserting the sanitized body is what the schema/storage receives.
  void insertLocalExpertFormSchema;
  const expert = sanitizeBodyFields(
      {
        bio: `${XSS}I know Kyoto`,
        portfolio: `<script>x</script>my work`,
        certifications: `<b>Guide license</b>`,
        knowledgeProofAnswers: [{ questionId: "q1", answer: `${SCRIPT}The temple opens at 6am` }],
        specialties: [`<i>food</i>`, "temples"],
      },
      EXPERT_APPLICATION_TEXT_FIELDS,
  ) as Record<string, any>;
  assert.equal(expert.bio, "I know Kyoto");
  assert.equal(expert.portfolio, "my work");
  assert.equal(expert.certifications, "Guide license");
  assert.deepEqual(expert.knowledgeProofAnswers, [{ questionId: "q1", answer: "The temple opens at 6am" }]);
  assert.deepEqual(expert.specialties, ["food", "temples"]);
});

test("string-array JSONB fields (deliveryLanguages, listing experienceTypes) are sanitized", () => {
  const svc = insertProviderServiceSchema.partial().parse(
    sanitizeProviderServiceBody({ deliveryLanguages: [`${SCRIPT}English`, `<b>French</b>`] }),
  ) as Record<string, any>;
  assert.deepEqual(svc.deliveryLanguages, ["English", "French"]);

  const listing = sanitizeTextFields(
    { title: "Tour", price: "10", experienceTypes: [`<img src=x onerror=x()>food`, "culture"] },
    EXPERT_LISTING_TEXT_FIELDS,
  ) as Record<string, any>;
  assert.deepEqual(listing.experienceTypes, ["food", "culture"]);
  assert.ok(!JSON.stringify(listing).includes("<"));
});

test("officeLocation address sanitizes markup", () => {
  // Mirrors PATCH /api/provider-application: sanitizeText then slice(0, 500).
  const address = sanitizeText(`<img src=x onerror=alert(1)>221B Baker St`).slice(0, 500);
  assert.equal(address, "221B Baker St");
});

test("message body: sanitized, capped, and tag-only rejects", () => {
  const ok = sendMessageSchema.parse({ recipientId: "r1", message: `${XSS}hi there` });
  assert.equal(ok.message, "hi there");
  // tag-only sanitizes to empty → min(1) rejects
  assert.equal(sendMessageSchema.safeParse({ recipientId: "r1", message: "<script></script>" }).success, false);
  // over-length rejects
  assert.equal(sendMessageSchema.safeParse({ recipientId: "r1", message: "a".repeat(10001) }).success, false);
});
