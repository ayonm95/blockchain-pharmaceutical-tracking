export interface UnitMetadataInput {
  ndc: string;
  batchNumber: string;
  lotNumber: string;
  productName: string;
  manufacturer: string;
  serialNumber: string;
  createdAt: string;
}

export function buildUnitMetadata(input: UnitMetadataInput) {
  return {
    ndc: input.ndc,
    batchNumber: input.batchNumber,
    lotNumber: input.lotNumber,
    productName: input.productName,
    manufacturer: input.manufacturer,
    serialNumber: input.serialNumber,
    createdAt: input.createdAt,
    schema: "pharmatree-unit-v1",
  };
}

export function buildMetadataString(input: UnitMetadataInput) {
  return JSON.stringify(buildUnitMetadata(input));
}

export async function pinMetadataToIpfs(input: UnitMetadataInput) {
  const payload = buildMetadataString(input);
  const encoded = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const hash = `baf${hex.slice(0, 42)}`;

  return {
    cid: hash,
    ipfsUri: `ipfs://${hash}`,
    metadata: payload,
  };
}
