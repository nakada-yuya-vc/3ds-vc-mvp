// EMV 3DS v2.3.1.1 の threeDSRequestorAuthenticationInfo
// 本来は3DS仕様で定義される構造体。ここでは本提案の拡張部分を定義する。
export interface ThreeDSRequestorAuthInfo {
  threeDSReqAuthMethod: ThreeDSAuthMethod
  threeDSReqAuthTimestamp: string   // YYYYMMDDHHmmss
  threeDSReqAuthData?: string       // VP Token格納フィールド（本提案のキャリア）
}

// Authentication Method値（EMV 3DS仕様定義）
export enum ThreeDSAuthMethod {
  NO_3RI_PRIOR       = "01",
  OWN_CREDENTIALS    = "02",
  FEDERATED_ID       = "03",
  ISSUER_CREDENTIALS = "04",
  THIRD_PARTY_AUTH   = "05",
  FIDO               = "06",
  ELECTRONIC_ID      = "10",  // EUDI Wallet / デジタルIDウォレット用
}

// threeDSReqAuthData に格納するVP Token拡張ペイロード（本提案の中核）
// このフォーマットがMVPの技術的貢献
export interface VpTokenAuthData {
  version: "1.0"
  vcFormat: "dc+sd-jwt"
  vpToken: string                            // OID4VP VP Token (dc+sd-jwt形式)
  presentationSubmission: PresentationSubmission
}

export interface PresentationSubmission {
  id: string
  definition_id: string
  descriptor_map: DescriptorMap[]
}

export interface DescriptorMap {
  id: string
  format: "dc+sd-jwt"
  path: "$"
}

// モックAReq（本来はEMVCo仕様で定義される全フィールドを持つが、
// MVPではVP Token格納に関係するフィールドのみ定義）
export interface MockAReq {
  messageType: "AReq"
  messageVersion: "2.3.1.1"
  threeDSCompInd: "Y"
  threeDSRequestorAuthenticationInfo: ThreeDSRequestorAuthInfo
  // 本来はここにカード番号(ハッシュ)・加盟店情報・購入情報等が入る
  // MVPでは省略
  acctNumber: string       // モック用カード番号
  purchaseAmount: string   // 購入金額
  purchaseCurrency: string
  merchantName: string
}

// モックARes
export interface MockARes {
  messageType: "ARes"
  messageVersion: "2.3.1.1"
  transStatus: "Y" | "N" | "U" | "C" | "R"
  // 本提案の拡張：VP Token検証結果を追加
  vcVerificationResult?: {
    verified: boolean
    vcIssuer: string
    verifiedClaims: string[]        // 開示・検証済みのクレーム名
    vcExpiresAt: number
    verificationTimestamp: string
  }
}
