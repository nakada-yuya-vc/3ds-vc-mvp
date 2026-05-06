import type { MockAReq, MockARes, VpTokenAuthData } from "@3ds-vc-mvp/shared"
import { ThreeDSAuthMethod, MERCHANT_ID } from "@3ds-vc-mvp/shared"
import { verifyVpToken } from "./verifier.js"

export interface ProcessAReqOptions {
  issuerPublicKeyJwk: JsonWebKey  // ACS（= イシュア）の公開鍵
}

// AReqを受け取り処理するコアロジック
export async function processAReq(
  areq: MockAReq,
  options: ProcessAReqOptions
): Promise<MockARes> {
  const { issuerPublicKeyJwk } = options
  const authInfo = areq.threeDSRequestorAuthenticationInfo

  // 1. threeDSReqAuthMethodが "10" (Electronic ID / デジタルIDウォレット) か確認
  if (authInfo.threeDSReqAuthMethod !== ThreeDSAuthMethod.ELECTRONIC_ID) {
    return {
      messageType: "ARes",
      messageVersion: "2.3.1.1",
      transStatus: "U",
      vcVerificationResult: {
        verified: false,
        vcIssuer: "unknown",
        verifiedClaims: [],
        vcExpiresAt: 0,
        verificationTimestamp: new Date().toISOString(),
      },
    }
  }

  // 2. threeDSReqAuthDataが存在するか確認
  if (!authInfo.threeDSReqAuthData) {
    return {
      messageType: "ARes",
      messageVersion: "2.3.1.1",
      transStatus: "U",
      vcVerificationResult: {
        verified: false,
        vcIssuer: "unknown",
        verifiedClaims: [],
        vcExpiresAt: 0,
        verificationTimestamp: new Date().toISOString(),
      },
    }
  }

  // 3. threeDSReqAuthDataをJSONパース → VpTokenAuthData
  let vpTokenAuthData: VpTokenAuthData
  try {
    vpTokenAuthData = JSON.parse(authInfo.threeDSReqAuthData) as VpTokenAuthData
  } catch {
    return {
      messageType: "ARes",
      messageVersion: "2.3.1.1",
      transStatus: "U",
      vcVerificationResult: {
        verified: false,
        vcIssuer: "unknown",
        verifiedClaims: [],
        vcExpiresAt: 0,
        verificationTimestamp: new Date().toISOString(),
      },
    }
  }

  // KB-JWTのnonceとして使用するトランザクションIDを取得
  // デモでは固定値だが、実際は3DS AReqのthreeDSServerTransIDを使う
  // nonceはwallet側で生成したものをVP Tokenに含めており、
  // ACSはPresentation Submissionのmetadataや別チャネルでnonceを受け取る
  // MVPではVP Tokenを解析してKB-JWTからnonceを取得する簡易実装
  let expectedNonce = ""
  try {
    const parts = vpTokenAuthData.vpToken.split("~")
    const kbJwt = parts[parts.length - 1]
    if (kbJwt) {
      const kbPayloadB64 = kbJwt.split(".")[1]
      const kbPayload = JSON.parse(
        Buffer.from(kbPayloadB64, "base64url").toString("utf-8")
      ) as { nonce?: string }
      expectedNonce = kbPayload.nonce ?? ""
    }
  } catch {
    // nonce取得失敗は後続処理でエラーになる
  }

  // 4. verifyVpToken()でVC署名検証
  const verificationResult = await verifyVpToken({
    vpToken: vpTokenAuthData.vpToken,
    presentationSubmission: vpTokenAuthData.presentationSubmission,
    issuerPublicKeyJwk,
    expectedAudience: MERCHANT_ID,
    expectedNonce,
  })

  const verificationTimestamp = new Date().toISOString()

  // 5. 検証成功時: transStatus "Y" + vcVerificationResultを返す
  if (verificationResult.verified) {
    return {
      messageType: "ARes",
      messageVersion: "2.3.1.1",
      transStatus: "Y",
      vcVerificationResult: {
        verified: true,
        vcIssuer: verificationResult.vcIssuer,
        verifiedClaims: Object.keys(verificationResult.verifiedClaims),
        vcExpiresAt: verificationResult.vcExpiresAt,
        verificationTimestamp,
      },
    }
  }

  // 6. 検証失敗時: transStatus "U" + エラー詳細を返す
  return {
    messageType: "ARes",
    messageVersion: "2.3.1.1",
    transStatus: "U",
    vcVerificationResult: {
      verified: false,
      vcIssuer: verificationResult.vcIssuer,
      verifiedClaims: [],
      vcExpiresAt: verificationResult.vcExpiresAt,
      verificationTimestamp,
    },
  }
}
