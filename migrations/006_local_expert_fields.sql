-- Add Local Expert knowledge-capture fields to local_expert_forms
ALTER TABLE local_expert_forms
  ADD COLUMN IF NOT EXISTS neighborhoods jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS locality_proof varchar(30),
  ADD COLUMN IF NOT EXISTS knowledge_proof_answers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS local_specialties jsonb DEFAULT '[]'::jsonb;
