-- =====================================================================
-- 012: Lock-screen (push) notifications.
--  * push_tokens: the Expo push token of each phone a user is logged in on.
--  * A trigger announces every new row in notifications on the channel
--    "localalert_notifications"; the backend listens and sends a push.
--    Announcements are only delivered when the transaction commits.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE IF NOT EXISTS push_tokens (
    token        text PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    platform     varchar(10),
    created_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);

CREATE OR REPLACE FUNCTION announce_notification() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('localalert_notifications', json_build_object(
        'user_id', NEW.user_id,
        'alert_id', NEW.alert_id,
        'type', NEW.notification_type,
        'recipient', NEW.recipient_type
    )::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_announce_notification ON notifications;
CREATE TRIGGER trg_announce_notification
    AFTER INSERT ON notifications
    FOR EACH ROW EXECUTE FUNCTION announce_notification();

COMMIT;
