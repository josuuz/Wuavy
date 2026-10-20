import styles from "@/components/maintenance/Admin.module.css";

/* O carregamento de qualquer página de Cobranças (Clientes, Serviços): nested dentro do layout, só substitui o conteúdo. */
export default function Loading() {
  return (
    <main className={styles.page} data-surface="paper">
      <p className={`type-body ${styles.empty}`} role="status">
        Carregando…
      </p>
    </main>
  );
}
