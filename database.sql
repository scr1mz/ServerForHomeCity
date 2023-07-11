-- Создание таблицы users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(15) UNIQUE NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'admin', 'agent')),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE
);

-- Создание таблицы objects
CREATE TABLE IF NOT EXISTS objects (
    id SERIAL PRIMARY KEY,
    description TEXT,
    price INTEGER NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    property_type VARCHAR(20) CHECK (property_type IN ('apartment', 'room', 'house', 'land')),
    rooms INTEGER NOT NULL,
    area NUMERIC(6, 2) NOT NULL,
    floor INTEGER NOT NULL,
    total_floors INTEGER NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('for_sale', 'for_rent', 'sold', 'rented')),
    date_added DATE NOT NULL
);

-- Создание таблицы ownership
CREATE TABLE IF NOT EXISTS ownership (
    object_id INTEGER PRIMARY KEY REFERENCES objects(id),
    user_id INTEGER REFERENCES users(id),
    agent_id INTEGER REFERENCES users(id)
);

-- Создание таблицы object_images
CREATE TABLE IF NOT EXISTS object_images (
    id SERIAL PRIMARY KEY,
    object_id INTEGER REFERENCES objects(id),
    image_url VARCHAR(255) NOT NULL
);

-- Создание таблицы features
CREATE TABLE IF NOT EXISTS features (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- Создание таблицы object_features
CREATE TABLE IF NOT EXISTS object_features (
    object_id INTEGER REFERENCES objects(id),
    feature_id INTEGER REFERENCES features(id),
    value VARCHAR(255) NOT NULL,
    PRIMARY KEY (object_id, feature_id)
);

-- Создание таблицы favorites
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    object_id INTEGER REFERENCES objects(id),
    date_added DATE NOT NULL
);

-- Создание таблицы messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    object_id INTEGER REFERENCES objects(id),
    content TEXT NOT NULL,
    date_sent TIMESTAMP NOT NULL,
    is_read BOOLEAN NOT NULL
);

-- Создание таблицы appointments
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    agent_id INTEGER REFERENCES users(id),
    object_id INTEGER REFERENCES objects(id),
    date_time TIMESTAMP NOT NULL,
    status VARCHAR(15) NOT NULL CHECK (status IN ('scheduled', 'cancelled', 'completed'))
);

CREATE TABLE IF NOT EXISTS schema_version (
    schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    sum INTEGER NOT NULL,
    payment_id VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    object_id INTEGER REFERENCES objects(id),
    sum INTEGER NOT NULL,
    date_time TIMESTAMPTZ NOT NULL
);

DO
$$
DECLARE
    ver INTEGER;
BEGIN
    SELECT schema_version FROM schema_version INTO ver;
    IF NOT FOUND THEN
        ver := 1;
        INSERT INTO schema_version (schema_version) VALUES (ver);
    END IF;

    IF ver = 1 THEN
        ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN token VARCHAR(255) NOT NULL DEFAULT '';
        ver = ver + 1;
    END IF;

    IF ver = 2 THEN
        ALTER TABLE users ALTER COLUMN email SET NOT NULL;
        ver = ver + 1;
    END IF;

    IF ver = 3 THEN
        ALTER TABLE users ADD COLUMN balance INTEGER NOT NULL DEFAULT 0;
        ver = ver + 1;
    END IF;

    IF ver = 4 THEN
        ALTER TABLE objects ADD COLUMN category VARCHAR(10) NOT NULL CHECK (category IN ('draft', 'checking', 'approved', 'rejected', 'archived')) DEFAULT 'approved';

        ALTER TABLE users DROP CONSTRAINT users_role_check;
        ALTER TABLE users ADD CONSTRAINT role CHECK (role IN ('user', 'admin', 'agent', 'moderator'));
        ALTER TABLE users ADD COLUMN one_time_password_hash VARCHAR(255) NOT NULL DEFAULT '';

        ALTER TABLE payments ADD COLUMN pending BOOLEAN NOT NULL DEFAULT TRUE;

        ver = ver + 1;
    END IF;

    IF ver = 5 THEN
        ALTER TABLE payments ADD COLUMN date_time TIMESTAMPTZ NOT NULL DEFAULT NOW();

        ver = ver + 1;
    END IF;

    IF ver = 6 THEN
        ALTER TABLE objects ALTER COLUMN rooms DROP NOT NULL;
        ALTER TABLE objects ALTER COLUMN floor DROP NOT NULL;
        ALTER TABLE objects ALTER COLUMN total_floors DROP NOT NULL;

        CREATE TYPE _bathroom_type AS ENUM (
            'COMBINED', 'SEPARATED'
        );

        CREATE TYPE _repair_type AS ENUM (
            'NO', 'COSMETIC', 'EURO', 'DESIGN'
        );

        CREATE TYPE _building_type AS ENUM (
            'BRICK', 'PANEL', 'BLOCK', 'MONOLITH', 'WOOD'
        );

        ALTER TABLE objects ADD COLUMN bathroom_type _bathroom_type;
        ALTER TABLE objects ADD COLUMN bathrooms_count INTEGER;
        ALTER TABLE objects ADD COLUMN loggias_count INTEGER;
        ALTER TABLE objects ADD COLUMN repair_type _repair_type;
        ALTER TABLE objects ADD COLUMN building_type _building_type;
        ALTER TABLE objects ADD COLUMN elevators_count INTEGER;
        ALTER TABLE objects ADD COLUMN has_cargo_elevator BOOLEAN;
        ALTER TABLE objects ADD COLUMN has_parking BOOLEAN;
        ALTER TABLE objects ADD COLUMN has_electricity BOOLEAN;
        ALTER TABLE objects ADD COLUMN has_gas BOOLEAN;
        ALTER TABLE objects ADD COLUMN has_water BOOLEAN;

        ver = ver + 1;
    END IF;

    UPDATE schema_version SET schema_version = ver;
END
$$;

CREATE OR REPLACE FUNCTION accept_payment(_id INTEGER) RETURNS void AS
$$
DECLARE
    row RECORD;
BEGIN
    SELECT * INTO row FROM payments WHERE PENDING AND id = _id;
    IF FOUND THEN
        UPDATE users SET balance = balance + row.sum WHERE id = row.user_id;
        UPDATE payments SET pending = FALSE WHERE id = _id;
    END IF;
END
$$
LANGUAGE plpgsql;