/**
 * First paint of a desktop library screen (≥ 768) before the client knows the layout: the title
 * and five skeleton rows, so wide screens never flash the phone UI. Hidden on phones.
 */
export function DeskPlaceholder({ title }: { title: string }) {
  return (
    <main data-wide="" aria-busy="true" className="hidden flex-1 flex-col px-6 pt-5 md:flex">
      <h1 className="m-0 h-9 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">{title}</h1>
      <div aria-hidden="true" className="mt-[100px] flex flex-col border-t border-ink">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-6 border-b border-rule pl-10">
            <span className="h-3 w-32 rounded-[2px] bg-hover" />
            <span className="h-2.5 w-20 rounded-[2px] bg-hover" />
          </div>
        ))}
      </div>
    </main>
  );
}
