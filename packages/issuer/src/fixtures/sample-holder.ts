import type { IdCardVcPayload } from "@3ds-vc-mvp/shared"

// デモ用モックホルダー（カード会員）データ
export const SAMPLE_HOLDER = {
  did: "did:example:holder-alice-12345",
  claims: {
    family_name: "山田",
    given_name: "太郎",
    birthdate: "1990-04-15",
    address: {
      postal_code: "100-0001",
      locality: "千代田区",
      region: "東京都",
      country: "JP",
    },
    age_equal_or_over: { "18": true },
  } satisfies Partial<IdCardVcPayload>,
}
