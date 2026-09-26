--===========================
-- Insert Roles
--===========================

INSERT INTO roles
(role_name, description)
VALUES

('ADMIN', 
'Verified user who creates, manages, and moderates alerts and users'),

('POLICE', 
'Verified law enforcement officer with access to sensitive information and alert management'),

('MEMBER',
'User who receives alerts and can report sightings of missing children'),

('GUEST', 'Unverified user with limited access to the system');
