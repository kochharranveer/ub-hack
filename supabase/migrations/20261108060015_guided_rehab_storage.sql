CREATE TABLE rehab.cv_state (LIKE care.patient_state INCLUDING ALL);
ALTER TABLE rehab.cv_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehab.cv_state FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_scope ON rehab.cv_state TO panda_runtime USING(panda_identity.can_access(patient_id)) WITH CHECK(panda_identity.can_access(patient_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON rehab.cv_state TO panda_runtime;

INSERT INTO panda_platform.releases(version) VALUES('20261108_guided_rehab');
