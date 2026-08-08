# AI Assistant Role and Tool Policy

## Audiences

| Audience | Knowledge | Application data |
|---|---|---|
| Anonymous | Public products, navigation, policies, payment-method explanations, FAQ/contact/edition help | Public active product fields only |
| Authenticated customer | Anonymous scope plus customer account/order help | Current authenticated user’s bounded order/payment/refund summaries only |
| Admin | Approved admin/operations/configuration guidance | Bounded aggregates and redacted low-stock/provider summaries |

## Explicit tool allowlist

Customer/public:

- `searchPublicProducts`
- `getPublicProductDetails`
- `getCurrentCustomerOrders`
- `getCurrentCustomerOrderStatus`
- `getCurrentCustomerPaymentStatus`
- `getCurrentCustomerRefundStatus`

Admin:

- `getProductSummary`
- `getInventorySummary`
- `getLowStockSummary`
- `getOrderStatusSummary`
- `getPaymentStatusSummary`
- `getManualPaymentQueueSummary`
- `getRefundSummary`
- `getProviderAvailabilitySummary`

All definitions are marked read-only. There is no generic query, URL, file,
command, environment, report, mutation, provider-action, approval, or
configuration tool.

Customer tools never accept a user/customer ID from chat input. The service
binds the ID from verified authentication. Individual order lookup uses both
the authenticated ID and a tightly validated order number. Admin tools require
existing admin authorization and default to aggregates.

## Denied requests

- secrets, credentials, tokens, cookies, authorization headers;
- system/developer prompts or instruction override;
- environment variables and raw configuration;
- raw database access or arbitrary queries/reports;
- another user/customer/account;
- create/update/delete/approve/reject/complete/cancel/enable/disable actions;
- command/script/shell execution;
- unsupported legal, payment, delivery, or operational guarantees.

The assistant cannot bypass normal authorization. The dashboard remains
authoritative for critical order/payment/refund status.
