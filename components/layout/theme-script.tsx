/**
 * Aplica o tema salvo ANTES da primeira pintura.
 *
 * Sem isto, quem escolheu o tema escuro vê um flash branco a cada
 * navegação. O script é minúsculo e roda de forma síncrona no <head>.
 * O padrão é o tema claro — só entra no escuro por escolha explícita.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var stored = localStorage.getItem('canali-theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`.trim()

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />
}
