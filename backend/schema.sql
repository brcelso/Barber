-- Schema for Barber D1 Database
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  picture TEXT,
  is_admin INTEGER DEFAULT 0,
  is_barber INTEGER DEFAULT 0,
  wa_status TEXT,
  wa_qr TEXT,
  wa_last_seen TEXT,
  subscription_expires TEXT,
  trial_used INTEGER DEFAULT 0,
  plan TEXT,
  bot_name TEXT DEFAULT 'Leo',
  owner_id TEXT DEFAULT NULL,
  business_type TEXT DEFAULT 'barbearia',
  bot_tone TEXT DEFAULT 'prestativo e amigável',
  welcome_message TEXT DEFAULT 'Olá {{user_name}}, seu horário para *{{service_name}}* foi confirmado!',
  last_login TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  description TEXT,
  barber_email TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  barber_email TEXT,
  service_id TEXT NOT NULL,
  appointment_date TEXT NOT NULL, -- YYYY-MM-DD
  appointment_time TEXT NOT NULL, -- HH:mm
  status TEXT DEFAULT 'pending', -- pending, confirmed, cancelled, completed
  payment_status TEXT DEFAULT 'pending', -- pending, paid, refunded
  payment_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_email) REFERENCES users(email),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week INTEGER, -- 0-6
  start_time TEXT,
  end_time TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone TEXT PRIMARY KEY,
  state TEXT,
  service_id TEXT,
  appointment_date TEXT,
  appointment_time TEXT,
  user_email TEXT,
  selected_barber_email TEXT,
  metadata TEXT,
  last_interaction TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults
INSERT OR IGNORE INTO services (id, name, price, duration_minutes, description, barber_email) VALUES 
('corte-simples', 'Corte de Cabelo', 70.0, 30, 'Corte tradicional', 'celsosilvajunior90@gmail.com'),
('barba', 'Barba Completa', 70.0, 20, 'Barba com toalha quente', 'celsosilvajunior90@gmail.com'),
('combo', 'Cabelo e Barba', 150.0, 50, 'O pacote completo', 'celsosilvajunior90@gmail.com');

-- Add special 'block' service used for admin-blocked slots
INSERT OR IGNORE INTO services (id, name, price, duration_minutes, description, barber_email) VALUES
('block', 'Blocked Slot', 0.0, 0, 'Reserved by admin', 'celsosilvajunior90@gmail.com');

-- Ensure a system user exists for system-generated appointments/blocks
INSERT OR IGNORE INTO users (email, name, is_admin, created_at) VALUES
('system', 'System', 0, CURRENT_TIMESTAMP);
