ALTER POLICY principal_self ON panda_identity.principals USING(subject::text=(SELECT current_setting('panda.subject',true)));
ALTER POLICY enroll_patient ON panda_identity.principals WITH CHECK(subject::text=(SELECT current_setting('panda.subject',true)) AND role='patient');
ALTER POLICY grants_self ON panda_identity.patient_grants USING(subject::text=(SELECT current_setting('panda.subject',true)));
ALTER POLICY own_limits ON panda_platform.rate_limits USING(subject::text=(SELECT current_setting('panda.subject',true))) WITH CHECK(subject::text=(SELECT current_setting('panda.subject',true)));
ALTER POLICY audit_write ON panda_platform.audit WITH CHECK(subject::text=(SELECT current_setting('panda.subject',true)));
ALTER POLICY audit_update ON panda_platform.audit USING(subject::text=(SELECT current_setting('panda.subject',true))) WITH CHECK(subject::text=(SELECT current_setting('panda.subject',true)));
ALTER POLICY audit_own ON panda_platform.audit USING(subject::text=(SELECT current_setting('panda.subject',true)));
