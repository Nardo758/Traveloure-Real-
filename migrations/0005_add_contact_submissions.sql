-- Contact form submissions from landing/contact pages

CREATE TABLE IF NOT EXISTS contact_submissions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  reason VARCHAR(50),
  preferred_contact_method VARCHAR(20),
  source VARCHAR(50) DEFAULT 'contact_page',
  status VARCHAR(20) DEFAULT 'new',
  assigned_admin_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  response_notes TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON contact_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);
