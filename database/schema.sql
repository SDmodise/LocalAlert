-- ======================
-- System Databse Schema
-- ======================

-- 1. Enable UUID extension for generating unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ======================
-- Roles Table
-- ======================

CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================
-- Users Table
-- ======================

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone_number VARCHAR(10),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_role 
    FOREIGN KEY(role_id) 
    REFERENCES roles(role_id) ON DELETE CASCADE
    

);

-- ======================
-- Alerts Table
-- ======================

CREATE TABLE alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL,
    child_name VARCHAR(100) NOT NULL,
    age INTEGER,
    gender VARCHAR(10),
    description TEXT,
    photo_url TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    last_seen_time TIMESTAMP,
    clothing_description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_alert_creator
    FOREIGN KEY(created_by)
    REFERENCES users(user_id) ON DELETE CASCADE
);

-- ======================
-- Notifications Table
-- ======================

CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    alert_id UUID NOT NULL,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notification_user
    FOREIGN KEY(user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,

    CONSTRAINT fk_notification_alert
    FOREIGN KEY(alert_id)
    REFERENCES alerts(alert_id) ON DELETE CASCADE

);

-- ======================
-- Alert History Table
-- ======================

CREATE TABLE alert_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL,
    changed_by UUID NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    change_description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_alert_history
    FOREIGN KEY(alert_id)
    REFERENCES alerts(alert_id) ON DELETE CASCADE,

    CONSTRAINT fk_alert_history_user
    FOREIGN KEY(changed_by)
    REFERENCES users(user_id) ON DELETE CASCADE

);

--=======================
-- Indexes
--=======================

CREATE INDEX idx_alert_location
ON alerts(latitude, longitude);

CREATE INDEX idx_alert_status
ON alerts(status);

CREATE INDEX idx_reports_alert
ON sighting(alert_id);

CREATE INDEX idx_reports_user
ON notifications(user_id);
