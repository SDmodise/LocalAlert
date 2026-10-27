-- Adds the notification type 'escalation' (see Phase 4, section 4.5.8).
BEGIN;
ALTER TABLE notifications DROP CONSTRAINT chk_notif_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notif_type
  CHECK (notification_type IN ('alert', 'escalation', 'spotted_report', 'resolved'));
COMMIT;
