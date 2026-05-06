import { SDJwtInstance } from "@sd-jwt/core";
import { ES256, digest, generateSalt } from "@sd-jwt/crypto-nodejs";
import type { PresentationSubmission } from "@3ds-vc-mvp/shared";
import { ISSUER_DID, VC_TYPE_URI, MERCHANT_ID } from "@3ds-vc-mvp/shared";

export interface VerifyVpTokenOptions {
  vpToken: string;
  presentationSubmission: PresentationSubmission;
  issuerPublicKeyJwk: JsonWebKey; // イシュア（= ACS自身）の公開鍵
  expectedAudience: string;
  expectedNonce: string;
}

export interface VpVerificationResult {
  verified: boolean;
  vcIssuer: string;
  verifiedClaims: Record<string, unknown>; // 開示されたクレームのキーバリュー
  vcIssuedAt: number;
  vcExpiresAt: number;
  error?: string;
}

// @sd-jwt/coreのSDJwtInstanceを直接使いVP Tokenを検証する
export async function verifyVpToken(
  options: VerifyVpTokenOptions,
): Promise<VpVerificationResult> {
  const { vpToken, issuerPublicKeyJwk, expectedAudience, expectedNonce } =
    options;

  try {
    const verifier = await ES256.getVerifier(issuerPublicKeyJwk);
    const hasher = (data: string | ArrayBuffer, alg: string): Uint8Array =>
      digest(data, alg);

    // ホルダーの公開鍵をKB-JWT検証に使用（cnfフィールドから取得）
    const kbVerifier = async (
      data: string,
      sig: string,
      payload: Record<string, unknown>,
    ): Promise<boolean> => {
      // cnf.jwkからホルダーの公開鍵を取得
      const cnf = payload.cnf as { jwk: JsonWebKey } | undefined;
      if (!cnf?.jwk) {
        throw new Error("cnf.jwk が見つかりません");
      }
      const holderVerifier = await ES256.getVerifier(cnf.jwk);
      return holderVerifier(data, sig);
    };

    const sdjwt = new SDJwtInstance({
      verifier,
      hasher,
      saltGenerator: generateSalt,
      hashAlg: "sha-256",
      kbVerifier,
    });

    // VP Token検証（署名・KB-JWT・有効期限を検証）
    const result = await sdjwt.verify(vpToken, {
      kb: {
        payload: {
          aud: expectedAudience,
          nonce: expectedNonce,
        },
      },
    });

    const payload = result.payload as Record<string, unknown>;

    // イシュア確認（循環信頼モデル：ACS = イシュア）
    if (payload.iss !== ISSUER_DID) {
      return {
        verified: false,
        vcIssuer: String(payload.iss ?? "unknown"),
        verifiedClaims: {},
        vcIssuedAt: 0,
        vcExpiresAt: 0,
        error: `不正なイシュア: ${payload.iss}（期待値: ${ISSUER_DID}）`,
      };
    }

    // VCタイプ確認
    if (payload.vct !== VC_TYPE_URI) {
      return {
        verified: false,
        vcIssuer: ISSUER_DID,
        verifiedClaims: {},
        vcIssuedAt: 0,
        vcExpiresAt: 0,
        error: `不正なVCタイプ: ${payload.vct}`,
      };
    }

    // 有効期限確認
    const now = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp ?? 0);
    if (exp < now) {
      return {
        verified: false,
        vcIssuer: ISSUER_DID,
        verifiedClaims: {},
        vcIssuedAt: Number(payload.iat ?? 0),
        vcExpiresAt: exp,
        error: "VCの有効期限が切れています",
      };
    }

    // 開示されたクレームを抽出（常時開示フィールドを除く）
    const reservedKeys = new Set([
      "vct",
      "iss",
      "iat",
      "exp",
      "sub",
      "cnf",
      "_sd",
      "_sd_alg",
    ]);
    const verifiedClaims: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!reservedKeys.has(key)) {
        verifiedClaims[key] = value;
      }
    }

    return {
      verified: true,
      vcIssuer: ISSUER_DID,
      verifiedClaims,
      vcIssuedAt: Number(payload.iat ?? 0),
      vcExpiresAt: exp,
    };
  } catch (err) {
    return {
      verified: false,
      vcIssuer: "unknown",
      verifiedClaims: {},
      vcIssuedAt: 0,
      vcExpiresAt: 0,
      error: String(err instanceof Error ? err.message : err),
    };
  }
}
