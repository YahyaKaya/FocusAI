-- Focus AI Database Schema (PostgreSQL)
-- Matches Prisma schema from backend

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED')),
    session_type VARCHAR(50) DEFAULT 'OTHER' CHECK (session_type IN ('TEST', 'READING', 'WRITING', 'CODING', 'OTHER')),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    planned_duration INT,
    actual_duration INT,
    pause_count INT DEFAULT 0,
    total_break_mins INT DEFAULT 0,
    productivity_score FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- PRE_SURVEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pre_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE,
    
    mood INT NOT NULL CHECK (mood BETWEEN 1 AND 5),
    energy INT NOT NULL CHECK (energy BETWEEN 1 AND 5),
    motivation INT NOT NULL CHECK (motivation BETWEEN 1 AND 5),
    goal_difficulty INT NOT NULL CHECK (goal_difficulty BETWEEN 1 AND 5),
    
    environment VARCHAR(50) DEFAULT 'QUIET' CHECK (environment IN ('QUIET', 'NOISY', 'MUSIC')),
    music_type VARCHAR(50) CHECK (music_type IS NULL OR music_type IN ('LOFI', 'CLASSICAL', 'AMBIENT', 'OTHER')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================================
-- POST_SURVEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS post_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE,
    
    productivity INT NOT NULL CHECK (productivity BETWEEN 1 AND 5),
    focus INT NOT NULL CHECK (focus BETWEEN 1 AND 5),
    satisfaction INT NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
    distraction VARCHAR(50) DEFAULT 'NONE' CHECK (distraction IN ('NONE', 'FEW', 'MANY')),
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================================
-- PASSIVE_SIGNALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS passive_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    
    notification_count INT,
    distraction_taps INT,
    unlock_count INT,
    
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================================
-- USER_CONSENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    
    notifications_enabled BOOLEAN DEFAULT FALSE,
    distraction_tap_enabled BOOLEAN DEFAULT FALSE,
    unlock_tracking_enabled BOOLEAN DEFAULT FALSE,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- RECOMMENDATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id UUID,
    
    type VARCHAR(50) NOT NULL CHECK (type IN ('TIME_OF_DAY', 'DURATION', 'BREAK_SCHEDULE', 'ENVIRONMENT')),
    content TEXT NOT NULL,
    reasoning TEXT,
    interaction VARCHAR(50) CHECK (interaction IS NULL OR interaction IN ('APPLIED', 'DISMISSED')),
    interacted_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_passive_signals_session_id ON passive_signals(session_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_session_id ON recommendations(session_id);

