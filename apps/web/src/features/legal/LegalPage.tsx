import { Link } from '@tanstack/react-router';
import { IconScreen } from '../room/components/Icons';
import { DOCUMENT_VERSION, REVIEW_DATE, type LegalDocument } from './documents';
import styles from './LegalPage.module.css';

export function LegalPage({ document, kind }: { document: LegalDocument; kind: 'terms' | 'privacy' }) {
  return <div className={styles.page}>
    <a className={styles.skip} href="#documento">Ir para o documento</a>
    <header className={styles.header}>
      <Link to="/" className={styles.brand}><IconScreen size={22} />Janjalive</Link>
      <Link to="/">Voltar ao início</Link>
    </header>
    <main id="documento" className={styles.main} tabIndex={-1}>
      <h1>{document.title}</h1>
      <p className={styles.description}>{document.description}</p>
      <p className={styles.version}>Versão {DOCUMENT_VERSION} · Revisão em <time dateTime={REVIEW_DATE}>22 de outubro de 2026</time></p>
      <aside className={styles.notice} aria-label="Situação do documento">
        <strong>Minuta para revisão — sem vigência definida</strong>
        <p>Identificação do responsável, contatos e informações operacionais ainda precisam de confirmação. Este texto depende de revisão jurídica antes da publicação definitiva. A data acima não é uma data de publicação.</p>
      </aside>
      <nav className={styles.contents} aria-label="Seções do documento">
        <h2>Nesta página</h2>
        <ul>{document.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul>
      </nav>
      <article aria-label={document.title}>
        {document.sections.map(section => <section key={section.id} id={section.id} className={styles.section}>
          <h2>{section.title}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>)}
      </article>
      {kind === 'privacy' && <p className={styles.source}>Referência legal: <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm">Lei Geral de Proteção de Dados Pessoais (LGPD)</a>.</p>}
    </main>
    <footer className={styles.footer}>
      <nav aria-label="Documentos e navegação">
        <Link to="/">Página inicial</Link>
        <Link to={kind === 'terms' ? '/privacidade' : '/termos'}>{kind === 'terms' ? 'Política de Privacidade' : 'Termos de Uso'}</Link>
        <a href="#documento">Voltar ao topo</a>
      </nav>
    </footer>
  </div>;
}
