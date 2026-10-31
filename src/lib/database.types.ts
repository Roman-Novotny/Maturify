// Ručně udržované typy podle supabase/migrations. Při změně schématu aktualizuj i tady
// (nebo přegeneruj: npx supabase gen types typescript --project-id gvnancmcyilrojdmpxje).

type Table<Row, Required extends keyof Row = never, Rel extends unknown[] = []> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: Rel;
};

export type SubjectId = "cj" | "en" | "it" | "ma";

export type Profile = {
  id: string;
  display_name: string | null;
  daily_minutes: number;
  theme: "dark" | "light" | "system";
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Subject = {
  id: SubjectId;
  name: string;
  short: string;
  description: string;
  color: string;
  sort: number;
};

export type Topic = {
  id: string;
  user_id: string;
  subject_id: SubjectId;
  title: string;
  description: string | null;
  difficulty: number;
  sort: number;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: string;
  user_id: string;
  topic_id: string;
  prompt: string;
  kind: "open" | "choice" | "numeric" | "oral";
  difficulty: number;
  source: string | null;
  options: string[] | null;
  correct_option: number | null;
  numeric_answer: number | null;
  tolerance: number;
  created_at: string;
  updated_at: string;
};

export type Answer = {
  id: string;
  user_id: string;
  question_id: string;
  body: string;
  criteria: unknown;
  is_reference: boolean;
  created_at: string;
  updated_at: string;
};

export type Material = {
  id: string;
  user_id: string;
  subject_id: SubjectId | null;
  topic_id: string | null;
  title: string;
  kind: "note" | "pdf" | "image" | "link";
  storage_path: string | null;
  content: string | null;
  status: "uploaded" | "processing" | "ready" | "error";
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

export type MaterialChunk = {
  id: string;
  user_id: string;
  material_id: string;
  idx: number;
  content: string;
  created_at: string;
};

export type Flashcard = {
  id: string;
  user_id: string;
  topic_id: string;
  front: string;
  back: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
  due_at: string;
  last_review_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Attempt = {
  id: string;
  user_id: string;
  topic_id: string | null;
  question_id: string | null;
  flashcard_id: string | null;
  answer: string | null;
  score: number | null;
  completeness: number | null;
  confidence: number | null;
  duration_sec: number | null;
  graded_by: "self" | "auto" | "ai";
  test_run_id: string | null;
  created_at: string;
};

export type TestRun = {
  id: string;
  user_id: string;
  subject_id: SubjectId | null;
  topic_id: string | null;
  mode: "practice" | "timed";
  question_ids: string[];
  time_limit_sec: number | null;
  started_at: string;
  finished_at: string | null;
  score: number | null;
};

export type UserProgress = {
  user_id: string;
  topic_id: string;
  mastery: number;
  stability: number;
  attempts_count: number;
  last_studied_at: string | null;
  next_review_at: string | null;
  updated_at: string;
};

export type ExamDate = {
  id: string;
  user_id: string;
  subject_id: SubjectId | null;
  kind: "written" | "oral" | "other";
  label: string;
  exam_at: string;
  created_at: string;
};

export type StudyPlan = {
  id: string;
  user_id: string;
  plan_date: string;
  minutes_available: number;
  created_at: string;
};

export type StudyTask = {
  id: string;
  user_id: string;
  plan_id: string | null;
  topic_id: string | null;
  subject_id: SubjectId | null;
  title: string;
  kind: "study" | "review" | "test" | "custom";
  minutes: number;
  due_date: string;
  done_at: string | null;
  created_at: string;
};

export type StudySession = {
  id: string;
  user_id: string;
  subject_id: SubjectId | null;
  topic_id: string | null;
  started_at: string;
  minutes: number;
  note: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, "id">;
      subjects: Table<Subject, "id" | "name" | "short" | "description" | "color">;
      topics: Table<Topic, "subject_id" | "title">;
      questions: Table<Question, "topic_id" | "prompt">;
      answers: Table<
        Answer,
        "question_id" | "body",
        [
          {
            foreignKeyName: "answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ]
      >;
      materials: Table<Material, "title">;
      material_chunks: Table<MaterialChunk, "material_id" | "idx" | "content">;
      flashcards: Table<Flashcard, "topic_id" | "front" | "back">;
      attempts: Table<Attempt>;
      user_progress: Table<UserProgress, "topic_id">;
      exam_dates: Table<ExamDate, "kind" | "label" | "exam_at">;
      study_plans: Table<StudyPlan, "plan_date">;
      study_tasks: Table<StudyTask, "title">;
      study_sessions: Table<StudySession>;
      test_runs: Table<TestRun, "question_ids">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
