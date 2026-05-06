// イシュアが発行するSD-JWT-VCのペイロード
export interface IdCardVcPayload {
  // 常に開示（非選択的）
  vct: string         // "https://issuer.example.jp/id-card/v1"
  iss: string         // イシュアのDID or URL
  iat: number         // 発行日時（Unix timestamp）
  exp: number         // 有効期限（Unix timestamp）
  sub: string         // カード会員のDID

  // 選択的開示クレーム（SD-JWT の _sd で隠蔽される）
  family_name?: string
  given_name?: string
  birthdate?: string  // "YYYY-MM-DD"
  address?: {
    postal_code: string  // 例: "100-0001"
    locality: string     // 例: "千代田区"
    region: string       // 例: "東京都"
    country: string      // "JP"
  }
  age_equal_or_over?: {
    "18": boolean
  }
}
