-- Server-only schemas. Browser-facing Supabase Data API roles receive no grants.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='panda_runtime') THEN CREATE ROLE panda_runtime NOLOGIN NOBYPASSRLS; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS panda_identity;
CREATE SCHEMA IF NOT EXISTS panda_platform;
CREATE SCHEMA IF NOT EXISTS care;
CREATE SCHEMA IF NOT EXISTS rehab;
CREATE SCHEMA IF NOT EXISTS voice;
REVOKE ALL ON SCHEMA panda_identity,panda_platform,care,rehab,voice FROM PUBLIC;
GRANT USAGE ON SCHEMA panda_identity,panda_platform,care,rehab,voice TO panda_runtime;
CREATE TABLE IF NOT EXISTS panda_identity.principals (
 subject uuid PRIMARY KEY, role text NOT NULL DEFAULT 'patient' CHECK(role IN ('patient','clinician')),
 display_name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS panda_identity.patient_grants (
 subject uuid NOT NULL REFERENCES panda_identity.principals(subject), patient_id uuid NOT NULL REFERENCES panda_identity.principals(subject),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(subject,patient_id)
);
CREATE INDEX IF NOT EXISTS patient_grants_patient ON panda_identity.patient_grants(patient_id);
ALTER TABLE panda_identity.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE panda_identity.principals FORCE ROW LEVEL SECURITY;
ALTER TABLE panda_identity.patient_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE panda_identity.patient_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_self ON panda_identity.principals FOR SELECT TO panda_runtime USING(subject::text=current_setting('panda.subject',true));
CREATE POLICY enroll_patient ON panda_identity.principals FOR INSERT TO panda_runtime WITH CHECK(subject::text=current_setting('panda.subject',true) AND role='patient');
CREATE POLICY grants_self ON panda_identity.patient_grants FOR SELECT TO panda_runtime USING(subject::text=current_setting('panda.subject',true));
GRANT SELECT,INSERT ON panda_identity.principals TO panda_runtime;
GRANT SELECT ON panda_identity.patient_grants TO panda_runtime;
CREATE OR REPLACE FUNCTION panda_identity.can_access(id text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT id=current_setting('panda.patient',true) AND EXISTS (
  SELECT 1 FROM panda_identity.principals p WHERE p.subject::text=current_setting('panda.subject',true)
  AND ((p.role='patient' AND id=p.subject::text) OR (p.role='clinician' AND EXISTS (
   SELECT 1 FROM panda_identity.patient_grants g WHERE g.subject=p.subject AND g.patient_id::text=id
  )))
 )
$$;
REVOKE ALL ON FUNCTION panda_identity.can_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION panda_identity.can_access(text) TO panda_runtime;
CREATE TABLE care.patient_state (patient_id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rehab.patient_state (LIKE care.patient_state INCLUDING ALL);
CREATE TABLE voice.patient_state (LIKE care.patient_state INCLUDING ALL);
CREATE TABLE voice.patient_memory (LIKE care.patient_state INCLUDING ALL);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['care.patient_state','rehab.patient_state','voice.patient_state','voice.patient_memory'] LOOP
 EXECUTE 'ALTER TABLE '||t||' ENABLE ROW LEVEL SECURITY'; EXECUTE 'ALTER TABLE '||t||' FORCE ROW LEVEL SECURITY';
 EXECUTE 'CREATE POLICY patient_scope ON '||t||' TO panda_runtime USING(panda_identity.can_access(patient_id)) WITH CHECK(panda_identity.can_access(patient_id))';
 EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON '||t||' TO panda_runtime';
END LOOP; END $$;
CREATE TABLE panda_platform.rate_limits(subject uuid NOT NULL,bucket text NOT NULL,window_start bigint NOT NULL,count integer NOT NULL,PRIMARY KEY(subject,bucket,window_start));
ALTER TABLE panda_platform.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE panda_platform.rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY own_limits ON panda_platform.rate_limits TO panda_runtime USING(subject::text=current_setting('panda.subject',true)) WITH CHECK(subject::text=current_setting('panda.subject',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON panda_platform.rate_limits TO panda_runtime;
CREATE TABLE panda_platform.audit(id uuid PRIMARY KEY,subject uuid NOT NULL,patient_id text,event text NOT NULL,status integer,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_created ON panda_platform.audit(created_at);
ALTER TABLE panda_platform.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE panda_platform.audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_write ON panda_platform.audit FOR INSERT TO panda_runtime WITH CHECK(subject::text=current_setting('panda.subject',true));
CREATE POLICY audit_update ON panda_platform.audit FOR UPDATE TO panda_runtime USING(subject::text=current_setting('panda.subject',true)) WITH CHECK(subject::text=current_setting('panda.subject',true));
CREATE POLICY audit_own ON panda_platform.audit FOR SELECT TO panda_runtime USING(subject::text=current_setting('panda.subject',true));
GRANT SELECT,INSERT,UPDATE ON panda_platform.audit TO panda_runtime;
-- Grant this role to a dedicated DB login with a separately generated password.
-- Never grant schema/table ownership or BYPASSRLS to the runtime login.

CREATE TABLE panda_platform.releases(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO panda_platform.releases(version) VALUES('20261108_production');
GRANT SELECT ON panda_platform.releases TO panda_runtime;
