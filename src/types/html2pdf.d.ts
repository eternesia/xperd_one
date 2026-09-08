declare module "html2pdf.js" {
  interface Html2PdfWorker {
    set(opt: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement | string): Html2PdfWorker;
    save(): Promise<void>;
    then(cb: () => void): Promise<void>;
  }
  export default function html2pdf(): Html2PdfWorker;
}
