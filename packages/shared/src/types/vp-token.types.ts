// OID4VP Presentation Definition（何のクレームを要求するか）
export interface PresentationDefinition {
  id: string
  input_descriptors: InputDescriptor[]
}

export interface InputDescriptor {
  id: string
  format: { "dc+sd-jwt": { alg: string[] } }
  constraints: {
    limit_disclosure: "required"
    fields: Field[]
  }
}

export interface Field {
  path: string[]
  filter?: { type: string; const?: unknown }
}

// 3DS用Presentation Definition（郵便番号のみ要求）
export const ADDRESS_PRESENTATION_DEFINITION: PresentationDefinition = {
  id: "3ds-address-verification-v1",
  input_descriptors: [
    {
      id: "postal-code",
      format: { "dc+sd-jwt": { alg: ["ES256"] } },
      constraints: {
        limit_disclosure: "required",
        fields: [
          {
            path: ["$.vct"],
            filter: { type: "string", const: "https://issuer.example.jp/id-card/v1" },
          },
          { path: ["$.address.postal_code"] },
        ],
      },
    },
  ],
}
