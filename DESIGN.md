# 詳細設計書 — 3DS × Verifiable Credentials MVP

## 1. フロー全体図

```
[Mock Issuer]
     │  SD-JWT-VC発行（住所・生年月日・氏名）
     ▼
[Mock Wallet]
     │  VP Token生成（dc+sd-jwt, Selective Disclosure）
     │  ※ここでは郵便番号のみを開示するVPを生成
     ▼
[Merchant / 3DS統合レイヤー]
     │  AReq構築: VP TokenをthreeDSRequestorAuthenticationInfoに格納
     ▼
[Mock ACS]
     │  1. threeDSRequestorAuthenticationInfoからVP Tokenを抽出
     │  2. VCKnotsのVerifierでVC署名を検証
     │  3. 開示クレームの確認（郵便番号の一致など）
     │  4. 検証結果をリスクスコアに反映
     ▼
    ARes（認証結果）
```

## 2. packages/shared — 共有型定義

### ファイル構成

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types/
    │   ├── vc-payload.types.ts      # VCのクレーム型
    │   ├── threeds.types.ts         # 3DS AReq/ARes構造体
    │   └── vp-token.types.ts        # VP Token格納フォーマット
    └── constants/
        └── threeds.constants.ts     # 3DSフィールド定数
```

### 型定義

#### `vc-payload.types.ts`

```typescript
// イシュアが発行するSD-JWT-VCのペイロード
export interface IdCardVcPayload {
  // 常に開示（非選択的）
  vct: string           // "https://issuer.example.jp/id-card/v1"
  iss: string           // イシュアのDID or URL
  iat: number           // 発行日時（Unix timestamp）
  exp: number           // 有効期限（Unix timestamp）
  sub: string           // カード会員のDID

  // 選択的開示クレーム（SD-JWT の _sd で隠蔽される）
  family_name?: string
  given_name?: string
  birthdate?: string    // "YYYY-MM-DD"
  address?: {
    postal_code: string   // 例: "100-0001"
    locality: string      // 例: "千代田区"
    region: string        // 例: "東京都"
    country: string       // "JP"
  }
  age_equal_or_over?: {
    "18": boolean
  }
}
```

#### `threeds.types.ts`

```typescript
// EMV 3DS v2.3.1.1 の threeDSRequestorAuthenticationInfo
// 本来は3DS仕様で定義される構造体。ここでは本提案の拡張部分を定義する。
export interface ThreeDSRequestorAuthInfo {
  threeDSReqAuthMethod: ThreeDSAuthMethod
  threeDSReqAuthTimestamp: string   // YYYYMMDDHHmmss
  threeDSReqAuthData?: string       // VP Token格納フィールド（本提案のキャリア）
}

// Authentication Method値（EMV 3DS仕様定義）
export enum ThreeDSAuthMethod {
  NO_3RI_PRIOR      = "01",
  OWN_CREDENTIALS   = "02",
  FEDERATED_ID      = "03",
  ISSUER_CREDENTIALS= "04",
  THIRD_PARTY_AUTH  = "05",
  FIDO              = "06",
  ELECTRONIC_ID     = "10",  // ← EUDI Wallet / デジタルIDウォレット用
}

// threeDSReqAuthData に格納するVP Token拡張ペイロード（本提案の中核）
// このフォーマットがMVPの技術的貢献
export interface VpTokenAuthData {
  version: "1.0"
  vcFormat: "dc+sd-jwt"
  vpToken: string        // OID4VP VP Token (dc+sd-jwt形式)
  presentationSubmission: PresentationSubmission
}

export interface PresentationSubmission {
  id: string
  definition_id: string
  descriptor_map: DescriptorMap[]
}

export interface DescriptorMap {
  id: string
  format: "dc+sd-jwt"
  path: "$"
}

// モックAReq（本来はEMVCo仕様で定義される全フィールドを持つが、
// MVPではVP Token格納に関係するフィールドのみ定義）
export interface MockAReq {
  messageType: "AReq"
  messageVersion: "2.3.1.1"
  threeDSCompInd: "Y"
  threeDSRequestorAuthenticationInfo: ThreeDSRequestorAuthInfo
  // 本来はここにカード番号(ハッシュ)・加盟店情報・購入情報等が入る
  // MVPでは省略
  acctNumber: string      // モック用カード番号
  purchaseAmount: string  // 購入金額
  purchaseCurrency: string
  merchantName: string
}

// モックARes
export interface MockARes {
  messageType: "ARes"
  messageVersion: "2.3.1.1"
  transStatus: "Y" | "N" | "U" | "C" | "R"
  // 本提案の拡張：VP Token検証結果を追加
  vcVerificationResult?: {
    verified: boolean
    vcIssuer: string
    verifiedClaims: string[]     // 開示・検証済みのクレーム名
    vcExpiresAt: number
    verificationTimestamp: string
  }
}
```

#### `vp-token.types.ts`

```typescript
// OID4VP Presentation Definition（何のクレームを要求するか）
export interface PresentationDefinition {
  id: string
  input_descriptors: InputDescriptor[]
}

export interface InputDescriptor {
  id: string
  format: { "dc+sd-jwt": { alg: string[] } }
  constraints: {
    limit_disclosure: "required"
    fields: Field[]
  }
}

export interface Field {
  path: string[]
  filter?: { type: string; const?: unknown }
}

// 3DS用Presentation Definition（郵便番号のみ要求）
export const ADDRESS_PRESENTATION_DEFINITION: PresentationDefinition = {
  id: "3ds-address-verification-v1",
  input_descriptors: [
    {
      id: "postal-code",
      format: { "dc+sd-jwt": { alg: ["ES256"] } },
      constraints: {
        limit_disclosure: "required",
        fields: [
          { path: ["$.vct"], filter: { type: "string", const: "https://issuer.example.jp/id-card/v1" } },
          { path: ["$.address.postal_code"] },
        ],
      },
    },
  ],
}
```

---

## 3. packages/issuer — Mock Issuer

### 役割

SD-JWT-VC形式でIDカードVCを発行するモックイシュア。実際のユースケースでは銀行やマイナンバー機関が担う役割。

### ファイル構成

```
packages/issuer/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # エントリポイント（CLIまたはExpress）
    ├── issuer.ts             # イシュアのコアロジック
    ├── keys.ts               # 鍵ペア管理（起動時生成、メモリ保持）
    └── fixtures/
        └── sample-holder.ts  # モック用カード会員データ
```

### 実装仕様

#### `keys.ts`

```typescript
import { generateKeyPair, exportJWK } from "jose"

export interface IssuerKeys {
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicKeyJwk: JsonWebKey  // ACSが検証に使用
  kid: string               // "issuer-key-2026-01"
}

// 起動時にES256鍵ペアを生成。本番ではHSMやKMSを使う。
export async function generateIssuerKeys(): Promise<IssuerKeys>
```

#### `issuer.ts`

VCKnotsの`@sd-jwt/core`を使ってSD-JWT-VCを発行する。

```typescript
// 発行するVC（選択的開示設定）
// 以下のクレームをSDクレームとして設定（_sdで隠蔽可能にする）:
//   family_name, given_name, birthdate, address, age_equal_or_over
// 以下は常に開示（SDにしない）:
//   vct, iss, iat, exp, sub

export interface IssueVcOptions {
  holderPublicKey: JsonWebKey  // カード会員のウォレット公開鍵
  claims: Partial<IdCardVcPayload>
  expiresInDays?: number       // デフォルト365日
}

export async function issueIdCardVc(
  options: IssueVcOptions,
  issuerKeys: IssuerKeys
): Promise<string>  // SD-JWT-VC文字列を返す
```

#### `fixtures/sample-holder.ts`

```typescript
// デモ用モックホルダー（カード会員）データ
export const SAMPLE_HOLDER = {
  did: "did:example:holder-alice-12345",
  claims: {
    family_name: "山田",
    given_name: "太郎",
    birthdate: "1990-04-15",
    address: {
      postal_code: "100-0001",
      locality: "千代田区",
      region: "東京都",
      country: "JP",
    },
    age_equal_or_over: { "18": true },
  },
}
```

#### `index.ts`（CLIモード）

```
$ pnpm --filter issuer dev
```

実行すると以下を出力する:
1. イシュア公開鍵JWK（コンソール出力）
2. 発行したSD-JWT-VC文字列（コンソール出力 + `dist/issued-vc.txt`に保存）

---

## 4. packages/wallet — Mock Wallet

### 役割

Issuerから受け取ったSD-JWT-VCを保持し、3DS認証時にMerchantのリクエストに応じてVP Tokenを生成する。Selective Disclosureにより郵便番号のみ開示するVPを生成する。

### ファイル構成

```
packages/wallet/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # エントリポイント
    ├── wallet.ts             # VP Token生成コアロジック
    ├── keys.ts               # ウォレット（ホルダー）鍵管理
    └── fixtures/
        └── received-vc.ts    # issuerから受け取ったVCのモック（実行時に生成）
```

### 実装仕様

#### `wallet.ts`

```typescript
// Merchantから提示されたPresentation Definitionに従い
// SD-JWT-VCからVP Tokenを生成する

export interface GenerateVpTokenOptions {
  sdJwtVc: string                            // issuerから受け取ったSD-JWT-VC
  presentationDefinition: PresentationDefinition
  holderKeys: HolderKeys
  audience: string     // Merchantの識別子（KB-JWTのaud）
  nonce: string        // 3DS AReqのthreeDSServerTransID等を使用
}

export async function generateVpToken(
  options: GenerateVpTokenOptions
): Promise<{
  vpToken: string                  // dc+sd-jwt形式VP Token
  presentationSubmission: PresentationSubmission
}>
```

**Selective Disclosureの制御:**
- `ADDRESS_PRESENTATION_DEFINITION`を使う場合は `address.postal_code` のみ開示
- `family_name`, `given_name`, `birthdate`, `address.locality`等は開示しない
- Key Binding JWT（KB-JWT）を必ず付加する（`isKbJwt: true`）

#### `index.ts`（CLIモード）

```
$ pnpm --filter wallet dev
```

実行すると以下を出力する:
1. `dist/issued-vc.txt`（issuerパッケージの出力）を読み込む
2. ADDRESS_PRESENTATION_DEFINITIONに基づきVP Tokenを生成
3. 生成したVP Token文字列をコンソール出力 + `dist/vp-token.txt`に保存
4. 開示したクレームの一覧をコンソール出力（デバッグ用）

---

## 5. packages/acs — Mock ACS

### 役割

加盟店からAReqを受け取り、`threeDSRequestorAuthenticationInfo.threeDSReqAuthData`からVP Tokenを抽出・検証し、検証結果をAResに含めて返す。

### ファイル構成

```
packages/acs/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # エントリポイント（Express POST /areq）
    ├── acs.ts                # ACS検証コアロジック
    ├── verifier.ts           # VCKnotsのVerifierラッパー
    └── fixtures/
        └── issuer-public-key.ts  # 実行時にissuerから取得するモック
```

### 実装仕様

#### `verifier.ts`

```typescript
// VCKnotsのVerifier機能をラップし、3DS文脈での検証を行う

export interface VerifyVpTokenOptions {
  vpToken: string
  presentationSubmission: PresentationSubmission
  issuerPublicKeyJwk: JsonWebKey   // 自分（イシュア）の公開鍵
  expectedAudience: string
  expectedNonce: string
}

export interface VpVerificationResult {
  verified: boolean
  vcIssuer: string
  verifiedClaims: Record<string, unknown>  // 開示されたクレームのキーバリュー
  vcIssuedAt: number
  vcExpiresAt: number
  error?: string
}

export async function verifyVpToken(
  options: VerifyVpTokenOptions
): Promise<VpVerificationResult>
```

#### `acs.ts`

```typescript
// AReqを受け取り処理するコアロジック

export async function processAReq(areq: MockAReq): Promise<MockARes> {
  // 1. threeDSReqAuthMethodが "10" (Electronic ID) か確認
  // 2. threeDSReqAuthDataをJSONパース → VpTokenAuthData
  // 3. verifyVpToken()でVC署名検証
  // 4. 検証成功時: transStatus "Y" + vcVerificationResultを返す
  // 5. 検証失敗時: transStatus "U" + エラー詳細を返す
}
```

#### `index.ts`（Expressサーバー）

```
POST /areq
Content-Type: application/json
Body: MockAReq

Response: MockARes
```

---

## 6. packages/demo — E2Eデモスクリプト

### 役割

issuer → wallet → acs の全フローをスクリプト1本で実行し、各ステップの入出力をコンソールに表示する。GitHubのREADMEで `npx tsx packages/demo/src/index.ts` として実行できる形にする。

### ファイル構成

```
packages/demo/
├── package.json
└── src/
    └── index.ts
```

### 実行フロー

```typescript
// packages/demo/src/index.ts の処理順序

// Step 1: Issuer起動 → 鍵ペア生成 → SD-JWT-VC発行
console.log("=== Step 1: Issuer が SD-JWT-VC を発行 ===")
// ... issuerパッケージを直接importして実行

// Step 2: Wallet → VP Token生成（郵便番号のみ開示）
console.log("=== Step 2: Wallet が VP Token を生成（郵便番号のみ開示） ===")
// ... walletパッケージを直接importして実行

// Step 3: Merchant → AReq構築
console.log("=== Step 3: Merchant が AReq を構築 ===")
// threeDSRequestorAuthenticationInfoにVP Tokenを格納
// VP Tokenサイズをバイト数で表示（50,000文字制限の確認）

// Step 4: ACS → VP Token検証
console.log("=== Step 4: ACS が VP Token を検証 ===")
// ... acsパッケージを直接importして実行

// Step 5: 結果サマリー表示
console.log("=== 検証結果サマリー ===")
// 検証成功/失敗、開示されたクレーム、VCの有効期限等を表示
```

---

## 7. pnpmワークスペース設定

### `package.json`（ルート）

```json
{
  "name": "3ds-vc-mvp",
  "private": true,
  "scripts": {
    "demo": "tsx packages/demo/src/index.ts",
    "build": "pnpm -r build",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "vitest": "^1.4.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

### 各パッケージ共通の依存

```json
{
  "dependencies": {
    "@trustknots/vcknots": "latest",
    "@sd-jwt/core": "0.19.0",
    "@sd-jwt/crypto-nodejs": "0.19.0",
    "@sd-jwt/decode": "0.19.0",
    "jose": "^6.0.0",
    "express": "^4.18.0",
    "zod": "^4.0.0"
  }
}
```

---

## 8. 重要な実装メモ

### VP Tokenサイズの管理

`threeDSReqAuthData`フィールドには50,000文字制限がある。SD-JWT-VC + KB-JWTのサイズは通常1,000〜3,000文字程度に収まるが、デモスクリプトで必ずサイズをログ出力して確認すること。

```typescript
const vpTokenAuthData = JSON.stringify(vpTokenPayload)
console.log(`VP Token payload size: ${vpTokenAuthData.length} chars (limit: 50,000)`)
```

### KB-JWT（Key Binding JWT）のnonce

3DS文脈でKB-JWTのnonceには `threeDSServerTransID`（3DSトランザクションID）を使う設計にする。これにより特定の3DSトランザクションにVP提示が紐付けられ、リプレイ攻撃を防ぐ。デモでは `crypto.randomUUID()` で代替可。

### イシュア = ACS という「循環信頼」

このMVPの核心的な設計ポイント。ACSはイシュアが運営するため、外部のTrust Registryを参照せず自身の公開鍵でVCを検証できる。この「自己完結した信頼モデル」がPoC実現の最大の簡略化要因であり、同時にイシュア導入の最強の動機付けになる。

---

## 9. README.md（GitHubに公開するもの）の構成方針

実装完了後、READMEには以下を含める:
1. 解決する問題（現行3DSの申告値問題）
2. 提案アーキテクチャの図（ASCII or Mermaid）
3. `npx tsx packages/demo/src/index.ts` での実行手順
4. 出力サンプル（実際のVP Token・AReq・ARes）
5. EMVCo White Paper Chapter 5 Open Itemsとの対応表
6. 今後の課題（DS中継・Trust Registry・iframe/UAL問題）
7. 英語版も並記

英語版と日本語版を両方書く（`README.md` + `README.ja.md`）。
