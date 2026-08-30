---
name: Service delete cascade guard
description: Deleting a provider_services row cascades to service_bookings — always soft-delete when bookings exist
---

**Rule:** `service_bookings.service_id` is **ON DELETE CASCADE** onto `provider_services`. Any endpoint that deletes a provider_services row must first count referencing bookings inside a transaction with the service row locked `FOR UPDATE`; if any exist, soft-delete (`status='suspended'`) instead of hard-deleting.

**Why:** a hard delete silently destroys historical bookings and the platform-fee revenue snapshots dashboards sum — and the guard has already been missed once on a sibling route after being added to another, so never assume one fixed route covers all delete paths for the same table.

**How to apply:** whenever adding or reviewing any delete of a provider_services row (services, properties, rooms, bundles all live in that table), grep for other raw deletes of the same table and confirm each is either booking-guarded or provably unreachable by booked rows. The `FOR UPDATE` lock matters: a concurrent checkout's FK KEY SHARE lock conflicts with it, so no booking can slip between the count and the delete.
