// Public page — no ERP sidebar. Inherits only the root layout (html/body/fonts).
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
