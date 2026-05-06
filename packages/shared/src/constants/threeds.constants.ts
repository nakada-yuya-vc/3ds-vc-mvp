// 3DS関連の定数定義

// イシュアのVCタイプURI（ACS検証時の一致確認に使用）
export const VC_TYPE_URI = "https://issuer.example.jp/id-card/v1"

// イシュアの識別子（ACS = イシュアの循環信頼モデル）
export const ISSUER_DID = "did:example:issuer-bank-jp"

// デモ用Merchant識別子（KB-JWTのaud）
export const MERCHANT_ID = "https://merchant.example.com/3ds"

// threeDSReqAuthDataの最大文字数制限（EMV 3DS仕様）
export const MAX_AUTH_DATA_LENGTH = 50_000

// VP Tokenフォーマット
export const VP_TOKEN_FORMAT = "dc+sd-jwt" as const

// Presentation Definition ID（3DS住所検証用）
export const ADDRESS_PD_ID = "3ds-address-verification-v1"
