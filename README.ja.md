# 3DS × Verifiable Credentials MVP

> **プロトタイプ実装:** EMV 3-D Secure 認証フローへの SD-JWT ベース Verifiable Presentation 埋め込み

[English version → README.md](./README.md)

---

## 解決する問題

EMV 3DS v2.x では、加盟店が `threeDSRequestorAuthenticationInfo` を通じて認証コンテキストを渡せますが、カード会員の属性情報（氏名・住所・生年月日等）は**申告値であり、暗号学的な保証がありません**。イシュアはそれらの真正性を確認する手段を持っていません。

本プロトタイプは、イシュアが署名した **W3C Verifiable Presentation（VP Token）** を `threeDSReqAuthData` フィールドに直接埋め込むことを提案します。ACS はイシュア自身が運営するため、外部の Trust Registry なしに自身の発行したクレデンシャルを検証できます。

## 提案アーキテクチャ

```
[Mock Issuer（イシュア）]
     │  SD-JWT-VC を発行（住所・氏名・生年月日・年齢）
     ▼
[Mock Wallet（カード会員）]
     │  VP Token（dc+sd-jwt）を生成（Selective Disclosure）
     │  → 住所のみ開示、氏名・生年月日・年齢は非開示
     ▼
[加盟店 / 3DS 統合レイヤー]
     │  AReq 構築: VP Token を threeDSReqAuthData に格納
     ▼
[Mock ACS（= イシュア）]
     │  1. threeDSReqAuthData から VP Token を抽出
     │  2. VC 署名を検証（ES256、自己完結型信頼モデル）
     │  3. Key Binding JWT を検証（リプレイ攻撃防止）
     │  4. 開示クレームを確認（郵便番号等）
     ▼
    ARes { transStatus: "Y", vcVerificationResult: { verified: true, ... } }
```

### 設計の核心：イシュア = ACS の循環信頼モデル

ACS はクレデンシャルを発行したイシュア自身が運営します。そのため、**外部の Trust Registry を参照せず、自身の公開鍵だけで VC を検証**できます。この自己完結した信頼モデルが、PoC を現実的に実装できる最大の簡略化要因であり、同時にイシュアが 3DS に参加する最強の動機付けになります。

## クイックスタート

```bash
# 前提: Node.js 20+, pnpm
npm install -g pnpm

git clone https://github.com/nakada-yuya-vc/3ds-vc-mvp.git
cd 3ds-vc-mvp
pnpm install
pnpm demo
```

## デモ出力（実行サンプル）

```
============================================================
=== Step 1: Issuer が SD-JWT-VC を発行 ===
============================================================
SD-JWT-VC構造: JWT + 5 個のDisclosure（全フィールドSD暗号化）
  - family_name:       [SD-encrypted]
  - given_name:        [SD-encrypted]
  - birthdate:         [SD-encrypted]
  - address:           [SD-encrypted]
  - age_equal_or_over: [SD-encrypted]

============================================================
=== Step 2: Wallet が VP Token を生成（住所のみ開示） ===
============================================================
開示したDisclosure:
  - address: {"postal_code":"100-0001","locality":"千代田区",...}
非開示フィールド: family_name, given_name, birthdate, age_equal_or_over

============================================================
=== Step 3: Merchant が AReq を構築 ===
============================================================
VP Token payload サイズ: 1671 chars（制限: 50,000）→ 3.3% 使用 ✓

============================================================
=== Step 4: ACS が VP Token を検証 ===
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

✓ VP Token検証: 成功
```

## 技術スタック

| コンポーネント | ライブラリ |
|--------------|-----------|
| SD-JWT-VC 発行 | `@sd-jwt/core` 0.19.0 |
| 鍵生成・署名 | `@sd-jwt/crypto-nodejs`（ES256） |
| VP Token（dc+sd-jwt）生成 | `@sd-jwt/core` `SDJwtInstance.present()` |
| Key Binding JWT | `@sd-jwt/core` KB-JWT サポート |
| ランタイム | Node.js 20+、TypeScript、pnpm workspaces |

## リポジトリ構成

```
packages/
├── shared/   # 共有型定義（AReq/ARes、VP Token、VCペイロード）
├── issuer/   # Mock Issuer — SD-JWT-VC を選択的開示付きで発行
├── wallet/   # Mock Wallet — VP Token を生成（住所のみ開示）
├── acs/      # Mock ACS   — VP Token を検証し ARes を返す
└── demo/     # E2E デモ  — 4ステップを1スクリプトで実行
```

## 証明できたこと

| # | 主張 | 結果 |
|---|------|------|
| 1 | SD-JWT-VC の属性を VP Token として `threeDSReqAuthData` に格納できる | ✅ 1,671 chars（50,000 制限の 3.3%） |
| 2 | ACS 側が VP Token の VC 署名を検証できる | ✅ イシュア公開鍵による ES256 検証 |
| 3 | Selective Disclosure により必要最小限の属性のみ送信できる | ✅ `address` のみ開示、氏名・生年月日は非開示 |

## `threeDSReqAuthData` への VP Token 格納フォーマット

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

`threeDSReqAuthMethod` は EMV 3DS v2.3.1.1 で定義される `"10"`（Electronic ID / デジタル ID ウォレット）を使用します。

## EMVCo オープン課題との対応

EMVCo ホワイトペーパー Chapter 5（Open Items）への対応:

| オープン課題 | 本 PoC のアプローチ |
|-------------|-------------------|
| カード会員属性の真正性検証 | イシュアが発行した VC、ACS が自身のクレデンシャルを検証 |
| 最小限の情報開示 | SD-JWT Selective Disclosure（郵便番号/住所のみ） |
| リプレイ攻撃防止 | Key Binding JWT の `nonce` = `threeDSServerTransID` |
| トラストアンカー | 自己発行モデル（Issuer = ACS）、外部 Trust Registry 不要 |

## 既知の制限・今後の課題

- **DS 中継**: 本 PoC は Directory Server をスキップ。実運用では DS を経由した VP Token 転送プロトコルが必要。
- **Trust Registry**: 自己発行モデルは Issuer = ACS の場合のみ機能。他行発行クレデンシャルへの対応には Trust Registry（EBSI、X.509 PKI 拡張等）が必要。
- **iframe / UAL**: ブラウザ文脈でのウォレット操作には UX レイヤー（OID4VP リダイレクト、ブラウザウォレット API 等）が必要。
- **クレデンシャル形式**: `dc+sd-jwt` のみ実装。`iso-mdoc`（mDL）は対象外。
- **AReq 全フィールド**: VP Token 関連フィールドのみモデル化。EMVCo 仕様の全フィールドは対象外。

## ライセンス

MIT
