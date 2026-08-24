---
name: EA Client Delegation System
description: How the EA client roster and delegation layer works — schema, routes, and UI location.
---

## What it does
EAs can maintain a roster of client users, save payment reference info per client, and push in-app notifications to clients who have platform accounts.

## Key design decisions
- Payment info is **reference-only** (billing name, address, card notes like "Amex ending 4242") — never raw card numbers. Stored in `ea_client_relationships.payment_notes`.
- Push notifications use the existing `notifications` table with `type = "ea_message"`.
- Clients without a Traveloure account can still be stored by email only (`clientUserId` is nullable).

**Why:** Avoids PCI scope while still letting EAs track which card to use per client.

## Schema
Table: `ea_client_relationships` in `shared/schema.ts` (end of file). Fields: eaUserId, clientUserId (nullable FK), clientEmail, displayName, notes, billingName, billingEmail, billingAddress, paymentNotes, preferredCurrency.

## Routes (server/routes.ts, end of file)
- GET /api/ea/clients — list with joined user data
- POST /api/ea/clients — add by email (auto-links if user found)
- PATCH /api/ea/clients/:id — update payment/notes
- DELETE /api/ea/clients/:id — remove
- POST /api/ea/clients/:id/push — create notification for client

## Frontend
Page: `client/src/pages/ea/clients.tsx`. Route: `/ea/clients` (requiredRole: executive_assistant). Nav entry added to ea-sidebar.tsx above Executives.
