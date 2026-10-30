import { Fragment, type ReactNode } from "react";
import { groupSubmodules, type SubModule } from "@/lib/modules";

/** Renders submodule links in labelled sidebar sections with icons. */
export function SubmoduleNav({
  subs,
  lang,
  renderLink,
}: {
  subs: SubModule[];
  lang: string;
  renderLink: (sub: SubModule, content: ReactNode) => ReactNode;
}) {
  return (
    <>
      {groupSubmodules(subs).map((sec, i) => (
        <Fragment key={sec.group?.[0] ?? `g${i}`}>
          {sec.group && (
            <div className="mt-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {lang === "id" ? sec.group[1] : sec.group[0]}
            </div>
          )}
          {sec.items.map((sub) =>
            renderLink(
              sub,
              <>
                {sub.icon && <sub.icon className="h-4 w-4 shrink-0" />}
                <span className="truncate">{lang === "id" ? sub.id_ : sub.en}</span>
              </>,
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}
