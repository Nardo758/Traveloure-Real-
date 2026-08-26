# Earn demo seed

`npm run seed:earn-demo` creates the development-only marketplace fixtures described by the
Experts & Services earn-demo dispatch.

## Safety contract

- Refuses when `NODE_ENV=production` or `ENVIRONMENT=PROD`.
- Refuses when `DATABASE_URL` has a Neon/production host.
- Uses only `.test` account emails in the form `{market}-{specialty}@traveloure.test`.
- Upserts users by email or public handle and uses deterministic IDs for child fixtures.
- Re-running updates the same rows and does not create duplicate accounts or listings.
- Does not write fee values or bypass the normal offering/approval fields.
- Removes only the named Phase 0 probe users and the named `c24e6aaf…` comparison prefix.

## Coverage

Each of the eight launch markets receives a local expert, trip planner, provider, two neighborhoods
with three gems each, and a wanted slot. Kyoto and Mumbai also receive event planners. Expert
accounts receive approved services/templates/ready-mades; providers receive approved active services
and three approved service reviews. The existing `test-provider-qa` storefront is enriched; the
existing `kansai-bizlang` storefront is left unchanged.

The runner prints inserted-row counters and a deletion cascade report. A production guard check can
be run without touching the database:

```sh
NODE_ENV=production npm run seed:earn-demo
```

That command must exit non-zero with a refusal message.