-- Patch: create ai_responses table for logging AI runs
CREATE TABLE IF NOT EXISTS ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text NOT NULL CHECK (status IN ('pending','ready','failed')),
  error_code text NULL,
  error_message text NULL,

  -- Inputs
  input_title text NOT NULL,
  input_description text NULL,
  input_timeframe text NOT NULL CHECK (input_timeframe IN ('twoDay','oneWeek','long')),
  input_assignment_details text NOT NULL,
  input_group_size integer NOT NULL,

  -- Output
  output_plan jsonb NULL,

  -- Metadata
  model text NULL,
  prompt_version text NULL,
  latency_ms integer NULL,
  tokens_in integer NULL,
  tokens_out integer NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_responses_project ON ai_responses(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_created_at ON ai_responses(created_at DESC);

-- Enable RLS
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;

-- Policy: project members can select/insert/update rows for projects they belong to
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'ai_responses_members') THEN
    CREATE POLICY ai_responses_members ON ai_responses
      FOR ALL
      USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ai_responses.project_id AND pm.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ai_responses.project_id AND pm.user_id = auth.uid()));
  END IF;
END;
$$;


