import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { generateIssuerKeys } from "./keys.js"
import { issueIdCardVc } from "./issuer.js"
import { SAMPLE_HOLDER } from "./fixtures/sample-holder.js"
import { ES256 } from "@sd-jwt/crypto-nodejs"

export { generateIssuerKeys } from "./keys.js"
export { issueIdCardVc } from "./issuer.js"
export type { IssuerKeys } from "./keys.js"
export type { IssueVcOptions } from "./issuer.js"

// CLIとして実行された場合のエントリポイント
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  const run = async () => {
    console.log("=== Mock Issuer 起動 ===\n")

    // イシュア鍵ペア生成
    const issuerKeys = await generateIssuerKeys()
    console.log("イシュア公開鍵 JWK:")
    console.log(JSON.stringify(issuerKeys.publicKeyJwk, null, 2))
    console.log()

    // ホルダー（ウォレット）の鍵ペア生成（デモ用）
    const { publicKey: holderPublicKeyJwk } = await ES256.generateKeyPair()

    // SD-JWT-VC発行
    const sdJwtVc = await issueIdCardVc(
      {
        holderPublicKeyJwk,
        claims: SAMPLE_HOLDER.claims,
        expiresInDays: 365,
      },
      issuerKeys
    )

    console.log("発行したSD-JWT-VC:")
    console.log(sdJwtVc)
    console.log()

    // dist/ディレクトリに保存
    const __dirname = fileURLToPath(new URL(".", import.meta.url))
    const distDir = join(__dirname, "..", "dist")
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, "issued-vc.txt"), sdJwtVc, "utf-8")
    writeFileSync(
      join(distDir, "issuer-public-key.json"),
      JSON.stringify(issuerKeys.publicKeyJwk, null, 2),
      "utf-8"
    )

    console.log("dist/issued-vc.txt に保存しました")
    console.log("dist/issuer-public-key.json に保存しました")
  }

  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
