# 3DS × Verifiable Credentials MVP

> **Proof of Concept:** Embedding SD-JWT-based Verifiable Presentations into EMV 3-D Secure authentication flows

[日本語版はこちら → README.ja.md](./README.ja.md)

---

## Problem

EMV 3DS v2.x allows merchants to pass authentication context via `threeDSRequestorAuthenticationInfo`, but the cardholder attributes included (name, address, date of birth, etc.) are **self-reported values with no cryptographic guarantee**. The issuing bank has no way to verify them.

This prototype proposes embedding a **W3C Verifiable Presentation (VP Token)** — a cryptographically signed credential issued by the card-issuing bank — directly into the `threeDSReqAuthData` field. Since the ACS is operated by the issuer itself, it can verify its own credential without any external Trust Registry.

## Proposed Architecture

```
[Mock Issuer (Bank)]
     │  Issues SD-JWT-VC (address, name, birthdate, age)
     ▼
[Mock Wallet (Cardholder)]
     │  Creates VP Token (dc+sd-jwt) with Selective Disclosure
     │  → discloses address only; hides name/birthdate/age
     ▼
[Merchant / 3DS Integration Layer]
     │  Builds AReq: embeds VP Token in threeDSReqAuthData
     ▼
[Mock ACS (= Issuer)]
     │  1. Extracts VP Token from threeDSReqAuthData
     │  2. Verifies VC signature (ES256, self-issued trust model)
     │  3. Verifies Key Binding JWT (replay attack prevention)
     │  4. Checks disclosed claims (postal code, etc.)
     ▼
    ARes { transStatus: "Y", vcVerificationResult: { verified: true, ... } }
```

### Key Design Point: Circular Trust Model

The ACS is operated by the issuing bank — the same entity that issued the VC. This means the ACS can verify credentials **without any external Trust Registry**, using only its own public key. This self-contained trust model is the primary simplification that makes a PoC feasible today.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm
npm install -g pnpm

git clone https://github.com/<your-org>/3ds-vc-mvp.git
cd 3ds-vc-mvp
pnpm install
pnpm demo
```

## Demo Output (Sample)

```
============================================================
=== Step 1: Issuer issues SD-JWT-VC ===
============================================================
SD-JWT-VC structure: JWT + 5 Disclosures (all SD-encrypted)
  - family_name:       [SD-encrypted]
  - given_name:        [SD-encrypted]
  - birthdate:         [SD-encrypted]
  - address:           [SD-encrypted]
  - age_equal_or_over: [SD-encrypted]

============================================================
=== Step 2: Wallet generates VP Token (address only) ===
============================================================
Disclosed:
  - address: {"postal_code":"100-0001","locality":"千代田区",...}
Not disclosed: family_name, given_name, birthdate, age_equal_or_over

============================================================
=== Step 3: Merchant builds AReq ===
============================================================
VP Token payload size: 1671 chars (limit: 50,000) → 3.3% used ✓

============================================================
=== Step 4: ACS verifies VP Token ===
============================================================
ARes:
{
  "transStatus": "Y",
  "vcVerificationResult": {
    "verified": true,
    "vcIssuer": "did:example:issuer-bank-jp",
    "verifiedClaims": ["address"],
    "vcExpiresAt": 1809566271
  }
}

✓ VP Token verification: SUCCESS
```

## Technical Stack

| Component | Library |
|-----------|---------|
| SD-JWT-VC issuance | `@sd-jwt/core` 0.19.0 |
| Key generation / signing | `@sd-jwt/crypto-nodejs` (ES256) |
| VP Token (dc+sd-jwt) | `@sd-jwt/core` `SDJwtInstance.present()` |
| Key Binding JWT | `@sd-jwt/core` KB-JWT support |
| Runtime | Node.js 20+, TypeScript, pnpm workspaces |

## Repository Structure

```
packages/
├── shared/   # Shared type definitions (AReq/ARes, VP Token, VC payload)
├── issuer/   # Mock Issuer — issues SD-JWT-VC with selective disclosure
├── wallet/   # Mock Wallet — generates VP Token (address only disclosed)
├── acs/      # Mock ACS   — verifies VP Token, returns ARes
└── demo/     # E2E demo   — runs all four steps in one script
```

## What This Proves

| # | Claim | Result |
|---|-------|--------|
| 1 | SD-JWT-VC attributes can be stored as VP Token in `threeDSReqAuthData` | ✅ 1,671 chars (well within 50,000 limit) |
| 2 | ACS can verify the VC signature | ✅ ES256 verification via issuer public key |
| 3 | Selective Disclosure limits exposure to the minimum required | ✅ Only `address` disclosed; name/birthdate hidden |

## VP Token Format in `threeDSReqAuthData`

```json
{
  "version": "1.0",
  "vcFormat": "dc+sd-jwt",
  "vpToken": "<header>.<payload>.<sig>~<disclosure>~<kb-jwt>",
  "presentationSubmission": {
    "id": "...",
    "definition_id": "3ds-address-verification-v1",
    "descriptor_map": [{ "id": "postal-code", "format": "dc+sd-jwt", "path": "$" }]
  }
}
```

`threeDSReqAuthMethod` is set to `"10"` (Electronic ID / Digital Identity Wallet) as defined in EMV 3DS v2.3.1.1.

## Correspondence with EMVCo Open Items

This PoC addresses items in EMVCo White Paper Chapter 5 (Open Items):

| Open Item | This PoC's Approach |
|-----------|---------------------|
| Cardholder attribute verification | VC issued by the bank; ACS verifies its own credential |
| Minimal disclosure | SD-JWT Selective Disclosure (only postal code / address) |
| Replay attack prevention | Key Binding JWT with `nonce` = `threeDSServerTransID` |
| Trust anchor | Self-issued model (Issuer = ACS); no external Trust Registry needed |

## Known Limitations & Future Work

- **DS relay**: This PoC skips the Directory Server. A real deployment needs a protocol for passing VP Tokens through (or alongside) DS.
- **Trust Registry**: The self-issued model only works when Issuer = ACS. Cross-issuer scenarios need a Trust Registry (e.g., EBSI, X.509 PKI extension).
- **iframe / UAL**: Wallet interaction from a browser context requires a UX layer (e.g., OID4VP redirect or in-browser wallet API).
- **Credential format**: Only `dc+sd-jwt` is implemented. `iso-mdoc` (mDL) is not covered.
- **Full AReq fields**: Only VP-Token-relevant fields are modeled; full EMVCo field set is out of scope.

## License

MIT
