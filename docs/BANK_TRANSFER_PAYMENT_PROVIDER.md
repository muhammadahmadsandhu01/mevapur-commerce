# Bank Transfer Payment Provider

Scope: manual Pakistan transfer, PKR only.

Availability requires explicitly approved public merchant display fields. Creation generates a unique internal payment reference and returns only the public account title, bank name, public account reference and bounded instructions.

The customer may submit a bounded transaction reference and optional note. The reference is normalized and hashed for uniqueness; only a masked form is returned. Submission moves the payment to `AwaitingVerification` and never marks the order paid.

An authorized admin may approve or reject. Approval completes payment and marks the order paid in one transaction. Binary proof uploads are outside P2.2.
