import { SDJwtInstance } from "@sd-jwt/core"
import { ES256, generateSalt, digest } from "@sd-jwt/crypto-nodejs"
import type { IdCardVcPayload } from "@3ds-vc-mvp/shared"
import { VC_TYPE_URI, ISSUER_DID } from "@3ds-vc-mvp/shared"
import type { IssuerKeys } from "./keys.js"

export interface IssueVcOptions {
  holderPublicKeyJwk: JsonWebKey  // カード会員のウォレット公開鍵
  claims: Partial<IdCardVcPayload>
  expiresInDays?: number          // デフォルト365日
}

// SD-JWT-VC発行のコアロジック
// family_name, given_name, birthdate, address, age_equal_or_over をSDクレームとして設定
export async function issueIdCardVc(
  options: IssueVcOptions,
  issuerKeys: IssuerKeys
): Promise<string> {
  const { holderPublicKeyJwk, claims, expiresInDays = 365 } = options

  const signer = await ES256.getSigner(issuerKeys.privateKeyJwk)
  const hasher = (data: string | ArrayBuffer, alg: string): Uint8Array =>
    digest(data, alg)

  const sdjwt = new SDJwtInstance({
    signer,
    signAlg: ES256.alg,
    hasher,
    saltGenerator: generateSalt,
    hashAlg: "sha-256",
  })

  const now = Math.floor(Date.now() / 1000)
  const exp = now + expiresInDays * 86400

  const payload = {
    // 常に開示フィールド
    vct: VC_TYPE_URI,
    iss: ISSUER_DID,
    iat: now,
    exp,
    sub: "did:example:holder-alice-12345",
    // Key Binding用ホルダー公開鍵
    cnf: { jwk: holderPublicKeyJwk },
    // 選択的開示クレーム
    ...claims,
  }

  // 選択的開示の対象フィールドを指定（_sd でハッシュ化して隠蔽）
  const disclosureFrame = {
    _sd: [
      "family_name",
      "given_name",
      "birthdate",
      "address",
      "age_equal_or_over",
    ] as const,
  }

  const sdJwtCompact = await sdjwt.issue(payload, disclosureFrame as Record<string, unknown>, {
    header: { kid: issuerKeys.kid },
  })

  return sdJwtCompact
}
