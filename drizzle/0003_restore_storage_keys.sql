ALTER TABLE `attachments` ADD `storage_key` text;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER security_events_no_update BEFORE UPDATE ON security_events BEGIN SELECT RAISE(ABORT,'Security history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER security_events_no_delete BEFORE DELETE ON security_events BEGIN SELECT RAISE(ABORT,'Security history is append-only'); END;
--> statement-breakpoint
CREATE INDEX audit_request_date ON audit_events(request_id,at);
--> statement-breakpoint
CREATE INDEX session_user ON app_sessions(user_id);
--> statement-breakpoint
CREATE INDEX health_date ON health_checks(at);
