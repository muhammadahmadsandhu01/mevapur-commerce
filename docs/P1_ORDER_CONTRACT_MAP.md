# P1 Order Contract Map

Captured after the P1 baseline and before any P1 Order source edit.

## Active Runtime Flow

```text
frontend/src/app/checkout/page.tsx
  -> frontend/src/services/order.service.ts
  -> frontend/src/lib/api.ts (P0 in-memory bearer token)
  -> POST /api/orders
  -> backend/app.js
  -> backend/routes/orderRoutes.js
  -> backend/middleware/auth.js
  -> backend/controllers/orderController.js
  -> backend/services/order/OrderService.js
     -> Product
     -> CouponService -> Coupon
     -> ShippingService / TaxService
     -> InventoryService -> Product
     -> Order
  -> MongoDB
```

The route is active, but the pre-P1 route does not mount `orderValidator.js`.

## Pre-P1 Checkout Request

The active storefront sends:

```json
{
  "items": [
    {
      "product": "product ObjectId",
      "quantity": 1
    }
  ],
  "shippingAddress": {
    "fullName": "Customer Name",
    "phone": "03XXXXXXXXX",
    "address": "street address",
    "city": "Lahore",
    "postalCode": "54000"
  },
  "paymentMethod": "COD | visa | mastercard | jazzcash",
  "couponCode": "optional",
  "notes": "optional"
}
```

Pre-P1 checkout omissions:

- province and country are displayed but not sent;
- the cart retains only a variant label/SKU, not the Product variant subdocument ID;
- no `Idempotency-Key` header is sent;
- client-only coupon values are hardcoded for display;
- card brands are sent as payment methods;
- JazzCash is selectable although the provider is an incomplete 501 skeleton.

The checkout computes display totals locally. `OrderService` independently recalculates totals, but the request validator is not mounted and no strict rejection protects against unexpected monetary fields.

## Pre-P1 Backend Validation Contract

`backend/validators/orderValidator.js` expects:

- item fields `product` and `quantity`;
- address fields `fullName`, `phone`, `address`, `city`, and required five-digit `postalCode`;
- `paymentMethod` in `COD`, `visa`, `mastercard`, or `jazzcash`;
- optional `couponCode` and `notes`.

Mismatches:

- Order model accepts `COD`, `jazzcash`, `card`, `easypaisa`, and `bank_transfer`;
- Stripe is an active payment provider but absent from the Order enum;
- Visa/Mastercard are brands, not provider rails;
- validator is not mounted;
- ObjectId format, duplicate lines, line/quantity caps, variants, province/country, strict unknown fields, idempotency header, query pagination, and status transitions are not validated.

## Controller and Service Signatures

Pre-P1:

```text
createOrder(req, res, next)
  -> OrderService.createOrder(req.user.id, req.body)
  -> returns Order
```

The controller returns `{ success, message, order }`, logs the complete request body on failure, and bypasses the canonical error envelope for selected errors.

`OrderService.createOrder(userId, orderData)`:

- loads root Product prices;
- ignores variant selection;
- calls CouponService outside the transaction session for validation;
- performs sequential stock read/check/save;
- creates the Order inside a transaction;
- increments coupon usage without a conditional usage-limit predicate;
- has no idempotency or bounded transaction retry.

## Pre-P1 Order Schema

- `orderId`: required/unique, but populated in `pre('save')` after validation.
- `items`: Product reference, name, price, quantity, image, string variant, and SKU.
- `shippingAddress`: fullName, phone, address, city, province, postalCode, country.
- `paymentMethod`: incompatible enum noted above.
- `paymentStatus`: Pending, Paid, Failed, Refunded.
- `payment.provider`: COD, Stripe, JazzCash.
- `orderStatus`: Pending, Processing, Shipped, Delivered, Cancelled.
- totals: subtotal, shippingCost, discount, totalAmount as Number.
- timeline: unvalidated status/timestamp/note only.
- absent: coupon snapshot, idempotency key/hash, tax amount, line total, variant ObjectId, cancellation restoration guards, actor history.

## Product and Variant Contract

Root Product fields:

- `_id`, `name`, `sku`, `price`, `stock`, `isActive`, `image`/`primaryImage`.

Variant subdocuments:

- automatic `_id`;
- `sku`, `attributes`, `price`, `salePrice`, `stock`, `images`, `isDefault`.

The product detail UI currently stores only a human label and SKU in the cart. The canonical request must carry the selected variant `_id`.

## Coupon Contract

Coupon fields:

- code, type (`percentage`, `fixed`, `freeshipping`), value;
- minimum order and maximum discount;
- global usage limit and used count;
- active start/end dates;
- optional applicable products/categories.

Pre-P1 gaps:

- no per-customer usage field;
- no atomic conditional usage reservation;
- validation omits the Mongo session;
- Order has no coupon field despite OrderService/controller using one;
- cancellation can decrement below zero and has no at-most-once guard.

## Inventory Contract

`InventoryService` reads each Product, checks stock, mutates the document, and saves it in the session. This is transactional intent but not a conditional atomic decrement. Variants are ignored.

`InventoryTransaction` supports `sale`/`return` journal records with product, quantity, previous/new stock, reference, performer, and metadata. Order sales do not currently write it, and no operation id prevents a duplicate journal on retry.

## Payment Names and Boundary

Read-only payment inspection confirms:

- active provider keys: `stripe`, `jazzcash`;
- payment controller validation accepts `stripe` or `jazzcash`;
- Stripe is implemented but not end-to-end verified;
- JazzCash provider operations are an incomplete skeleton;
- COD does not use PaymentService.

P1 will not modify PaymentService, PaymentStateMachine, StripeProvider, JazzCashProvider, webhook handling, Refund, or Return implementations.

Canonical Order payment methods:

- `cod`
- `stripe`

`jazzcash` remains a known but unavailable method and must be rejected/disabled. Visa, Mastercard, and card are not canonical backend payment methods.

## Status Names

Active first-party code uses title-case Order statuses:

- Pending
- Processing
- Shipped
- Delivered
- Cancelled

P1 will retain title-case values for compatibility and add `Confirmed`. Explicit transitions and actor history will replace free-form assignment.

## Response Contract

Canonical success:

```json
{
  "success": true,
  "data": {
    "order": {}
  },
  "meta": {
    "requestId": "opaque"
  }
}
```

Canonical errors continue through the P0 central error handler:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_*",
    "message": "safe message"
  },
  "meta": {
    "requestId": "opaque"
  }
}
```

## Active and Inactive Implementations

| Path | Classification | Evidence |
|---|---|---|
| `backend/models/Order.js` | Active | imported by controller/services/payment |
| `backend/app/Models/Order.js` | Inactive duplicate | no active Express first-party import |
| `backend/services/order/OrderService.js` | Active | controller import |
| `backend/services/payment/PaymentService.js` | Active but read-only in P1 | payment controller import |
| `backend/services/paymentService.js` | Inactive duplicate | no active route/controller import |
| `frontend/src/components/checkout/PaymentModal.tsx` | Active | active checkout import |
| `frontend/src/components/PaymentModal.tsx` | Inactive unsafe duplicate | referenced only by checkout backup |
| `frontend/src/app/checkout/backup.tsx` | Inactive backup | not a Next.js route |
| `frontend/src/hooks/useCheckout.ts` | Inactive | no active import found |

## Canonical P1 Request

```json
{
  "items": [
    {
      "productId": "ObjectId",
      "quantity": 1,
      "variantId": "optional ObjectId"
    }
  ],
  "shippingAddress": {
    "fullName": "Customer Name",
    "phone": "03XXXXXXXXX",
    "address": "Street and area",
    "addressLine2": "optional",
    "city": "Lahore",
    "province": "Punjab",
    "postalCode": "optional",
    "country": "Pakistan"
  },
  "paymentMethod": "cod | stripe",
  "couponCode": "optional",
  "customerNote": "optional"
}
```

The client sends no product name, SKU, price, stock, discount, shipping, tax, subtotal, or total. The authenticated user and `Idempotency-Key` header complete the creation identity.

