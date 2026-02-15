-- Schema for Barber D1 Database
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  picture TEXT,
  is_admin INTEGER DEFAULT 0,
  last_login TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  description TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
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

-- Seed defaults
INSERT OR IGNORE INTO services (id, name, price, duration_minutes, description) VALUES 
('corte-simples', 'Corte de Cabelo', 40.0, 30, 'Corte tradicional'),
('barba', 'Barba Completa', 30.0, 20, 'Barba com toalha quente'),
('combo', 'Cabelo e Barba', 60.0, 50, 'O pacote completo');
