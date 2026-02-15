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
  RefreshCw,
  X,
  Check,
  MessageSquare,
  MessageCircle,
  Trash2,
  Edit2,
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

  // Set default view on login/load
  useEffect(() => {
    if (user?.isAdmin) {
      setView('admin');
    } else if (user) {
      setView('book');
    }
  }, [user]);

  // Mock Availability
  const timeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];

  useEffect(() => {
    fetchServices();
    if (user) {
      if (user.isAdmin) {
        fetchAdminAppointments();
      } else {
        fetchAppointments();
      }
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
    if (!user || user.isAdmin) return;
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

  const handleRefresh = () => {
    fetchServices();
    fetchAppointments();
    if (user?.isAdmin) fetchAdminAppointments();
  };

  const handleAdminConfirm = async (appointmentId) => {
    setLoading(true);
    try {
      await fetch(`${API_URL}/admin/appointments/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, adminEmail: user.email })
      });
      alert('Agendamento confirmado! Cliente notificado.');
      handleRefresh();
    } catch (e) {
      alert('Erro ao confirmar');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (appointmentId) => {
    if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/appointments/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, userEmail: user.email })
      });
      alert('Agendamento cancelado.');
      handleRefresh();
    } catch (e) {
      alert('Erro ao cancelar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (appointmentId) => {
    if (!confirm('Deseja excluir permanentemente este registro do histórico?')) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/appointments/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, userEmail: user.email })
      });
      handleRefresh();
    } catch (e) {
      alert('Erro ao excluir');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (appointmentId) => {
    const statuses = ['pending', 'confirmed', 'cancelled'];
    const currentAppt = adminAppointments.find(a => a.id === appointmentId) || appointments.find(a => a.id === appointmentId);
    const currentIndex = statuses.indexOf(currentAppt.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    setLoading(true);
    try {
      await fetch(`${API_URL}/appointments/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, status: nextStatus, userEmail: user.email })
      });
      handleRefresh();
    } catch (e) {
      alert('Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppNotify = (appt) => {
    let phone = appt.user_phone;
    if (!phone) {
      phone = prompt(`O cliente ${appt.user_name} não tem telefone cadastrado. Digite o número (ex: 11999999999):`, "");
    }
    if (!phone) return;

    const cleanPhone = phone.replace(/\D/g, "");
    const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const dateStr = format(parseISO(appt.appointment_date), 'dd/MM/yyyy');
    const text = `Olá ${appt.user_name}! Confirmamos seu agendamento na Barber para o dia ${dateStr} às ${appt.appointment_time} (${appt.service_name}). Até lá!`;

    const url = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
          time: selectedTime,
          skipPayment: true // Signal the backend to not auto-generate payment URL
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Agendamento realizado com sucesso! Você pode realizar o pagamento agora ou depois em seus agendamentos.');
        fetchAppointments();
        setView('history');
      } else {
        alert('Erro ao agendar: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      alert('Erro de conexão: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (appointmentId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/payments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, email: user.email })
      });
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert('Erro ao gerar link de pagamento: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      alert('Erro de conexão: ' + e.message);
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
          <p style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>{user.isAdmin ? 'Relatórios & Gestão' : 'Premium Experience'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <button
            className="btn-icon"
            style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: '1px solid rgba(37, 211, 102, 0.2)' }}
            onClick={() => window.open('https://wa.me/5511972509876', '_blank')}
            title="Falar com Barbeiro"
          >
            <MessageCircle size={20} />
          </button>
          <button className="btn-icon" onClick={handleRefresh} title="Atualizar Dados"><RefreshCw size={20} /></button>
          {!user.isAdmin ? (
            <>
              <button className="btn-icon" onClick={() => setView('book')} title="Agendar"><Plus /></button>
              <button className="btn-icon" onClick={() => setView('history')} title="Meus Agendamentos"><History /></button>
            </>
          ) : (
            <button className="btn-icon active-admin" onClick={() => setView('admin')} title="Painel Admin">
              <Shield className="text-primary" />
            </button>
          )}
          <div className="user-avatar">
            <img src={user.picture} alt={user.name} />
          </div>
          <button className="btn-icon" onClick={handleLogout} title="Sair"><LogOut /></button>
        </div>
      </header>

      {view === 'admin' && user.isAdmin && (
        <main className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2>Painel do Barbeiro</h2>
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
                <div key={a.id} className="glass-card appointment-item" style={{ borderLeft: a.status === 'confirmed' ? '4px solid var(--success)' : (a.status === 'cancelled' ? '4px solid var(--danger)' : '4px solid var(--primary)') }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                    <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: '12px', textAlign: 'center', minWidth: '55px' }}>
                      <div style={{ fontSize: '0.65rem' }}>{format(parseISO(a.appointment_date), 'MMM').toUpperCase()}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800 }}>{format(parseISO(a.appointment_date), 'dd')}</div>
                    </div>
                    <div className="user-avatar" style={{ width: '32px', height: '32px' }}>
                      <img src={a.user_picture} alt={a.user_name} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.95rem' }}>{a.user_name}</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{a.service_name} às {a.appointment_time}</p>
                      {a.payment_status === 'paid' ? (
                        <p style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700 }}>💰 PAGAMENTO CONFIRMADO</p>
                      ) : (
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⏳ Pagamento pendente</p>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className={`status-tag status-${a.status}`} style={{ fontSize: '0.7rem' }}>
                      {a.status === 'confirmed' ? 'Confirmado' : (a.status === 'cancelled' ? 'Cancelado' : 'Pendente')}
                    </div>
                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                      {a.status === 'pending' && (
                        <button className="btn-icon" style={{ padding: '4px', background: 'rgba(46, 204, 113, 0.2)', color: '#2ecc71' }} onClick={() => handleAdminConfirm(a.id)} title="Confirmar"><Check size={14} /></button>
                      )}
                      <button className="btn-icon" style={{ padding: '4px', background: 'rgba(37, 211, 102, 0.1)', color: '#25D366' }} onClick={() => handleWhatsAppNotify(a)} title="Notificar WhatsApp"><MessageSquare size={14} /></button>
                      <button className="btn-icon" style={{ padding: '4px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }} onClick={() => handleUpdateStatus(a.id)} title="Mudar Status"><Edit2 size={14} /></button>
                      <button className="btn-icon" style={{ padding: '4px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }} onClick={() => handleDelete(a.id)} title="Excluir"><Trash2 size={14} /></button>
                    </div>
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
                {loading ? 'Processando...' : <><Calendar size={20} /> Agendar Agora</>}
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
              <div key={a.id} className="glass-card appointment-item" style={{ flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.6rem', borderRadius: '12px', textAlign: 'center', minWidth: '55px' }}>
                      <div style={{ fontSize: '0.65rem' }}>{format(parseISO(a.appointment_date), 'MMM').toUpperCase()}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800 }}>{format(parseISO(a.appointment_date), 'dd')}</div>
                    </div>
                    <div className="user-avatar" style={{ width: '32px', height: '32px' }}>
                      <img src={user.picture} alt={user.name} />
                    </div>
                    <div>
                      <h3 style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>{a.service_name}</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.appointment_time} - Barber Central</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className={`status-tag status-${a.status}`}>
                      {a.status === 'confirmed' ? 'Confirmado' : (a.status === 'cancelled' ? 'Cancelado' : 'Pendente')}
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {user.isAdmin && <button className="btn-icon" style={{ padding: '4px', opacity: 0.6 }} onClick={() => handleUpdateStatus(a.id)} title="Alterar Status"><Edit2 size={14} /></button>}
                      <button className="btn-icon" style={{ padding: '4px', opacity: 0.6, color: 'var(--danger)' }} onClick={() => handleDelete(a.id)} title="Excluir do Histórico"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>

                {a.status === 'pending' && (
                  <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', gap: '10px' }}>
                    <button
                      className="btn-primary"
                      style={{ flex: 2, padding: '0.6rem' }}
                      onClick={() => handlePayment(a.id)}
                      disabled={loading}
                    >
                      <CreditCard size={18} /> Pagar Agora (R$ {a.price})
                    </button>
                    <button
                      className="btn-icon"
                      style={{ flex: 1, padding: '0.6rem', background: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c', borderRadius: '12px' }}
                      onClick={() => handleCancel(a.id)}
                      disabled={loading}
                    >
                      <X size={18} /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </main>
      )}
    </div>
  );
}

export default App;
