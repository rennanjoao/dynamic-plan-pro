import { LegalLayout, Section } from "@/components/legal/LegalLayout";
import { LEGAL_INFO } from "@/lib/legalInfo";

export default function Privacidade() {
  const { brand, controllerName, cnpj, contactEmail } = LEGAL_INFO;
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta política explica, de forma simples, quais dados o {brand} usa, para quê e quais são os seus direitos,
        conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
      </p>

      <Section title="Quem cuida dos seus dados">
        <p>
          {controllerName}{cnpj ? `, CNPJ ${cnpj}` : ""}. Dúvidas e pedidos:{" "}
          <a className="text-primary underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </Section>

      <Section title="Quais dados usamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Cadastro: nome, e-mail, WhatsApp, cidade e data de nascimento.</li>
          <li>Dados de saúde e corpo: peso, medidas, rotina, alimentação, treinos, sono, histórico de saúde, exames e respostas da anamnese e dos check-ins.</li>
          <li>Fotos de progresso e de postura que você envia.</li>
          <li>Pagamentos e assinatura, quando houver.</li>
        </ul>
      </Section>

      <Section title="Para que usamos">
        <p>
          Para o seu treinador montar e ajustar o seu protocolo (dieta, treino e suplementação), acompanhar a sua evolução
          e falar com você. Os dados de saúde e as fotos só são usados com a sua autorização, dada na caixa de
          consentimento do cadastro.
        </p>
      </Section>

      <Section title="Com quem compartilhamos">
        <p>
          Com o seu treinador e com fornecedores que fazem a plataforma funcionar (hospedagem, banco de dados, envio de
          e-mail e pagamentos). Usamos fornecedores de tecnologia, inclusive fora do Brasil, para gerar resumos
          automáticos. Não vendemos seus dados.
        </p>
      </Section>

      <Section title="Por quanto tempo guardamos">
        <p>
          Enquanto você usar o app, e depois disso até você ou o seu treinador pedir a exclusão — assim, se você voltar,
          seus resultados anteriores continuam disponíveis. Registros de pagamento são guardados pelo prazo que a lei exige.
        </p>
      </Section>

      <Section title="Seus direitos">
        <p>
          Você pode, a qualquer momento: confirmar se tratamos seus dados, acessar e receber uma cópia, corrigir,
          pedir a exclusão, revogar o consentimento e saber com quem compartilhamos. Basta escrever para{" "}
          <a className="text-primary underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          Se revogar o consentimento, o treinador deixa de poder usar seus dados de saúde e fotos para o protocolo.
        </p>
      </Section>

      <Section title="Menores de 18 anos">
        <p>O cadastro de menores de 18 anos só é feito com a autorização do responsável legal.</p>
      </Section>

      <Section title="Segurança">
        <p>
          Suas fotos ficam em área privada e só abrem por links temporários. O acesso aos dados é restrito a você, ao
          seu treinador e à administração da plataforma.
        </p>
      </Section>
    </LegalLayout>
  );
}
