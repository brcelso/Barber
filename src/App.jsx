import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Calendar,
  Clock,
  User,
  LogOut,
  CheckCircle,
  Plus,
  History,
  CreditCard,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Settings,
  Shield
} from 'lucide-react';
import { format, addDays, startOfToday, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db } from './db';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api';

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('barber_user') || 'null'));
  const [view, setView] = useState('book'); // book, history, admin
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [selectedTime, setSelectedTime] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Mock Availability
  const timeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];

  useEffect(() => {
    fetchServices();
    if (user) {
      fetchAppointments();
      if (user.isAdmin) fetchAdminAppointments();
    }
  }, [user, view]);

  const fetchServices = async () => {
    try {
      const res = await fetch(`${API_URL}/services`);
      const data = await res.json();
      setServices(data || []);
    } catch (e) {
      // Fallback to local defaults if API fails
      setServices([
        { id: 'corte-simples', name: 'Corte de Cabelo', price: 40, duration_minutes: 30 },
        { id: 'barba', name: 'Barba Completa', price: 30, duration_minutes: 20 },
        { id: 'combo', name: 'Cabelo e Barba', price: 60, duration_minutes: 50 }
      ]);
    }
  };

  const fetchAppointments = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/appointments`, {
        headers: { 'X-User-Email': user.email }
      });
      const data = await res.json();
      setAppointments(data || []);
    } catch (e) {
      console.error('Failed to fetch appointments');
    }
  };

  const fetchAdminAppointments = async () => {
    if (!user?.isAdmin) return;
    try {
      const res = await fetch(`${API_URL}/admin/appointments`, {
        headers: { 'X-User-Email': user.email }
      });
      const data = await res.json();
      setAdminAppointments(data || []);
    } catch (e) {
      console.error('Failed to fetch admin appointments');
    }
  };

  const handleCredentialResponse = async (response) => {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const userData = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      token: response.credential,
    };

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${response.credential}`
        },
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (data.user) {
        const finalUser = { ...userData, isAdmin: data.user.isAdmin };
        setUser(finalUser);
        localStorage.setItem('barber_user', JSON.stringify(finalUser));
      }
    } catch (err) {
      console.error('[Login Failed]', err);
    }
  };

  useEffect(() => {
    let retryCount = 0;
    const initGoogle = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });
        if (!user) {
          const btnElem = document.getElementById("googleBtn");
          if (btnElem) {
            window.google.accounts.id.renderButton(btnElem, { theme: "outline", size: "large", shape: "pill", width: "100%" });
          }
        }
      } else if (retryCount < 10) {
        retryCount++;
        setTimeout(initGoogle, 500);
      }
    };
    initGoogle();
  }, [user]);

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('barber_user');
  };

  const handleBooking = async () => {
    if (!selectedService || !selectedTime || !user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          serviceId: selectedService.id,
          date: format(selectedDate, 'yyyy-MM-dd'),
          time: selectedTime
        })
      });
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert('Agendamento realizado! (Webhook confirmará pagamento)');
        fetchAppointments();
        setView('history');
      }
    } catch (e) {
      alert('Erro ao agendar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="login-screen fade-in">
        <div className="glass-card login-card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px' }}>
          <div className="logo-text" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Barber</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>O melhor corte da sua vida, a um clique de distância.</p>
          <div id="googleBtn" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}></div>
          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Ao entrar você concorda com nossos termos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      <header className="header">
        <div>
          <h1 className="logo-text">Barber</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>Premium Experience</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          {user.isAdmin && (
            <>
              <button className={`btn-icon ${view === 'admin' ? 'active-admin' : ''}`} onClick={() => setView('admin')} title="Painel Admin">
                <Shield className={view === 'admin' ? 'text-primary' : ''} />
              </button>
            </>
          )}
          <button className="btn-icon" onClick={() => setView('book')} title="Agendar"><Plus /></button>
          <button className="btn-icon" onClick={() => setView('history')} title="Meus Agendamentos"><History /></button>
          <div className="user-avatar" style={{ border: '1px solid var(--primary)', width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden' }}>
            <img src={user.picture} alt={user.name} style={{ width: '100%' }} />
          </div>
          <button className="btn-icon" onClick={handleLogout}><LogOut /></button>
        </div>
      </header>

      {view === 'admin' && user.isAdmin && (
        <main className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2>Painel do Barbeiro (Todos os Agendamentos)</h2>
            <div className="glass-card" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
              Total: <span className="text-primary" style={{ fontWeight: 800 }}>{adminAppointments.length}</span>
            </div>
          </div>
          {adminAppointments.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <History size={48} style={{ color: 'var(--border)', marginBottom: '1rem' }} />
              <p>Nenhum agendamento encontrado no sistema.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {adminAppointments.map(a => (
                <div key={a.id} className="glass-card appointment-item" style={{ borderLeft: a.status === 'confirmed' ? '4px solid var(--success)' : '4px solid var(--primary)' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flex: 1 }}>
                    <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: '12px', textAlign: 'center', minWidth: '60px' }}>
                      <div style={{ fontSize: '0.7rem' }}>{format(parseISO(a.appointment_date), 'MMM').toUpperCase()}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{format(parseISO(a.appointment_date), 'dd')}</div>
                    </div>
                    <div className="user-avatar" style={{ width: '45px', height: '45px' }}>
                      <img src={a.user_picture} alt={a.user_name} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.1rem' }}>{a.user_name}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{a.service_name} às {a.appointment_time}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`status-tag status-${a.status}`} style={{ marginBottom: '0.5rem' }}>
                      {a.status === 'confirmed' ? 'Pago' : 'Pendente'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ref: {a.id.split('-')[0]}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {view === 'book' && (
        <main>
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Scissors className="text-primary" /> Escolha o Serviço
            </h2>
            <div className="service-grid">
              {services.map(s => (
                <div
                  key={s.id}
                  className={`glass-card service-card ${selectedService?.id === s.id ? 'selected' : ''}`}
                  onClick={() => setSelectedService(s)}
                >
                  <h3 style={{ fontSize: '1.2rem' }}>{s.name}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{s.duration_minutes} min</p>
                  <div className="price">R$ {s.price}</div>
                  <div style={{ color: selectedService?.id === s.id ? 'var(--primary)' : 'transparent' }}>
                    <CheckCircle size={24} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar className="text-primary" /> Data e Horário
            </h2>

            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '1rem' }}>
              {[...Array(14)].map((_, i) => {
                const date = addDays(startOfToday(), i);
                return (
                  <button
                    key={i}
                    className={`glass-card`}
                    style={{
                      padding: '0.8rem 1.2rem',
                      minWidth: '90px',
                      textAlign: 'center',
                      borderColor: isSameDay(selectedDate, date) ? 'var(--primary)' : 'var(--border)',
                      background: isSameDay(selectedDate, date) ? 'rgba(212, 175, 55, 0.1)' : 'transparent'
                    }}
                    onClick={() => setSelectedDate(date)}
                  >
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      {format(date, 'eee', { locale: ptBR })}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                      {format(date, 'dd')}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="time-slots">
              {timeSlots.map(t => (
                <button
                  key={t}
                  className={`time-slot ${selectedTime === t ? 'selected' : 'available'}`}
                  onClick={() => setSelectedTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Resumo:</p>
                <h3 style={{ fontSize: '1.1rem' }}>
                  {selectedService ? selectedService.name : 'Selecione um serviço'}
                  {selectedTime && ` às ${selectedTime}`}
                </h3>
              </div>
              <button
                className="btn-primary"
                disabled={!selectedService || !selectedTime || loading}
                onClick={handleBooking}
              >
                {loading ? 'Processando...' : <><CreditCard size={20} /> Pagar e Confirmar</>}
              </button>
            </div>
          </section>
        </main>
      )}

      {view === 'history' && (
        <main className="fade-in">
          <h2 style={{ marginBottom: '2rem' }}>Meus Agendamentos</h2>
          {appointments.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <History size={48} style={{ color: 'var(--border)', marginBottom: '1rem' }} />
              <p>Você ainda não possui agendamentos.</p>
              <button className="btn-primary" onClick={() => setView('book')} style={{ margin: '1.5rem auto' }}>Agendar Agora</button>
            </div>
          ) : (
            appointments.map(a => (
              <div key={a.id} className="glass-card appointment-item">
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <div style={{ background: 'var(--accent)', parding: '1rem', borderRadius: '12px', textAlign: 'center', minWidth: '60px' }}>
                    <div style={{ fontSize: '0.7rem' }}>{format(parseISO(a.appointment_date), 'MMM').toUpperCase()}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{format(parseISO(a.appointment_date), 'dd')}</div>
                  </div>
                  <div>
                    <h3 style={{ color: 'var(--primary)' }}>{a.service_name}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{a.appointment_time} - Barber Central</p>
                  </div>
                </div>
                <div className={`status-tag status-${a.status}`}>
                  {a.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                </div>
              </div>
            ))
          )}
        </main>
      )}
    </div>
  );
}

export default App;
