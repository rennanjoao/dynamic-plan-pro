/**
 * Gera o payload BR Code PIX (EMV) para pagamento via QR Code.
 * Padrão Bacen/EMVCo: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
 */

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function sanitize(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .trim()
    .slice(0, max);
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixBrCodeInput {
  pixKey: string;          // chave PIX (CPF/CNPJ/e-mail/telefone/aleatória)
  amount?: number;         // valor em BRL (opcional — sem valor = "qualquer valor")
  merchantName: string;    // nome do recebedor (até 25 chars)
  merchantCity: string;    // cidade do recebedor (até 15 chars)
  txId?: string;           // identificador da transação (até 25 chars, default "***")
  description?: string;    // texto livre (até 50 chars)
}

export function buildPixBrCode(input: PixBrCodeInput): string {
  const name = sanitize(input.merchantName || "RECEBEDOR", 25);
  const city = sanitize(input.merchantCity || "BRASIL", 15);
  const txId = sanitize(input.txId || "***", 25) || "***";

  // Merchant Account Information (id 26) — PIX
  const gui = tlv("00", "br.gov.bcb.pix");
  const key = tlv("01", input.pixKey.trim());
  const desc = input.description ? tlv("02", sanitize(input.description, 50)) : "";
  const mai = tlv("26", gui + key + desc);

  let payload =
    tlv("00", "01") +                              // Payload Format Indicator
    mai +
    tlv("52", "0000") +                            // Merchant Category Code
    tlv("53", "986") +                             // Currency BRL
    (input.amount && input.amount > 0
      ? tlv("54", input.amount.toFixed(2))
      : "") +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    tlv("62", tlv("05", txId));

  payload += "6304";
  return payload + crc16(payload);
}