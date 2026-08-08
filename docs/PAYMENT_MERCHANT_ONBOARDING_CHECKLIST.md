# Payment Merchant Onboarding Checklist

Before activating any provider:

- confirm the legal merchant entity and settlement account ownership;
- obtain current official provider documentation and contract version;
- obtain sandbox credentials through the provider's official channel;
- record allowed origins, callback URLs and source IP requirements;
- separate sandbox and production credentials;
- store private values only in the approved secret manager;
- approve the exact public merchant identity shown to customers;
- verify refund, cancellation, expiry and reconciliation rules;
- implement signed callback verification and duplicate-event tests;
- run amount/currency mismatch and replay tests;
- complete security, privacy, finance and support sign-off;
- activate with a feature flag and monitored rollback plan.

Never copy credentials into Markdown, Git, browser storage, screenshots or issue trackers.
