import { ES256 } from "@sd-jwt/crypto-nodejs"

export interface HolderKeys {
  privateKeyJwk: JsonWebKey
  publicKeyJwk: JsonWebKey
}

// ウォレット（ホルダー）のES256鍵ペアを生成
export async function generateHolderKeys(): Promise<HolderKeys> {
  const { privateKey, publicKey } = await ES256.generateKeyPair()
  return {
    privateKeyJwk: privateKey,
    publicKeyJwk: publicKey,
  }
}
