import express from "express"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { processAReq } from "./acs.js"
import type { MockAReq } from "@3ds-vc-mvp/shared"

export { processAReq } from "./acs.js"
export { verifyVpToken } from "./verifier.js"
export type { VerifyVpTokenOptions, VpVerificationResult } from "./verifier.js"
export type { ProcessAReqOptions } from "./acs.js"

// CLIとして実行された場合のエントリポイント（Expressサーバー）
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  const __dirname = fileURLToPath(new URL(".", import.meta.url))

  // issuerの公開鍵を読み込む（ACS = イシュアの循環信頼モデル）
  const issuerPublicKeyPath = join(
    __dirname,
    "../../issuer/dist/issuer-public-key.json"
  )
  let issuerPublicKeyJwk: JsonWebKey
  try {
    issuerPublicKeyJwk = JSON.parse(
      readFileSync(issuerPublicKeyPath, "utf-8")
    ) as JsonWebKey
    console.log("イシュア公開鍵を読み込みました:", issuerPublicKeyPath)
  } catch {
    console.error(
      "エラー: issuerを先に実行してください (pnpm --filter issuer dev)"
    )
    process.exit(1)
  }

  const app = express()
  app.use(express.json({ limit: "200kb" }))

  // POST /areq: AReqを受け取りAResを返す
  app.post("/areq", async (req, res) => {
    try {
      const areq = req.body as MockAReq
      console.log(`[ACS] AReq受信: merchant=${areq.merchantName}, amount=${areq.purchaseAmount} ${areq.purchaseCurrency}`)

      const ares = await processAReq(areq, { issuerPublicKeyJwk })

      console.log(`[ACS] 検証結果: transStatus=${ares.transStatus}, verified=${ares.vcVerificationResult?.verified}`)

      res.json(ares)
    } catch (err) {
      console.error("[ACS] エラー:", err)
      res.status(500).json({ error: String(err) })
    }
  })

  const PORT = 3001
  app.listen(PORT, () => {
    console.log(`\n=== Mock ACS 起動 (http://localhost:${PORT}) ===`)
    console.log(`POST http://localhost:${PORT}/areq にAReqを送信してください`)
  })
}
