/**
 * Aplica o tema salvo ANTES da primeira pintura.
 *
 * Sem isto, quem escolheu o tema escuro vê um flash branco a cada
 * navegação. O script é minúsculo e roda de forma síncrona no <head>.
 * O padrão é o tema escuro (Design System da Canali Co.) — só entra no
 * claro por escolha explícita. O <html> já nasce com a classe "dark".
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    if (localStorage.getItem('canali-theme') === 'light') {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`.trim()

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />
}
