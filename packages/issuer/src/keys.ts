import { ES256 } from "@sd-jwt/crypto-nodejs"

export interface IssuerKeys {
  privateKeyJwk: JsonWebKey
  publicKeyJwk: JsonWebKey  // ACSが検証に使用
  kid: string               // "issuer-key-2026-01"
}

// 起動時にES256鍵ペアを生成。本番ではHSMやKMSを使う。
export async function generateIssuerKeys(): Promise<IssuerKeys> {
  const { privateKey, publicKey } = await ES256.generateKeyPair()
  return {
    privateKeyJwk: privateKey,
    publicKeyJwk: publicKey,
    kid: "issuer-key-2026-01",
  }
}
