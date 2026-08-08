# COD Payment Provider

Scope: Pakistan delivery addresses, PKR only, no external API.

Flow:

1. Checkout creates one order and one `Pending` COD payment record.
2. Delivery/admin staff use the authorized collection action.
3. The backend transaction marks payment `Completed` and order `Paid`.
4. Repeated collection is idempotent.
5. Cancelled orders and non-Pending COD payments cannot be collected.

Collection writes an append-only audit event. The browser cannot mark COD collected.
