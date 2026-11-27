import { Link } from "react-router-dom";
import { LegalLayout, Section } from "@/components/legal/LegalLayout";
import { LEGAL_INFO } from "@/lib/legalInfo";

export default function Termos() {
  const { brand, contactEmail } = LEGAL_INFO;
  return (
    <LegalLayout title="Termos de Uso">
      <Section title="O que é o app">
        <p>
          O {brand} é uma plataforma em que treinadores montam e acompanham protocolos de dieta, treino e suplementação
          dos seus alunos.
        </p>
      </Section>
      <Section title="Responsabilidades">
        <ul className="list-disc space-y-1 pl-5">
          <li>O aluno informa dados verdadeiros e atualizados e guarda a própria senha.</li>
          <li>O treinador é responsável pelas orientações que passa ao aluno.</li>
          <li>O app não substitui consulta médica. Em caso de sintomas ou dúvidas de saúde, procure um médico.</li>
        </ul>
      </Section>
      <Section title="Privacidade">
        <p>
          O uso dos seus dados segue a nossa <Link to="/privacidade" className="text-primary underline">Política de Privacidade</Link>.
        </p>
      </Section>
      <Section title="Contato">
        <p>
          <a className="text-primary underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </Section>
    </LegalLayout>
  );
}
