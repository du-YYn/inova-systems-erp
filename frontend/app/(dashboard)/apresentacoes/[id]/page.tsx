import { EditorPage } from '@/components/presentations/editor/EditorPage';

export default function Page({ params }: { params: { id: string } }) {
  return <EditorPage presentationId={params.id} />;
}
