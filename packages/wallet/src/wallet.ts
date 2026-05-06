import { SDJwtInstance } from "@sd-jwt/core"
import { ES256, digest, generateSalt } from "@sd-jwt/crypto-nodejs"
import type {
  PresentationDefinition,
  PresentationSubmission,
} from "@3ds-vc-mvp/shared"
import { VP_TOKEN_FORMAT } from "@3ds-vc-mvp/shared"
import type { HolderKeys } from "./keys.js"
import crypto from "node:crypto"

export interface GenerateVpTokenOptions {
  sdJwtVc: string                            // issuerから受け取ったSD-JWT-VC
  presentationDefinition: PresentationDefinition
  holderKeys: HolderKeys
  audience: string                           // MerchantのID（KB-JWTのaud）
  nonce: string                              // 3DS AReqのthreeDSServerTransID等
}

export interface VpTokenResult {
  vpToken: string                            // dc+sd-jwt形式VP Token
  presentationSubmission: PresentationSubmission
}

// Presentation Definitionを解析して開示するフィールドのPresentationFrameを構築する
function buildPresentationFrame(
  pd: PresentationDefinition
): Record<string, unknown> {
  const frame: Record<string, unknown> = {}

  for (const descriptor of pd.input_descriptors) {
    for (const field of descriptor.constraints.fields) {
      // JSONPathを解析してフレームに変換
      // "$.address.postal_code" → { address: { postal_code: true } }
      // "$.vct" のような常時開示フィールドはスキップ（filterがある場合はSDでないことが多い）
      if (field.filter) continue  // filterは選択条件のみ（開示不要）

      const path = field.path[0]
      if (!path.startsWith("$.")) continue

      const parts = path.slice(2).split(".")
      // ネストされたパスをフレームオブジェクトに展開
      let current = frame
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {}
        }
        current = current[parts[i]] as Record<string, unknown>
      }
      current[parts[parts.length - 1]] = true
    }
  }

  return frame
}

// VP Tokenを生成する（Selective Disclosure + Key Binding JWT付き）
export async function generateVpToken(
  options: GenerateVpTokenOptions
): Promise<VpTokenResult> {
  const { sdJwtVc, presentationDefinition, holderKeys, audience, nonce } =
    options

  const kbSigner = await ES256.getSigner(holderKeys.privateKeyJwk)
  const hasher = (data: string | ArrayBuffer, alg: string): Uint8Array =>
    digest(data, alg)

  const sdjwt = new SDJwtInstance({
    hasher,
    saltGenerator: generateSalt,
    hashAlg: "sha-256",
    kbSigner,
    kbSignAlg: ES256.alg,
  })

  const presentationFrame = buildPresentationFrame(presentationDefinition)

  const vpToken = await sdjwt.present(
    sdJwtVc,
    presentationFrame as Record<string, boolean | Record<string, boolean>>,
    {
      kb: {
        payload: {
          iat: Math.floor(Date.now() / 1000),
          aud: audience,
          nonce,
        },
      },
    }
  )

  const presentationSubmission: PresentationSubmission = {
    id: crypto.randomUUID(),
    definition_id: presentationDefinition.id,
    descriptor_map: presentationDefinition.input_descriptors.map((desc) => ({
      id: desc.id,
      format: VP_TOKEN_FORMAT,
      path: "$",
    })),
  }

  return { vpToken, presentationSubmission }
}
