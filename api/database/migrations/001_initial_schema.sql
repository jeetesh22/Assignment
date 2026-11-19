CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF to_regclass('public.document_embeddings') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'document_embeddings'
         AND column_name = 'owner_id'
     ) THEN
    IF to_regclass('public.document_embeddings_legacy') IS NOT NULL THEN
      RAISE EXCEPTION 'document_embeddings_legacy already exists';
    END IF;
    ALTER TABLE public.document_embeddings
      RENAME TO document_embeddings_legacy;
    DROP INDEX IF EXISTS public.document_embeddings_hnsw_idx;
  END IF;
END;
$$;

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX roles_global_name_uq
  ON roles (LOWER(name)) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX roles_tenant_name_uq
  ON roles (tenant_id, LOWER(name)) WHERE tenant_id IS NOT NULL;

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_idx
  ON role_permissions (permission_id, role_id);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  external_id VARCHAR(64) UNIQUE,
  email VARCHAR(320),
  name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX users_email_lower_uq
  ON users (LOWER(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX users_tenant_created_idx
  ON users (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX users_role_idx ON users (role_id);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  external_id VARCHAR(64) UNIQUE,
  title VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(8) NOT NULL CHECK (file_type IN ('PDF', 'TXT')),
  file_size BIGINT NOT NULL CHECK (file_size BETWEEN 1 AND 5242880),
  content_hash CHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED'
    CHECK (status IN (
      'UPLOADED', 'PROCESSING', 'EXTRACTING', 'GENERATING_EMBEDDINGS',
      'SUMMARIZING', 'COMPLETED', 'FAILED'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, owner_id)
    REFERENCES users (tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_id, id)
);
CREATE INDEX documents_owner_created_idx
  ON documents (tenant_id, owner_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX documents_tenant_status_idx
  ON documents (tenant_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX documents_owner_hash_uq
  ON documents (tenant_id, owner_id, content_hash)
  WHERE content_hash IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  document_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL CHECK (LENGTH(BTRIM(content)) > 0),
  start_char INTEGER NOT NULL CHECK (start_char >= 0),
  end_char INTEGER NOT NULL CHECK (end_char > start_char),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, id) ON DELETE CASCADE,
  UNIQUE (document_id, chunk_index),
  UNIQUE (tenant_id, document_id, id)
);
CREATE INDEX document_chunks_document_idx
  ON document_chunks (tenant_id, document_id, chunk_index)
  WHERE deleted_at IS NULL;

CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  document_id UUID NOT NULL,
  chunk_id UUID NOT NULL UNIQUE,
  embedding VECTOR(1536) NOT NULL,
  embedding_model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, document_id, chunk_id)
    REFERENCES document_chunks (tenant_id, document_id, id) ON DELETE CASCADE
);
CREATE INDEX document_embeddings_document_idx
  ON document_embeddings (tenant_id, document_id)
  WHERE deleted_at IS NULL;
CREATE INDEX document_embeddings_hnsw_idx
  ON document_embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE deleted_at IS NULL;

CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  document_id UUID NOT NULL,
  summary_type VARCHAR(32) NOT NULL
    CHECK (summary_type IN (
      'SHORT', 'DETAILED', 'BULLET_POINTS', 'EXECUTIVE',
      'KEY_INSIGHTS', 'KEYWORDS'
    )),
  content TEXT,
  generation_status VARCHAR(16) NOT NULL DEFAULT 'QUEUED'
    CHECK (generation_status IN ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED')),
  generation_error VARCHAR(500) NOT NULL DEFAULT '',
  generation_model VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, id) ON DELETE CASCADE,
  UNIQUE (document_id, summary_type)
);
CREATE INDEX summaries_document_type_created_idx
  ON summaries (tenant_id, document_id, summary_type, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  document_id UUID,
  title VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, owner_id)
    REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, owner_id, document_id)
    REFERENCES documents (tenant_id, owner_id, id) ON DELETE RESTRICT
);
CREATE INDEX conversations_owner_updated_idx
  ON conversations (tenant_id, owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('SYSTEM', 'USER', 'ASSISTANT')),
  content TEXT NOT NULL CHECK (LENGTH(BTRIM(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX messages_conversation_created_idx
  ON messages (tenant_id, conversation_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  actor_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES users (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX audit_logs_tenant_created_idx
  ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX audit_logs_actor_created_idx
  ON audit_logs (tenant_id, actor_id, created_at DESC);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX refresh_tokens_user_expiry_idx
  ON refresh_tokens (tenant_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO roles (name, description, is_system)
VALUES
  ('USER', 'Standard user role', TRUE),
  ('ADMIN', 'Platform administrator role', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO permissions (code, description)
VALUES
  ('documents:read', 'Read owned documents'),
  ('documents:write', 'Upload and update owned documents'),
  ('documents:delete', 'Delete owned documents'),
  ('documents:read:any', 'Read documents across tenants'),
  ('documents:delete:any', 'Delete documents across tenants'),
  ('users:read:any', 'Read users across tenants'),
  ('admin:stats:read', 'Read system statistics'),
  ('audit:read:any', 'Read audit logs across tenants')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.tenant_id IS NULL
  AND (
    (role.name = 'USER' AND permission.code IN (
      'documents:read', 'documents:write', 'documents:delete'
    ))
    OR (role.name = 'ADMIN' AND permission.code IN (
      'documents:read', 'documents:write', 'documents:delete',
      'documents:read:any', 'documents:delete:any', 'users:read:any',
      'admin:stats:read', 'audit:read:any'
    ))
  )
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.document_embeddings_legacy') IS NOT NULL THEN
    INSERT INTO tenants (id, name)
    SELECT DISTINCT MD5('tenant:' || owner_id)::UUID, 'Imported workspace'
    FROM document_embeddings_legacy
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO users (id, tenant_id, role_id, external_id, name)
    SELECT DISTINCT
      MD5('user:' || legacy.owner_id)::UUID,
      MD5('tenant:' || legacy.owner_id)::UUID,
      role.id,
      legacy.owner_id,
      'Imported user'
    FROM document_embeddings_legacy AS legacy
    CROSS JOIN roles AS role
    WHERE role.tenant_id IS NULL AND role.name = 'USER'
    ON CONFLICT (external_id) DO NOTHING;

    INSERT INTO documents
      (id, tenant_id, owner_id, external_id, title, original_name,
       file_type, file_size, status, created_at)
    SELECT DISTINCT
      MD5('document:' || legacy.document_id)::UUID,
      MD5('tenant:' || legacy.owner_id)::UUID,
      MD5('user:' || legacy.owner_id)::UUID,
      legacy.document_id,
      'Imported document',
      'imported.txt',
      'TXT',
      1,
      'COMPLETED',
      MIN(legacy.created_at)
    FROM document_embeddings_legacy AS legacy
    GROUP BY legacy.document_id, legacy.owner_id
    ON CONFLICT (external_id) DO NOTHING;

    INSERT INTO document_chunks
      (id, tenant_id, document_id, chunk_index, content,
       start_char, end_char, created_at)
    SELECT
      MD5('chunk:' || legacy.id::TEXT)::UUID,
      MD5('tenant:' || legacy.owner_id)::UUID,
      MD5('document:' || legacy.document_id)::UUID,
      legacy.chunk_index,
      legacy.content,
      legacy.start_char,
      legacy.end_char,
      legacy.created_at
    FROM document_embeddings_legacy AS legacy;

    INSERT INTO document_embeddings
      (id, tenant_id, document_id, chunk_id, embedding,
       embedding_model, created_at)
    SELECT
      legacy.id,
      MD5('tenant:' || legacy.owner_id)::UUID,
      MD5('document:' || legacy.document_id)::UUID,
      MD5('chunk:' || legacy.id::TEXT)::UUID,
      legacy.embedding,
      legacy.embedding_model,
      legacy.created_at
    FROM document_embeddings_legacy AS legacy;

    DROP TABLE document_embeddings_legacy;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION app.current_external_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.external_id', TRUE), '')
$$;

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(current_setting('app.is_admin', TRUE) = 'true', FALSE)
$$;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.validate_user_role_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  role_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO role_tenant_id
  FROM roles
  WHERE id = NEW.role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role does not exist';
  END IF;
  IF role_tenant_id IS NOT NULL AND role_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'User role must belong to the same tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER permissions_set_updated_at BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER role_permissions_set_updated_at BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER document_chunks_set_updated_at BEFORE UPDATE ON document_chunks
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER document_embeddings_set_updated_at BEFORE UPDATE ON document_embeddings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER summaries_set_updated_at BEFORE UPDATE ON summaries
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER audit_logs_set_updated_at BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER refresh_tokens_set_updated_at BEFORE UPDATE ON refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER users_validate_role_tenant
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.validate_user_role_tenant();

CREATE POLICY tenants_scope ON tenants
  USING (id = app.current_tenant_id() OR app.is_admin())
  WITH CHECK (id = app.current_tenant_id() OR app.is_admin());
CREATE POLICY tenants_insert ON tenants
  FOR INSERT WITH CHECK (id = app.current_tenant_id());

CREATE POLICY roles_read ON roles
  FOR SELECT USING (
    tenant_id IS NULL OR tenant_id = app.current_tenant_id() OR app.is_admin()
  );
CREATE POLICY permissions_read ON permissions
  FOR SELECT USING (TRUE);
CREATE POLICY role_permissions_read ON role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roles
      WHERE roles.id = role_permissions.role_id
        AND (
          roles.tenant_id IS NULL
          OR roles.tenant_id = app.current_tenant_id()
          OR app.is_admin()
        )
    )
  );

CREATE POLICY users_read ON users
  FOR SELECT USING (
    (tenant_id = app.current_tenant_id() AND id = app.current_user_id())
    OR external_id = app.current_external_id()
    OR app.is_admin()
  );
CREATE POLICY users_insert ON users
  FOR INSERT WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND external_id = app.current_external_id()
  );
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (
    (tenant_id = app.current_tenant_id() AND id = app.current_user_id())
    OR external_id = app.current_external_id()
    OR app.is_admin()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR app.is_admin()
  );

CREATE POLICY documents_read ON documents
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      (tenant_id = app.current_tenant_id()
       AND owner_id = app.current_user_id())
      OR app.is_admin()
    )
  );
CREATE POLICY documents_insert ON documents
  FOR INSERT WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND owner_id = app.current_user_id()
  );
CREATE POLICY documents_update ON documents
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      (tenant_id = app.current_tenant_id()
       AND owner_id = app.current_user_id())
      OR app.is_admin()
    )
  )
  WITH CHECK (
    (tenant_id = app.current_tenant_id() AND owner_id = app.current_user_id())
    OR app.is_admin()
  );

CREATE POLICY document_chunks_scope ON document_chunks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.tenant_id = document_chunks.tenant_id
        AND documents.deleted_at IS NULL
        AND (
          (documents.tenant_id = app.current_tenant_id()
           AND documents.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.tenant_id = document_chunks.tenant_id
        AND documents.deleted_at IS NULL
        AND (
          (documents.tenant_id = app.current_tenant_id()
           AND documents.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  );

CREATE POLICY document_embeddings_scope ON document_embeddings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_embeddings.document_id
        AND documents.tenant_id = document_embeddings.tenant_id
        AND documents.deleted_at IS NULL
        AND (
          (documents.tenant_id = app.current_tenant_id()
           AND documents.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_embeddings.document_id
        AND documents.tenant_id = document_embeddings.tenant_id
        AND documents.deleted_at IS NULL
        AND (
          (documents.tenant_id = app.current_tenant_id()
           AND documents.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  );

CREATE POLICY summaries_scope ON summaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = summaries.document_id
        AND documents.tenant_id = summaries.tenant_id
        AND documents.deleted_at IS NULL
        AND (
          (documents.tenant_id = app.current_tenant_id()
           AND documents.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = summaries.document_id
        AND documents.tenant_id = summaries.tenant_id
        AND documents.deleted_at IS NULL
        AND (
          (documents.tenant_id = app.current_tenant_id()
           AND documents.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  );

CREATE POLICY conversations_scope ON conversations
  FOR ALL
  USING (
    deleted_at IS NULL
    AND tenant_id = app.current_tenant_id()
    AND (owner_id = app.current_user_id() OR app.is_admin())
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND (owner_id = app.current_user_id() OR app.is_admin())
  );

CREATE POLICY messages_scope ON messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.tenant_id = messages.tenant_id
        AND conversations.deleted_at IS NULL
        AND (
          (conversations.tenant_id = app.current_tenant_id()
           AND conversations.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.tenant_id = messages.tenant_id
        AND conversations.deleted_at IS NULL
        AND (
          (conversations.tenant_id = app.current_tenant_id()
           AND conversations.owner_id = app.current_user_id())
          OR app.is_admin()
        )
    )
  );

CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT USING (
    (
      tenant_id = app.current_tenant_id()
      AND actor_id = app.current_user_id()
    )
    OR app.is_admin()
  );
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (
    (
      tenant_id = app.current_tenant_id()
      AND actor_id = app.current_user_id()
    )
    OR app.is_admin()
  );

CREATE POLICY refresh_tokens_scope ON refresh_tokens
  FOR ALL
  USING (
    tenant_id = app.current_tenant_id()
    AND user_id = app.current_user_id()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND user_id = app.current_user_id()
  );

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings FORCE ROW LEVEL SECURITY;
ALTER TABLE summaries FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA app TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO PUBLIC;
