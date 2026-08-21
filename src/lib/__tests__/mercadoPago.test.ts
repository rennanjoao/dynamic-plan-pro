import { describe, it, expect } from "vitest";
import {
  addMonths,
  amountsMatch,
  buildSignatureManifest,
  hmacSha256Hex,
  mapPaymentMethod,
  mapPaymentStatus,
  parseXSignature,
  toCentsFromAmount,
  verifyWebhookSignature,
} from "../../../supabase/functions/_shared/mercadopago";

const SECRET = "webhook-secret-de-teste";

describe("assinatura do webhook Mercado Pago", () => {
  it("lê ts e v1 do header x-signature", () => {
    expect(parseXSignature("ts=123, v1=abc")).toEqual({ ts: "123", v1: "abc" });
    expect(parseXSignature(null)).toEqual({ ts: null, v1: null });
  });

  it("monta o manifest oficial", () => {
    expect(buildSignatureManifest({ dataId: "ABC", requestId: "req-1", ts: "123" }))
      .toBe("id:abc;request-id:req-1;ts:123;");
  });

  it("aceita assinatura válida", async () => {
    const ts = "1700000000";
    const v1 = await hmacSha256Hex(SECRET, buildSignatureManifest({ dataId: "42", requestId: "r1", ts }));
    await expect(
      verifyWebhookSignature({ signatureHeader: `ts=${ts},v1=${v1}`, requestId: "r1", dataId: "42", secret: SECRET }),
    ).resolves.toBe(true);
  });

  it("recusa assinatura inválida, ausente ou sem secret", async () => {
    await expect(
      verifyWebhookSignature({ signatureHeader: "ts=1,v1=deadbeef", requestId: "r1", dataId: "42", secret: SECRET }),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature({ signatureHeader: null, requestId: "r1", dataId: "42", secret: SECRET }),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature({ signatureHeader: "ts=1,v1=x", requestId: "r1", dataId: "42", secret: "" }),
    ).resolves.toBe(false);
  });
});

describe("validação de valor e status", () => {
  it("converte reais para centavos", () => {
    expect(toCentsFromAmount(350)).toBe(35000);
    expect(toCentsFromAmount("350.5")).toBe(35050);
    expect(toCentsFromAmount(null)).toBeNull();
  });

  it("aceita 1 centavo de tolerância e recusa divergência", () => {
    expect(amountsMatch(35000, 35000)).toBe(true);
    expect(amountsMatch(35001, 35000)).toBe(true);
    expect(amountsMatch(100, 35000)).toBe(false);
    expect(amountsMatch(null, 35000)).toBe(false);
  });

  it("só approved é considerado pago", () => {
    expect(mapPaymentStatus("approved")).toBe("paid");
    expect(mapPaymentStatus("pending")).toBe("pending");
    expect(mapPaymentStatus("in_process")).toBe("pending");
    expect(mapPaymentStatus("rejected")).toBe("failed");
    expect(mapPaymentStatus("cancelled")).toBe("failed");
    expect(mapPaymentStatus(undefined)).toBe("failed");
  });

  it("mapeia método de pagamento", () => {
    expect(mapPaymentMethod("credit_card")).toBe("cartao");
    expect(mapPaymentMethod("bank_transfer")).toBe("pix");
    expect(mapPaymentMethod("ticket")).toBe("boleto");
    expect(mapPaymentMethod(null)).toBe("mercadopago");
  });
});

describe("próximo vencimento", () => {
  it("soma meses preservando fim de mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-15", 3)).toBe("2026-06-15");
  });
});
