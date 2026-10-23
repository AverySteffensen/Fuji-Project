UPDATE purchase_requests
SET data = json_set(data, '$.priority', CASE json_extract(data, '$.priority') WHEN 'Rush' THEN 'High' ELSE 'Medium' END)
WHERE json_extract(data, '$.priority') IN ('Normal', 'Rush');
--> statement-breakpoint
UPDATE audit_events
SET data = json_set(data, '$.previousVersion.priority', CASE json_extract(data, '$.previousVersion.priority') WHEN 'Rush' THEN 'High' ELSE 'Medium' END)
WHERE json_extract(data, '$.previousVersion.priority') IN ('Normal', 'Rush');
