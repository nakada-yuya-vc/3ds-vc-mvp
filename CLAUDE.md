# 3DS × Verifiable Credentials MVP

## プロジェクト概要

EMV 3-D Secureの `threeDSRequestorAuthenticationInfo` フィールドに、W3C Verifiable Presentation（VP Token）を格納することで、イシュア発行済みのIDを3DS認証フローに統合するプロトタイプ実装。

**証明したいこと（この順序で証明する）:**
1. SD-JWT-VCで発行されたイシュア属性がVP Tokenとしてthreeds AReqフィールドに格納できる
2. ACS側がそのVP TokenのVC署名を検証できる
3. Selective Disclosureにより必要最小限の属性（郵便番号のみ、または「18歳以上」Boolean）だけを送信できる

## 技術スタック

- **言語:** TypeScript (Node.js 20+)
- **パッケージマネージャー:** pnpm (workspaces)
- **VC/VPライブラリ:** `@trustknots/vcknots`（OID4VCI + OID4VP実装）
- **SD-JWT:** `@sd-jwt/core`, `@sd-jwt/crypto-nodejs`, `@sd-jwt/decode`（VCKnotsの依存として付属）
- **JWS/JWT:** `jose`
- **HTTPサーバー:** Express.js
- **テスト:** Vitest

## リポジトリ構成

```
3ds-vc-mvp/
├── CLAUDE.md              # このファイル
├── DESIGN.md              # 詳細設計
├── package.json           # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── packages/
    ├── shared/            # 共有型定義（3DS構造体・VCペイロード）
    ├── issuer/            # Mock Issuer（SD-JWT-VC発行）
    ├── wallet/            # Mock Wallet（VP Token生成）
    ├── acs/               # Mock ACS（VP Token検証）
    └── demo/              # E2Eデモスクリプト
```

## 実装順序

**必ずこの順序で実装すること。前のパッケージが完成してからでないと次に進まない。**

1. `packages/shared` — 型定義のみ。ロジックなし
2. `packages/issuer` — SD-JWT-VC発行。単体でテスト可能にする
3. `packages/wallet` — VP Token生成。issuerの出力を入力にとる
4. `packages/acs` — VP Token検証。walletの出力を入力にとる
5. `packages/demo` — 1〜4を繋いでE2Eフローを実行するスクリプト

## 実装上の原則

- 各パッケージは `npm run dev` で単独起動できること
- 各パッケージに `src/index.ts` のエントリポイントを置くこと
- モックデータはすべて `src/fixtures/` 配下に置くこと
- 環境変数は使わない（デモ用のためすべてハードコード可）
- 外部ネットワーク通信なし（すべてローカルで完結）
- コメントは日本語で書いてよい

## 重要な制約

- `threeDSRequestorAuthenticationInfo` フィールドは **最大50,000文字**。VP Tokenがこれを超えないこと
- VP Tokenのフォーマットは `dc+sd-jwt`（Key Binding JWT付き）
- ACSは自分が発行したVCのみを検証する（Trust Registryは不要）
- フォールバック（VC非対応の場合）のロジックは実装不要

## 詳細設計

DESIGN.md を参照すること。
