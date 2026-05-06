import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { generateHolderKeys } from "./keys.js"
import { generateVpToken } from "./wallet.js"
import { ADDRESS_PRESENTATION_DEFINITION, MERCHANT_ID } from "@3ds-vc-mvp/shared"
import crypto from "node:crypto"

export { generateHolderKeys } from "./keys.js"
export { generateVpToken } from "./wallet.js"
export type { HolderKeys } from "./keys.js"
export type { GenerateVpTokenOptions, VpTokenResult } from "./wallet.js"

// CLIとして実行された場合のエントリポイント
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  const run = async () => {
    console.log("=== Mock Wallet 起動 ===\n")

    // issuerパッケージの出力を読み込む
    const __dirname = fileURLToPath(new URL(".", import.meta.url))
    const issuedVcPath = join(__dirname, "../../issuer/dist/issued-vc.txt")
    let sdJwtVc: string
    try {
      sdJwtVc = readFileSync(issuedVcPath, "utf-8").trim()
      console.log("発行済みVCを読み込みました:", issuedVcPath)
    } catch {
      console.error(
        "エラー: issuerを先に実行してください (pnpm --filter issuer dev)"
      )
      process.exit(1)
    }

    // ウォレット鍵ペア生成
    const holderKeys = await generateHolderKeys()
    console.log("\nホルダー公開鍵 JWK:")
    console.log(JSON.stringify(holderKeys.publicKeyJwk, null, 2))

    // デモ用nonce（実際は3DS AReqのthreeDSServerTransIDを使う）
    const nonce = crypto.randomUUID()
    console.log("\nNonce (3DS ServerTransID):", nonce)

    // VP Token生成（郵便番号のみ開示）
    const { vpToken, presentationSubmission } = await generateVpToken({
      sdJwtVc,
      presentationDefinition: ADDRESS_PRESENTATION_DEFINITION,
      holderKeys,
      audience: MERCHANT_ID,
      nonce,
    })

    console.log("\n生成したVP Token:")
    console.log(vpToken)
    console.log("\nPresentation Submission:")
    console.log(JSON.stringify(presentationSubmission, null, 2))

    // 開示したクレームの確認（デバッグ用）
    console.log("\n開示したクレーム（address.postal_codeのみ）")
    const parts = vpToken.split("~")
    const disclosures = parts.slice(1, -1) // KB-JWTを除いたdisclosure部分
    for (const d of disclosures) {
      try {
        const json = JSON.parse(
          Buffer.from(d, "base64url").toString("utf-8")
        )
        console.log(" -", json)
      } catch {
        // デコード失敗はスキップ
      }
    }

    // dist/ディレクトリに保存
    const distDir = join(__dirname, "../dist")
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, "vp-token.txt"), vpToken, "utf-8")
    writeFileSync(
      join(distDir, "presentation-submission.json"),
      JSON.stringify(presentationSubmission, null, 2),
      "utf-8"
    )
    writeFileSync(
      join(distDir, "holder-public-key.json"),
      JSON.stringify(holderKeys.publicKeyJwk, null, 2),
      "utf-8"
    )
    writeFileSync(join(distDir, "nonce.txt"), nonce, "utf-8")

    console.log("\ndist/vp-token.txt に保存しました")
    console.log("dist/presentation-submission.json に保存しました")
  }

  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
