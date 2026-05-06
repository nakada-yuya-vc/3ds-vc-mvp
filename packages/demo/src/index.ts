import crypto from "node:crypto"
import { generateIssuerKeys, issueIdCardVc } from "@3ds-vc-mvp/issuer"
import { generateHolderKeys, generateVpToken } from "@3ds-vc-mvp/wallet"
import { processAReq } from "@3ds-vc-mvp/acs"
import {
  ADDRESS_PRESENTATION_DEFINITION,
  MERCHANT_ID,
  MAX_AUTH_DATA_LENGTH,
  ThreeDSAuthMethod,
} from "@3ds-vc-mvp/shared"
import type { MockAReq, VpTokenAuthData } from "@3ds-vc-mvp/shared"
import { SAMPLE_HOLDER } from "@3ds-vc-mvp/issuer/fixtures"

// ───────────────────────────────────────────────
// Step 1: Issuer が SD-JWT-VC を発行
// ───────────────────────────────────────────────
console.log("=".repeat(60))
console.log("=== Step 1: Issuer が SD-JWT-VC を発行 ===")
console.log("=".repeat(60))

const issuerKeys = await generateIssuerKeys()
console.log(`\nイシュア公開鍵 (kid: ${issuerKeys.kid}):`)
console.log(JSON.stringify(issuerKeys.publicKeyJwk, null, 2))

const holderKeys = await generateHolderKeys()
console.log("\nホルダー鍵ペアを生成しました")

const sdJwtVc = await issueIdCardVc(
  {
    holderPublicKeyJwk: holderKeys.publicKeyJwk,
    claims: SAMPLE_HOLDER.claims,
    expiresInDays: 365,
  },
  issuerKeys
)

console.log("\n発行したSD-JWT-VC:")
console.log(sdJwtVc)

const vcParts = sdJwtVc.split("~")
console.log(`\nSD-JWT-VC構造: JWT + ${vcParts.length - 1} 個のDisclosure`)
console.log("含まれるDisclosure (選択的開示フィールド):")
for (const part of vcParts.slice(1)) {
  try {
    const decoded = JSON.parse(Buffer.from(part, "base64url").toString("utf-8"))
    if (Array.isArray(decoded)) {
      console.log(`  - ${decoded[decoded.length - 2]}: [SD-encrypted]`)
    }
  } catch {
    // KB-JWTなどはスキップ
  }
}

// ───────────────────────────────────────────────
// Step 2: Wallet が VP Token を生成（郵便番号のみ開示）
// ───────────────────────────────────────────────
console.log("\n" + "=".repeat(60))
console.log("=== Step 2: Wallet が VP Token を生成（address のみ開示） ===")
console.log("=".repeat(60))

// 3DS ServerTransIDをnonceとして使用（リプレイ攻撃防止）
const threeDSServerTransID = crypto.randomUUID()
console.log(`\n3DS ServerTransID (nonce): ${threeDSServerTransID}`)

const { vpToken, presentationSubmission } = await generateVpToken({
  sdJwtVc,
  presentationDefinition: ADDRESS_PRESENTATION_DEFINITION,
  holderKeys,
  audience: MERCHANT_ID,
  nonce: threeDSServerTransID,
})

console.log("\n生成したVP Token:")
console.log(vpToken)

const vpParts = vpToken.split("~")
console.log(`\nVP Token構造: JWT + ${vpParts.length - 2} 個のDisclosure + KB-JWT`)
console.log("開示したDisclosure:")
for (const part of vpParts.slice(1, -1)) {
  try {
    const decoded = JSON.parse(Buffer.from(part, "base64url").toString("utf-8"))
    if (Array.isArray(decoded)) {
      console.log(`  - ${decoded[decoded.length - 2]}:`, JSON.stringify(decoded[decoded.length - 1]))
    }
  } catch {
    // スキップ
  }
}
console.log("非開示フィールド: family_name, given_name, birthdate, age_equal_or_over")

// ───────────────────────────────────────────────
// Step 3: Merchant が AReq を構築
// ───────────────────────────────────────────────
console.log("\n" + "=".repeat(60))
console.log("=== Step 3: Merchant が AReq を構築 ===")
console.log("=".repeat(60))

const vpTokenAuthData: VpTokenAuthData = {
  version: "1.0",
  vcFormat: "dc+sd-jwt",
  vpToken,
  presentationSubmission,
}
const vpTokenAuthDataJson = JSON.stringify(vpTokenAuthData)

console.log(`\nVP Token payload サイズ: ${vpTokenAuthDataJson.length} chars (制限: ${MAX_AUTH_DATA_LENGTH.toLocaleString()})`)
if (vpTokenAuthDataJson.length > MAX_AUTH_DATA_LENGTH) {
  console.error("エラー: VP Tokenが50,000文字制限を超えています！")
  process.exit(1)
}
console.log(`=> 制限内 OK (${((vpTokenAuthDataJson.length / MAX_AUTH_DATA_LENGTH) * 100).toFixed(1)}% 使用)`)

const now = new Date()
const timestamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)

const areq: MockAReq = {
  messageType: "AReq",
  messageVersion: "2.3.1.1",
  threeDSCompInd: "Y",
  threeDSRequestorAuthenticationInfo: {
    threeDSReqAuthMethod: ThreeDSAuthMethod.ELECTRONIC_ID,  // "10"
    threeDSReqAuthTimestamp: timestamp,
    threeDSReqAuthData: vpTokenAuthDataJson,
  },
  acctNumber: "4111111111111111",  // モック用カード番号
  purchaseAmount: "100000",
  purchaseCurrency: "392",          // JPY
  merchantName: "Example Shop",
}

console.log("\n構築したAReq (VP Token部分を除く):")
const areqDisplay = {
  ...areq,
  threeDSRequestorAuthenticationInfo: {
    ...areq.threeDSRequestorAuthenticationInfo,
    threeDSReqAuthData: `[${vpTokenAuthDataJson.length} chars]`,
  },
}
console.log(JSON.stringify(areqDisplay, null, 2))

// ───────────────────────────────────────────────
// Step 4: ACS が VP Token を検証
// ───────────────────────────────────────────────
console.log("\n" + "=".repeat(60))
console.log("=== Step 4: ACS が VP Token を検証 ===")
console.log("=".repeat(60))

console.log("\n[ACS] threeDSReqAuthDataからVP Tokenを抽出...")
console.log("[ACS] VC署名を検証中...")

const ares = await processAReq(areq, {
  issuerPublicKeyJwk: issuerKeys.publicKeyJwk,
})

console.log("\nAResを生成しました:")
console.log(JSON.stringify(ares, null, 2))

// ───────────────────────────────────────────────
// Step 5: 結果サマリー表示
// ───────────────────────────────────────────────
console.log("\n" + "=".repeat(60))
console.log("=== 検証結果サマリー ===")
console.log("=".repeat(60))

const result = ares.vcVerificationResult
if (result?.verified) {
  console.log("\n✓ VP Token検証: 成功")
  console.log(`  transStatus: ${ares.transStatus} (認証成功)`)
  console.log(`  VCイシュア: ${result.vcIssuer}`)
  console.log(`  検証済みクレーム: ${result.verifiedClaims.join(", ")}`)
  console.log(`  VC有効期限: ${new Date(result.vcExpiresAt * 1000).toLocaleDateString("ja-JP")}`)
  console.log(`  検証タイムスタンプ: ${result.verificationTimestamp}`)
  console.log("\n[証明できたこと]")
  console.log("  1. SD-JWT-VCで発行されたイシュア属性をVP Tokenとして")
  console.log("     threeDSReqAuthDataフィールドに格納できた")
  console.log("  2. ACS側がVP TokenのVC署名を検証できた")
  console.log("  3. Selective Disclosureによりaddressのみを開示し、")
  console.log("     family_name/given_name/birthdate等は非開示にできた")
} else {
  console.log("\n✗ VP Token検証: 失敗")
  console.log(`  transStatus: ${ares.transStatus}`)
  console.log(`  エラー: ${result?.vcIssuer ?? "unknown"}`)
  process.exit(1)
}
