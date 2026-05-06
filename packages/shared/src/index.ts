// 型定義
export type { IdCardVcPayload } from "./types/vc-payload.types.js"
export type {
  ThreeDSRequestorAuthInfo,
  VpTokenAuthData,
  PresentationSubmission,
  DescriptorMap,
  MockAReq,
  MockARes,
} from "./types/threeds.types.js"
export { ThreeDSAuthMethod } from "./types/threeds.types.js"
export type {
  PresentationDefinition,
  InputDescriptor,
  Field,
} from "./types/vp-token.types.js"
export { ADDRESS_PRESENTATION_DEFINITION } from "./types/vp-token.types.js"

// 定数
export {
  VC_TYPE_URI,
  ISSUER_DID,
  MERCHANT_ID,
  MAX_AUTH_DATA_LENGTH,
  VP_TOKEN_FORMAT,
  ADDRESS_PD_ID,
} from "./constants/threeds.constants.js"
