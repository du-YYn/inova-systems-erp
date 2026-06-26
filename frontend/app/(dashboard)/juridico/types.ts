export interface LegalCaseTask {
  id: number;
  case: number;
  stage: string;
  label: string;
  done: boolean;
  done_at: string | null;
  done_by: number | null;
  done_by_name: string;
  order: number;
  is_custom: boolean;
}
