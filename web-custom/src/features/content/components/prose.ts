/**
 * Typography for injected document HTML.
 *
 * The console has no typography plugin and `src/styles/index.css` is shared, so the
 * element styling lives here as arbitrary descendant variants scoped to the one element
 * that holds sanitized markup.
 */
export const documentProseClasses = [
  'text-sm leading-7 text-muted',
  '[&_h1]:mb-4 [&_h1]:mt-9 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-snug [&_h1]:text-foreground first:[&_h1]:mt-0',
  '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-snug [&_h2]:text-foreground first:[&_h2]:mt-0',
  '[&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-foreground first:[&_h3]:mt-0',
  '[&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-sm [&_h4]:font-bold [&_h4]:text-foreground',
  '[&_h5]:mt-5 [&_h5]:text-sm [&_h5]:font-bold [&_h5]:text-foreground',
  '[&_h6]:eyebrow [&_h6]:mt-5',
  '[&_p]:my-4',
  '[&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-strong',
  '[&_strong]:font-bold [&_strong]:text-foreground',
  '[&_em]:italic',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6',
  '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_li]:my-1.5 [&_li]:pl-1',
  '[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-4 [&_blockquote]:italic',
  '[&_code]:mono [&_code]:rounded-[3px] [&_code]:bg-surface-high [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-foreground',
  '[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-[4px] [&_pre]:border [&_pre]:border-border [&_pre]:bg-canvas [&_pre]:p-4',
  '[&_pre_code]:mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:leading-6',
  '[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border',
  '[&_img]:my-5 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-[4px]',
  '[&_video]:my-5 [&_video]:h-auto [&_video]:max-w-full [&_video]:rounded-[4px]',
  '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:bg-surface-high [&_th]:px-3 [&_th]:py-2 [&_th]:font-bold [&_th]:text-foreground',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
].join(' ')
