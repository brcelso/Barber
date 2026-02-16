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
  Lock,
  Trash2,
  Edit2,
  Shield,
  Activity,
  Users
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
  const [barbers, setBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [busySlots, setBusySlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false); // Changed default to false
  const [subscription, setSubscription] = useState({ daysLeft: 0, isActive: false, expires: null }); // New state
  const [showPhoneSetup, setShowPhoneSetup] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showManualLogin, setShowManualLogin] = useState(false);
  const [paymentSelectionAppt, setPaymentSelectionAppt] = useState(null);
  const [selectedActionAppt, setSelectedActionAppt] = useState(null);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', qr: null });
  const [masterStats, setMasterStats] = useState(null);
  const [masterUsers, setMasterUsers] = useState([]);

  // Set default view on login/load
  useEffect(() => {
    if (user?.isAdmin || user?.isBarber) {
      setIsAdminMode(true); // Enable admin/barber mode
      setView('admin');
      if (user.isAdmin) fetchSubscription();
    } else if (user) {
      setView('book');
    }
  }, [user]);

  useEffect(() => {
    let interval;
    if (view === 'admin' && user?.isAdmin) {
      interval = setInterval(() => {
        fetchWaStatus();
        if (user?.isMaster) fetchMasterData();
      }, 5000);
      fetchWaStatus();
      if (user?.isMaster) fetchMasterData();
    }
    return () => clearInterval(interval);
  }, [view, user]);

  const [masterError, setMasterError] = useState(null);

  const fetchMasterData = async () => {
    try {
      if (!user?.email) return;
      setMasterError(null);

      const statsRes = await fetch(`${API_URL}/master/stats`, { headers: { 'X-User-Email': user.email } });
      const statsData = await statsRes.json();
      if (statsData.error) throw new Error(statsData.error);
      setMasterStats(statsData);

      const usersRes = await fetch(`${API_URL}/master/users`, { headers: { 'X-User-Email': user.email } });
      const usersData = await usersRes.json();
      if (usersData.error) throw new Error(usersData.error);

      console.log('[Master] Users fetched:', usersData);
      setMasterUsers(Array.isArray(usersData) ? usersData : []);
    } catch (e) {
      console.error('Erro ao buscar dados master:', e);
      setMasterError(e.message);
    }
  };

  const handleMasterUpdate = async (targetEmail, updates) => {
    try {
      const res = await fetch(`${API_URL}/master/user/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user.email
        },
        body: JSON.stringify({ targetEmail, ...updates })
      });
      if (res.ok) {
        // Silently update or show a tiny indicator.
        if (targetEmail === user.email) {
          const updatedUser = {
            ...user,
            isAdmin: updates.is_admin,
            isBarber: updates.is_barber,
            name: updates.newName !== undefined ? updates.newName : user.name,
            email: updates.newEmail !== undefined ? updates.newEmail : user.email,
            phone: updates.phone !== undefined ? updates.phone : user.phone
          };
          setUser(updatedUser);
          localStorage.setItem('barber_user', JSON.stringify(updatedUser));

          if (!updates.is_barber && view === 'admin') {
            setView('book');
          }
        }
        fetchMasterData();
      }
    } catch (e) {
      alert('Erro ao atualizar usuário');
    }
  };

  const handleMasterDelete = async (targetEmail) => {
    if (!confirm(`Tem certeza que deseja deletar permanentemente o usuário ${targetEmail}? Esta ação não pode ser desfeita e apagará todos os agendamentos dele.`)) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/master/user/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user.email
        },
        body: JSON.stringify({ targetEmail })
      });
      if (res.ok) {
        alert('Usuário deletado com sucesso!');
        fetchMasterData();
      } else {
        const data = await res.json();
        alert('Erro: ' + (data.error || 'Não foi possível deletar'));
      }
    } catch (e) {
      alert('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterRestartBot = async (targetEmail) => {
    try {
      // Tenta reiniciar na ponte local (PWA mode)
      const res = await fetch(`http://localhost:3000/api/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'barber-secret-key', email: targetEmail })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Comando de reinicialização enviado para ${targetEmail}`);
      } else {
        alert(`Erro na ponte: ${data.error}`);
      }
    } catch (e) {
      alert('Certifique-se que o Servidor Ponte está rodando localmente para reiniciar robôs.');
    }
  };

  const fetchWaStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/whatsapp/status`, {
        headers: { 'X-User-Email': user.email }
      });
      const data = await res.json();
      setWaStatus(data);

      // Só tenta inicializar a ponte se o status for desconectado
      if (data.status === 'disconnected') {
        fetch(`http://localhost:3000/api/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'barber-secret-key', email: user.email })
        }).catch(() => { }); // Ignora erro se a ponte não estiver rodando localmente
      }
    } catch (e) {
      console.error('Erro ao buscar status WhatsApp:', e);
    }
  };

  // Handle Manual Login Submission
  const handleManualLogin = async (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    const email = e.target.email.value;
    const phone = e.target.phone.value;

    if (!name || !email || !phone) return alert('Preecha todos os campos');

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d4af37&color=fff`
        })
      });
      const data = await res.json();
      if (data.user) {
        const finalUser = {
          name: data.user.name,
          email: data.user.email,
          picture: data.user.picture,
          isAdmin: data.user.isAdmin,
          isMaster: data.user.isMaster,
          phone: data.user.phone
        };
        setUser(finalUser);
        localStorage.setItem('barber_user', JSON.stringify(finalUser));
        setShowManualLogin(false);
      }
    } catch (e) {
      alert('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  // Time Slots 07:00 to 21:00 (every 30m)
  const timeSlots = [
    "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
  ];

  const handleToggleFullDay = async () => {
    if (!user?.isAdmin) return;
    const isBlocking = busySlots.length < timeSlots.length;
    const action = isBlocking ? 'bloquear o DIA TODO' : 'liberar o DIA TODO';
    if (!confirm(`Deseja ${action} para ${format(selectedDate, 'dd/MM/yyyy')}?`)) return;

    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`${API_URL}/admin/bulk-toggle-block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          action: isBlocking ? 'block' : 'unblock',
          adminEmail: user.email,
          times: timeSlots
        })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      await handleRefresh();
    } catch (e) {
      alert('Erro ao alterar o dia');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAppointments();
      if (user.isAdmin) {
        fetchAdminAppointments();
      }
    }
  }, [user, view]);

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (selectedBarber) {
      fetchServices();
      fetchBusySlots(selectedDate);
    }
  }, [selectedBarber, selectedDate]);

  const fetchBusySlots = async (date, barber = selectedBarber, ts = Date.now()) => {
    if (!barber) return;
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await fetch(`${API_URL}/appointments/busy-slots?date=${dateStr}&barber_email=${barber.email}&t=${ts}`);
      const data = await res.json();
      setBusySlots(data || []);
    } catch (e) {
      console.error('Failed to fetch busy slots');
    }
  };

  const fetchBarbers = async () => {
    try {
      const res = await fetch(`${API_URL}/barbers`);
      const data = await res.json();
      setBarbers(data || []);
      // Auto-select if there's only one or if it was Celso before
      if (data && data.length === 1) setSelectedBarber(data[0]);
    } catch (e) { console.error('Failed to fetch barbers'); }
  };

  const [sheetView, setSheetView] = useState('main'); // 'main' or 'status'

  const fetchServices = async (ts = '') => {
    try {
      const url = selectedBarber ? `${API_URL}/services?barber_email=${selectedBarber.email}&t=${ts}` : `${API_URL}/services?t=${ts}`;
      const res = await fetch(url);
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

  const fetchAppointments = async (ts = '') => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/appointments?_t=${ts || Date.now()}`, {
        headers: { 'X-User-Email': user.email }
      });
      const data = await res.json();
      setAppointments(data || []);
    } catch (e) {
      console.error('Failed to fetch appointments');
    }
  };

  const fetchAdminAppointments = async (ts = '') => {
    if (!user?.isAdmin) return;
    try {
      const res = await fetch(`${API_URL}/admin/appointments?_t=${ts || Date.now()}`, {
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
        const finalUser = {
          name: data.user.name,
          email: data.user.email,
          picture: data.user.picture,
          isAdmin: data.user.isAdmin,
          isMaster: data.user.isMaster,
          phone: data.user.phone
        };
        setUser(finalUser);
        localStorage.setItem('barber_user', JSON.stringify(finalUser));
        if (!data.user.phone) setShowPhoneSetup(true);
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

  const fetchSubscription = async (ts = '') => {
    if (!user?.isAdmin) return;
    try {
      const res = await fetch(`${API_URL}/admin/subscription?t=${ts}`, {
        headers: { 'X-User-Email': user.email }
      });
      const data = await res.json();
      setSubscription(data);

      // Auto-update isMaster if server says so (fixes old sessions)
      if (data.isMaster && !user.isMaster) {
        const updated = { ...user, isMaster: true };
        setUser(updated);
        localStorage.setItem('barber_user', JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Falha ao buscar assinatura');
    }
  };

  const handleMockPay = async () => {
    if (!confirm('Deseja ativar 3 dias de licença grátis para teste?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/subscription/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
      const data = await res.json();
      if (data.success) {
        alert('Licença de teste ativada por 3 dias!');
        fetchSubscription();
      }
    } catch (e) {
      alert('Erro ao ativar licença');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionPayment = async (planId) => {
    setShowPlanSelection(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/subscription/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, planId })
      });
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert('Erro ao gerar link de pagamento Mercado Pago');
      }
    } catch (e) {
      alert('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteToBarber = async () => {
    if (!confirm('Deseja se tornar um Barbeiro parceiro? Você terá 3 dias de licença grátis para gerenciar sua agenda!')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/user/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
      const data = await res.json();
      if (data.success) {
        alert('Parabéns! Você agora é um Barbeiro. Sua agenda está liberada!');
        const updatedUser = { ...user, isAdmin: true, isBarber: true };
        setUser(updatedUser);
        localStorage.setItem('barber_user', JSON.stringify(updatedUser));
        window.location.reload();
      }
    } catch (e) { alert('Erro ao promover usuário'); }
    finally { setLoading(false); }
  };

  const handleRefresh = async () => {
    setLoading(true);
    const ts = Date.now(); // Cache-busting timestamp
    const promises = [
      fetchServices(ts),
      fetchAppointments(ts),
    ];

    if (user?.isAdmin) {
      promises.push(fetchAdminAppointments(ts));
      promises.push(fetchSubscription(ts));
      promises.push(fetchWaStatus());
    }

    if (user?.isMaster) {
      promises.push(fetchMasterData());
    }

    if (selectedDate && selectedBarber) {
      promises.push(fetchBusySlots(selectedDate, selectedBarber, ts));
    }

    try {
      await Promise.all(promises);
      console.log('Dados atualizados:', new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Erro na sincronização:', e);
      // Fallback option: window.location.reload();
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
    const appt = adminAppointments.find(a => a.id === appointmentId);
    if (!appt) return;

    const options = [
      { id: 'pending', label: 'Pendente' },
      { id: 'confirmed', label: 'Confirmado' },
      { id: 'cancelled', label: 'Cancelado' }
    ];

    const message = `Selecione o novo status para ${appt.user_name}:\n\n` +
      options.map((opt, i) => `${i + 1} - ${opt.label}`).join('\n') +
      `\n\nDigite o número da opção:`;

    const choice = prompt(message);
    if (!choice) return;

    const selected = options[parseInt(choice) - 1];
    if (!selected) {
      alert('Opção inválida');
      return;
    }

    const nextStatus = selected.id;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/appointments/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, status: nextStatus, userEmail: user.email })
      });

      if (res.ok) {
        alert(`Status alterado para ${selected.label}. Cliente será notificado.`);
        handleRefresh();
      } else {
        alert('Erro ao atualizar no servidor');
      }
    } catch (e) {
      alert('Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async (time) => {
    if (!user?.isAdmin) return;
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`${API_URL}/admin/toggle-block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, time, adminEmail: user.email })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao alterar status do horário');
        return;
      }

      fetchBusySlots(selectedDate);
      fetchAdminAppointments();
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ou no servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppNotify = (appt) => {
    let phone = appt.user_phone || "";
    const confirmedPhone = prompt(`Enviar WhatsApp para ${appt.user_name}:`, phone);

    if (!confirmedPhone) return;

    const cleanPhone = confirmedPhone.replace(/\D/g, "");
    const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const dateStr = format(parseISO(appt.appointment_date), 'dd/MM/yyyy');
    const text = `Olá ${appt.user_name}! Confirmamos seu agendamento na Barber para o dia ${dateStr} às ${appt.appointment_time} (${appt.service_name}). Até lá!`;

    const url = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleUpdateProfile = async (phone) => {
    setLoading(true);
    try {
      await fetch(`${API_URL}/user/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, phone })
      });
      const updatedUser = { ...user, phone };
      setUser(updatedUser);
      localStorage.setItem('barber_user', JSON.stringify(updatedUser));
      setShowPhoneSetup(false);
    } catch (e) {
      alert('Erro ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (appt) => {
    setEditingAppointment(appt);
    setSelectedService(services.find(s => s.id === appt.service_id));
    setSelectedDate(parseISO(appt.appointment_date));
    setSelectedTime(appt.appointment_time);
    setView('book');
  };

  const handleBooking = async () => {
    if (!selectedService || !selectedTime || !user) return;
    const bookingData = {
      email: user.email,
      barberEmail: selectedBarber.email,
      serviceId: selectedService.id,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedTime,
    };

    setLoading(true);
    try {
      const endpoint = editingAppointment ? '/appointments/update' : '/appointments/book';
      const body = {
        email: user.email,
        userEmail: user.email,
        appointmentId: editingAppointment?.id,
        barberEmail: selectedBarber.email,
        serviceId: selectedService.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        skipPayment: true
      };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        alert(editingAppointment ? 'Agendamento atualizado! O barbeiro foi notificado.' : 'Agendamento realizado com sucesso!');
        setEditingAppointment(null);
        fetchAppointments();
        setView('history');
      } else {
        const data = await res.json();
        alert('Erro: ' + (data.error || 'Desconhecido'));
      }
    } catch (e) {
      alert('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = (appt) => {
    setPaymentSelectionAppt(appt);
  };

  const processPayment = async (type) => {
    const apptId = paymentSelectionAppt.id;
    const isMock = type === 'mock' || type === 'local';
    const methodDesc = type === 'local' ? 'Pagamento Local ($/Cartão)' : 'Simulado/Admin';
    setPaymentSelectionAppt(null);

    setLoading(true);
    try {
      if (type === 'real') {
        const res = await fetch(`${API_URL}/payments/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: apptId, email: user.email })
        });
        const data = await res.json();
        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          alert('Erro ao gerar link de pagamento: ' + (data.error || 'Erro desconhecido'));
        }
      } else {
        const res = await fetch(`${API_URL}/payments/mock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: apptId, email: user.email, method: methodDesc })
        });
        const data = await res.json();
        if (data.success) {
          alert(type === 'local' ? '✅ Pagamento local confirmado!' : '✅ Pagamento de teste confirmado!');
          // Forçar atualização total
          await handleRefresh();
        } else {
          alert('Erro ao confirmar pagamento: ' + (data.error || 'Erro desconhecido'));
        }
      }
    } catch (e) {
      alert('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const renderActionSheet = () => {
    if (!selectedActionAppt) return null;
    const isPending = selectedActionAppt.status === 'pending';

    return (
      <div className="bottom-sheet-overlay" onClick={() => { setSelectedActionAppt(null); setSheetView('main'); }}>
        <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-header"></div>

          {sheetView === 'main' ? (
            <>
              <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Ações para {selectedActionAppt.user_name}</h3>
              <div className="action-list">
                <button className="action-item" onClick={() => { handleEditStart(selectedActionAppt); setSelectedActionAppt(null); }}>
                  <Calendar size={20} className="text-primary" /> Reagendar / Mudar Serviço
                </button>

                {isPending && (
                  <button className="action-item" onClick={() => { handlePayment(selectedActionAppt._id || selectedActionAppt.id); setSelectedActionAppt(null); }}>
                    <CreditCard size={20} className="text-primary" /> Pagar Agora (R$ {selectedActionAppt.price})
                  </button>
                )}

                <button className="action-item" onClick={() => { handleWhatsAppNotify(selectedActionAppt); setSelectedActionAppt(null); }}>
                  <MessageSquare size={20} color="#25D366" /> Enviar WhatsApp
                </button>

                {user.isAdmin && (
                  <>
                    <button className="action-item" onClick={() => setSheetView('status')}>
                      <Edit2 size={20} color="#3498db" /> Alterar Status do Agendamento
                    </button>
                    <button className="action-item" onClick={() => setSheetView('payment')}>
                      <CreditCard size={20} color="#2ecc71" /> Alterar Pagamento
                    </button>
                  </>
                )}

                <button className="action-item danger" onClick={() => {
                  if (confirm('Deseja cancelar este agendamento?')) {
                    handleCancel ? handleCancel(selectedActionAppt.id) : handleDelete(selectedActionAppt.id);
                    setSelectedActionAppt(null);
                  }
                }}>
                  <X size={20} /> Excluir permanentemente
                </button>
              </div>
            </>
          ) : sheetView === 'status' ? (
            <>
              <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Definir Status</h3>
              <div className="action-list">
                {[
                  { id: 'pending', label: 'Pendente', icon: <Edit2 size={18} /> },
                  { id: 'confirmed', label: 'Confirmado', icon: <CheckCircle size={18} /> },
                  { id: 'cancelled', label: 'Cancelado', icon: <X size={18} /> }
                ].map(opt => (
                  <button
                    key={opt.id}
                    className="action-item"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const res = await fetch(`${API_URL}/appointments/update-status`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ appointmentId: selectedActionAppt.id, status: opt.id, userEmail: user.email })
                        });
                        if (res.ok) {
                          handleRefresh();
                          setSelectedActionAppt(null);
                          setSheetView('main');
                        } else {
                          const data = await res.json();
                          alert('Erro ao atualizar no servidor: ' + (data.error || 'Desconhecido'));
                        }
                      } catch (e) { alert('Erro ao atualizar status'); }
                      finally { setLoading(false); }
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
                <button className="action-item" style={{ marginTop: '10px', background: 'rgba(255,255,255,0.05)' }} onClick={() => setSheetView('main')}>
                  <ChevronLeft size={18} /> Voltar
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Alterar Pagamento</h3>
              <div className="action-list">
                <button
                  className="action-item"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await fetch(`${API_URL}/admin/appointments/update-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ appointmentId: selectedActionAppt.id, adminEmail: user.email, status: 'confirmed', paymentId: 'Pagamento Local ($/Cartão)' })
                      });
                      alert('Marcado como PAGO (Local)');
                      handleRefresh();
                      setSelectedActionAppt(null);
                      setSheetView('main');
                    } catch (e) { alert('Erro ao atualizar pagamento'); }
                    finally { setLoading(false); }
                  }}
                >
                  <CheckCircle size={18} color="#2ecc71" /> Marcar como PAGO (Local)
                </button>
                <button
                  className="action-item"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await fetch(`${API_URL}/admin/appointments/update-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ appointmentId: selectedActionAppt.id, adminEmail: user.email, status: 'pending', paymentId: null })
                      });
                      alert('Marcado como PENDENTE');
                      handleRefresh();
                      setSelectedActionAppt(null);
                      setSheetView('main');
                    } catch (e) { alert('Erro ao atualizar pagamento'); }
                    finally { setLoading(false); }
                  }}
                >
                  <Clock size={18} color="rgba(255,255,255,0.4)" /> Marcar como PENDENTE
                </button>
                <button className="action-item" style={{ marginTop: '10px', background: 'rgba(255,255,255,0.05)' }} onClick={() => setSheetView('main')}>
                  <ChevronLeft size={18} /> Voltar
                </button>
              </div>
            </>
          )}

          <button className="btn-close-sheet" onClick={() => { setSelectedActionAppt(null); setSheetView('main'); }}>Fechar</button>
        </div>
      </div>
    );
  };
  if (!user) {
    return (
      <div className="login-screen fade-in">
        <div className="glass-card login-card" style={{ padding: '3rem', textAlign: 'center', width: '100%', maxWidth: '420px' }}>
          <div className="logo-text" style={{ fontSize: '3rem', marginBottom: '1rem' }}>✂️ Barber</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>O melhor corte da sua vida, a um clique de distância.</p>

          {!showManualLogin ? (
            <>
              <div id="googleBtn" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}></div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>ou continue com seus dados</p>
              <button
                className="btn-primary"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'white', display: 'flex', gap: '10px', justifyContent: 'center' }}
                onClick={() => setShowManualLogin(true)}
              >
                <User size={18} /> Entrar com E-mail e Telefone
              </button>
            </>
          ) : (
            <form onSubmit={handleManualLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input name="name" type="text" placeholder="Seu Nome" className="glass-card" style={{ padding: '1rem', width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '12px' }} required />
              <input name="email" type="email" placeholder="E-mail" className="glass-card" style={{ padding: '1rem', width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '12px' }} required />
              <input name="phone" type="tel" placeholder="WhatsApp (ex: 11999999999)" className="glass-card" style={{ padding: '1rem', width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '12px' }} required />
              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar agora'}
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.9rem' }}
                onClick={() => setShowManualLogin(false)}
              >
                <ChevronLeft size={16} /> Voltar para Login Google
              </button>
            </form>
          )}

          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Ao entrar você concorda com nossos termos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      {showPhoneSetup && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{ textAlign: 'center' }}>
            <MessageSquare size={48} className="text-primary" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ marginBottom: '1rem' }}>Falta pouco!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Para agendar seus horários, precisamos do seu número de WhatsApp para confirmações.
            </p>
            <input
              type="tel"
              placeholder="(11) 99999-9999"
              id="phoneInput"
              className="glass-card"
              style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '1.2rem', textAlign: 'center', marginBottom: '1.5rem' }}
            />
            <button
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                const val = document.getElementById('phoneInput').value;
                if (val.length < 10) return alert('Por favor, insira um número válido');
                handleUpdateProfile(val);
              }}
            >
              Salvar e Continuar
            </button>
          </div>
        </div>
      )}

      <header className="header">
        <div>
          <h1 className="logo-text">✂️ Barber</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
            {user.isAdmin && isAdminMode ? 'Relatórios & Gestão' : 'Premium Experience'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          {/* Admin toggle removed as requested */}
        </div>

        <div className="user-nav-group">
          {user.isAdmin && (
            <div className="subscription-badge" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0.3rem 0.8rem',
              background: subscription.daysLeft < 3 ? 'rgba(231, 76, 60, 0.1)' : 'rgba(212, 175, 55, 0.1)',
              borderRadius: '16px',
              fontSize: '0.75rem',
              border: `1px solid ${subscription.daysLeft < 3 ? '#e74c3c' : '#d4af37'}`,
              marginBottom: '0'
            }}>
              <span style={{ color: subscription.daysLeft < 3 ? '#e74c3c' : '#d4af37', fontWeight: 600 }}>
                {subscription.plan && <span style={{ marginRight: '5px', textTransform: 'uppercase', fontSize: '0.6rem', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px' }}>{subscription.plan === 'business' ? 'Shop' : subscription.plan}</span>}
                {subscription.isActive ? `${subscription.daysLeft}d restantes` : 'Expirada!'}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {!subscription.trialUsed && (
                  <button
                    onClick={handleMockPay}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Ativar 3 dias de teste"
                  >
                    Teste 3d
                  </button>
                )}
                <button
                  onClick={() => setShowPlanSelection(true)}
                  style={{
                    background: 'var(--primary)',
                    color: 'black',
                    border: 'none',
                    padding: '3px 10px',
                    borderRadius: '8px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <CreditCard size={10} /> Pagar
                </button>
              </div>
            </div>
          )}

          <nav className="nav-segmented">
            <button
              className={`nav-item-fluid ${view === 'book' ? 'active' : ''}`}
              onClick={() => setView('book')}
            >
              <Plus size={18} /> <span>Agendar</span>
            </button>
            <button
              className={`nav-item-fluid ${view === 'history' ? 'active' : ''}`}
              onClick={() => setView('history')}
            >
              <History size={18} /> <span>Histórico</span>
            </button>
            {user.isAdmin && (
              <button
                className={`nav-item-fluid ${view === 'admin' ? 'active' : ''}`}
                onClick={() => setView('admin')}
              >
                <Shield size={18} /> <span>Admin</span>
              </button>
            )}
          </nav>

          <button
            className="btn-icon"
            onClick={handleRefresh}
            title="Atualizar Dados"
            style={{
              background: loading ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
              borderColor: loading ? 'var(--primary)' : 'var(--border)'
            }}
          >
            <RefreshCw size={20} className={loading ? 'refresh-spin' : ''} style={{ color: loading ? 'var(--primary)' : 'inherit' }} />
          </button>

          <div className="user-avatar" onClick={() => {
            const newPhone = prompt('Deseja alterar seu número de WhatsApp?', user.phone);
            if (newPhone) handleUpdateProfile(newPhone);
          }} title="Editar Perfil" style={{ cursor: 'pointer' }}>
            <img src={user.picture} alt={user.name} />
          </div>

          {!user.isAdmin && (
            <button
              className="btn-primary"
              style={{ fontSize: '0.7rem', padding: '5px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
              onClick={handlePromoteToBarber}
            >
              Quero ser Barbeiro
            </button>
          )}

          <button
            className="btn-icon"
            style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: '1px solid rgba(37, 211, 102, 0.2)' }}
            onClick={() => window.open('https://wa.me/5511972509876', '_blank')}
            title="Falar com Barbeiro"
          >
            <MessageCircle size={20} />
          </button>

          <button className="btn-icon" onClick={handleLogout} title="Sair"><LogOut size={20} /></button>
        </div>
      </header>

      {view === 'admin' && user?.isAdmin && (
        <main className="fade-in">
          {/* MASTER PANEL: Painel de Controle Global */}
          {user?.isMaster && (
            <div style={{ marginBottom: '2rem' }}>
              <div className="glass-card" style={{ padding: '2rem', border: '1px solid var(--primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity className="text-primary" size={24} /> Centro de Controle Master
                  </h2>
                  <button
                    style={{
                      padding: '8px 15px',
                      fontSize: '0.75rem',
                      background: 'rgba(231, 76, 60, 0.1)',
                      color: '#e74c3c',
                      border: '1px solid rgba(231, 76, 60, 0.3)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 700
                    }}
                    onClick={() => {
                      if (confirm('Isso reiniciará todos os robôs ativos. Continuar?')) {
                        handleMasterRestartBot('ALL');
                      }
                    }}
                  >
                    <RefreshCw size={14} /> Reiniciar Sistema Geral
                  </button>
                </div>

                {masterStats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                      <Users size={20} className="text-primary" />
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '5px' }}>{masterStats?.totalUsers?.count || 0}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>USUÁRIOS</div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                      <Shield size={20} className="text-primary" />
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '5px' }}>{masterStats?.activeAdmins?.count || 0}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>ASSINANTES</div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                      <MessageSquare size={20} className="text-primary" />
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '5px' }}>{masterStats?.connectedBots?.count || 0}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>ROBÔS ATIVOS</div>
                    </div>
                    {/* New Plan Stats */}
                    {masterStats?.planCounts?.results?.length > 0 ? (
                      masterStats.planCounts.results.map(p => (
                        <div key={p.plan} className="glass-card" style={{ padding: '1rem', textAlign: 'center', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                          <Shield size={20} className="text-primary" />
                          <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '5px' }}>{p.count}</div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>PLANO {p.plan === 'business' ? 'SHOP' : p.plan}</div>
                        </div>
                      ))
                    ) : (
                      <div className="glass-card" style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>
                        <Shield size={20} className="text-muted" />
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '5px' }}>0</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>PLANOS ATIVOS</div>
                      </div>
                    )}
                    <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                      <Calendar size={20} className="text-primary" />
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '5px' }}>{masterStats?.totalAppointments?.count || 0}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>AGENDAMENTOS</div>
                    </div>
                  </div>
                )}

                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>📊 Gestão Global de Usuários</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '800px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px', width: '240px' }}>Nome / Email</th>
                        <th style={{ padding: '10px', width: '130px' }}>Telefone</th>
                        <th style={{ padding: '10px', width: '90px' }}>Papéis</th>
                        <th style={{ padding: '10px', width: '160px' }}>Plano</th>
                        <th style={{ padding: '10px', width: '140px' }}>Expiração</th>
                        <th style={{ padding: '10px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {masterError ? (
                        <tr>
                          <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#e74c3c' }}>
                            ❌ Erro: {masterError}
                          </td>
                        </tr>
                      ) : masterUsers?.length > 0 ? (
                        masterUsers.map(u => (
                          <tr key={u.email} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <input
                                  type="text"
                                  defaultValue={u.name || ''}
                                  placeholder="Nome"
                                  onBlur={(e) => {
                                    if (e.target.value !== (u.name || '')) {
                                      handleMasterUpdate(u.email, { is_admin: u.is_admin, is_barber: u.is_barber, expires: u.subscription_expires, plan: u.plan, phone: u.phone, newName: e.target.value, newEmail: u.email });
                                    }
                                  }}
                                  style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid var(--border)',
                                    color: 'white',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    width: '100%',
                                    outline: 'none',
                                    padding: '6px 10px',
                                    borderRadius: '8px'
                                  }}
                                />
                                <input
                                  type="email"
                                  defaultValue={u.email || ''}
                                  placeholder="Email"
                                  onBlur={(e) => {
                                    if (e.target.value !== (u.email || '')) {
                                      handleMasterUpdate(u.email, { is_admin: u.is_admin, is_barber: u.is_barber, expires: u.subscription_expires, plan: u.plan, phone: u.phone, newName: u.name, newEmail: e.target.value });
                                    }
                                  }}
                                  style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.7rem',
                                    width: '100%',
                                    outline: 'none',
                                    padding: '4px 10px',
                                    borderRadius: '8px'
                                  }}
                                />
                              </div>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <input
                                type="text"
                                defaultValue={u.phone || ''}
                                placeholder="Sem tel"
                                onBlur={(e) => {
                                  if (e.target.value !== (u.phone || '')) {
                                    handleMasterUpdate(u.email, { is_admin: u.is_admin, is_barber: u.is_barber, expires: u.subscription_expires, plan: u.plan, phone: e.target.value, newName: u.name, newEmail: u.email });
                                  }
                                }}
                                style={{
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid var(--border)',
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  padding: '6px 10px',
                                  borderRadius: '10px',
                                  width: '120px',
                                  outline: 'none'
                                }}
                              />
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    defaultChecked={u.is_admin}
                                    disabled={u.email === 'celsosilvajunior90@gmail.com'}
                                    onChange={(e) => handleMasterUpdate(u.email, { is_admin: e.target.checked, is_barber: u.is_barber, expires: u.subscription_expires, plan: u.plan, phone: u.phone })}
                                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                                  /> Adm
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    defaultChecked={u.is_barber}
                                    onChange={(e) => handleMasterUpdate(u.email, { is_admin: u.is_admin, is_barber: e.target.checked, expires: u.subscription_expires, plan: u.plan, phone: u.phone })}
                                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                                  /> Barb
                                </label>
                              </div>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <select
                                value={u.plan || ''}
                                onChange={(e) => handleMasterUpdate(u.email, { is_admin: u.is_admin, is_barber: u.is_barber, expires: u.subscription_expires, plan: e.target.value, phone: u.phone })}
                                style={{
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid var(--border)',
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  padding: '6px 10px',
                                  borderRadius: '10px',
                                  width: '100%',
                                  cursor: 'pointer',
                                  outline: 'none',
                                  colorScheme: 'dark'
                                }}
                              >
                                <option value="" style={{ color: '#000', background: '#fff' }}>Sem Plano</option>
                                <option value="pro" style={{ color: '#000', background: '#fff' }}>Pro AI</option>
                                <option value="business" style={{ color: '#000', background: '#fff' }}>Barber Shop</option>
                                {u.plan && u.plan !== 'pro' && u.plan !== 'business' && (
                                  <option value={u.plan} style={{ color: '#000', background: '#fff' }}>{u.plan} (Antigo)</option>
                                )}
                              </select>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <input
                                type="date"
                                value={u.subscription_expires ? u.subscription_expires.split('T')[0] : ''}
                                onChange={(e) => handleMasterUpdate(u.email, { is_admin: u.is_admin, is_barber: u.is_barber, expires: e.target.value ? new Date(e.target.value).toISOString() : null, plan: u.plan, phone: u.phone })}
                                style={{
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid var(--border)',
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  padding: '6px 10px',
                                  borderRadius: '10px',
                                  width: '100%',
                                  outline: 'none',
                                  colorScheme: 'dark'
                                }}
                              />
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: u.wa_status === 'connected' ? '#2ecc71' : '#e74c3c',
                                  boxShadow: u.wa_status === 'connected' ? '0 0 8px #2ecc71' : 'none'
                                }} title={u.wa_status || 'desconectado'} />

                                <button
                                  onClick={() => handleMasterDelete(u.email)}
                                  disabled={u.email === 'celsosilvajunior90@gmail.com'}
                                  style={{
                                    background: 'rgba(231, 76, 60, 0.15)',
                                    border: '1px solid rgba(231, 76, 60, 0.3)',
                                    color: '#e74c3c',
                                    padding: '6px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    opacity: u.email === 'celsosilvajunior90@gmail.com' ? 0.3 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  title="Deletar Usuário"
                                >
                                  <Trash2 size={14} />
                                </button>

                                <button
                                  onClick={() => handleMasterRestartBot(u.email)}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--border)',
                                    color: 'white',
                                    padding: '6px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  title="Reiniciar Robô"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {user?.isBarber && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <History className="text-primary" /> Agendamentos Ativos
                </h2>
                <div className="glass-card" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                  Total: <span className="text-primary" style={{ fontWeight: 800 }}>{adminAppointments.filter(a => a.status !== 'blocked').length}</span>
                </div>
              </div>
              {adminAppointments.filter(a => a.status !== 'blocked').length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', marginBottom: '2rem' }}>
                  <History size={48} style={{ color: 'var(--border)', marginBottom: '1rem' }} />
                  <p>Nenhum agendamento ativo.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '3rem' }}>
                  {adminAppointments.filter(a => a.status !== 'blocked').map(a => (
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            {(a.payment_status === 'confirmed' || a.status === 'confirmed') ? (
                              <span style={{ background: 'rgba(46, 204, 113, 0.2)', color: '#2ecc71', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>PAGO</span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⏳ Pagamento pendente</span>
                                <button
                                  className="btn-primary"
                                  style={{ fontSize: '0.65rem', padding: '2px 8px', height: 'auto', minHeight: 'unset' }}
                                  onClick={() => handlePayment(a)}
                                >
                                  Pagar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div className={`status-tag status-${a.status}`} style={{ fontSize: '0.7rem' }}>
                          {a.status === 'confirmed' ? 'Confirmado' : (a.status === 'cancelled' ? 'Cancelado' : 'Pendente')}
                        </div>
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon" style={{ padding: '4px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }} onClick={() => setSelectedActionAppt(a)} title="Gerenciar Agendamento"><Edit2 size={14} /></button>
                          <button className="btn-icon" style={{ padding: '4px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }} onClick={() => handleDelete(a.id)} title="Excluir"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Lock className="text-primary" size={24} /> Configurar Agenda
                  </h2>
                  <button
                    className="btn-primary"
                    style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', background: busySlots.length >= timeSlots.length ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: busySlots.length >= timeSlots.length ? '#2ecc71' : '#e74c3c', border: '1px solid currentColor' }}
                    onClick={handleToggleFullDay}
                  >
                    {busySlots.length >= timeSlots.length ? 'Liberar Dia Todo' : 'Bloquear Dia Todo'}
                  </button>
                </div>
                <div className="date-list">
                  {[...Array(14)].map((_, i) => {
                    const date = addDays(startOfToday(), i);
                    const isActive = isSameDay(selectedDate, date);
                    return (
                      <button
                        key={i}
                        className={`date-card ${isActive ? 'active' : ''}`}
                        onClick={() => setSelectedDate(date)}
                        style={isActive && busySlots.length >= timeSlots.length ? { background: 'rgba(231, 76, 60, 0.15)', borderColor: 'var(--danger)' } : {}}
                      >
                        <div className="day-name">{format(date, 'eee', { locale: ptBR })}</div>
                        <div className="day-number">{format(date, 'dd')}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="time-slots">
                  {timeSlots.map(t => {
                    const isBusy = busySlots.find(b => b.time === t);
                    const isBlocked = isBusy?.status === 'blocked';
                    const isBooked = isBusy && isBusy.status !== 'blocked';

                    // Ocultar horários passados se for hoje
                    if (isSameDay(selectedDate, startOfToday())) {
                      const [h, m] = t.split(':').map(Number);
                      const slotTime = new Date();
                      slotTime.setHours(h, m, 0, 0);
                      if (slotTime < new Date()) return null;
                    }

                    return (
                      <button
                        key={t}
                        className={`time-slot ${isBlocked ? 'selected' : 'available'}`}
                        style={isBooked ? { opacity: 0.5, cursor: 'not-allowed', background: 'rgba(255,255,255,0.1)' } : {}}
                        onClick={() => !isBooked && handleToggleBlock(t)}
                        title={isBooked ? 'Agendado por Cliente' : (isBlocked ? 'Liberar Horário' : 'Bloquear Horário')}
                      >
                        {t} {isBlocked && <Lock size={12} />}
                      </button>
                    );
                  })}
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  * Clique nos horários para bloqueá-los (dourado) ou liberá-los. Horários acinzentados já possuem agendamentos.
                </p>
              </div>

              <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem', border: waStatus.status === 'connected' ? '1px solid #2ecc71' : '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MessageSquare className="text-primary" size={24} /> Robô de WhatsApp
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: waStatus.status === 'connected' ? '#2ecc71' : (waStatus.status === 'awaiting_qr' ? '#f1c40f' : '#e74c3c') }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      {waStatus.status === 'connected' ? 'Conectado' : (waStatus.status === 'awaiting_qr' ? 'Aguardando Escaneamento' : 'Desconectado')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {waStatus.status === 'awaiting_qr' && waStatus.qr ? (
                    <div style={{ textAlign: 'center', background: 'white', padding: '1rem', borderRadius: '12px' }}>
                      <img src={waStatus.qr} alt="WhatsApp QR Code" style={{ width: '200px', height: '200px' }} />
                      <p style={{ color: 'black', fontSize: '0.7rem', marginTop: '0.5rem', fontWeight: 800 }}>ESCANEIE COM SEU WHATSAPP</p>
                    </div>
                  ) : (
                    <div style={{ flex: 1, minWidth: '250px' }}>
                      {waStatus.status === 'connected' ? (
                        <p style={{ color: 'var(--text-muted)' }}>
                          ✅ Seu robô está ativo e respondendo aos clientes automaticamente através da IA do Mestre Leo.
                        </p>
                      ) : (
                        <p style={{ color: 'var(--text-muted)' }}>
                          O robô está desligado. Para ativar, certifique-se que o servidor ponte está rodando em sua máquina. O QR Code aparecerá aqui automaticamente.
                        </p>
                      )}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                      <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Dicas:</h4>
                      <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '1.2rem' }}>
                        <li>Use o WhatsApp Business para melhores resultados.</li>
                        <li>A IA responde dúvidas sobre preços e horários.</li>
                        <li>Clientes podem agendar digitando "1".</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      )
      }

      {
        view === 'book' && (
          <main>
            {!selectedBarber ? (
              <section style={{ marginBottom: '3rem' }}>
                <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <User className="text-primary" /> Escolha seu Barbeiro
                </h2>
                <div className="service-grid">
                  {barbers.map(b => (
                    <div
                      key={b.email}
                      className="glass-card service-card"
                      onClick={() => setSelectedBarber(b)}
                      style={{ textAlign: 'center' }}
                    >
                      <img src={b.picture} alt={b.name} style={{ width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 1rem', border: '2px solid var(--primary)' }} />
                      <h3 style={{ fontSize: '1.2rem' }}>{b.name}</h3>
                      <button className="btn-primary" style={{ marginTop: '1rem', width: '100%' }}>Escolher</button>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
                  <button className="btn-icon" onClick={() => { setSelectedBarber(null); setSelectedService(null); }}>
                    <ChevronLeft size={20} />
                  </button>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Agendando com: </span>
                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{selectedBarber?.name || 'Barbeiro'}</span>
                </div>

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

                  <div className="date-list">
                    {[...Array(14)].map((_, i) => {
                      const date = addDays(startOfToday(), i);
                      const isActive = isSameDay(selectedDate, date);
                      return (
                        <button
                          key={i}
                          className={`date-card ${isActive ? 'active' : ''}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          <div className="day-name">{format(date, 'eee', { locale: ptBR })}</div>
                          <div className="day-number">{format(date, 'dd')}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="time-slots">
                    {timeSlots.map(t => {
                      const isBusy = busySlots.find(b => b.time === t);
                      const isSelected = selectedTime === t;

                      // Ocultar horários passados se for hoje
                      if (isSameDay(selectedDate, startOfToday())) {
                        const [h, m] = t.split(':').map(Number);
                        const slotTime = new Date();
                        slotTime.setHours(h, m, 0, 0);
                        if (slotTime < new Date()) return null;
                      }

                      return (
                        <button
                          key={t}
                          className={`time-slot ${isSelected ? 'selected' : (isBusy ? 'occupied' : 'available')}`}
                          onClick={() => !isBusy && setSelectedTime(t)}
                          disabled={isBusy}
                          title={isBusy ? 'Horário Ocupado' : 'Horário Disponível'}
                        >
                          {t}
                        </button>
                      );
                    })}
                    {timeSlots.every(t => {
                      // Check if time is past
                      if (isSameDay(selectedDate, startOfToday())) {
                        const [h, m] = t.split(':').map(Number);
                        const slotTime = new Date();
                        slotTime.setHours(h, m, 0, 0);
                        if (slotTime < new Date()) return true; // Considered "busy" (unavailable)
                      }
                      // Check if time is in busySlots
                      const isBusy = busySlots.find(b => b.time === t && b.status !== 'cancelled');
                      return isBusy;
                    }) && (
                        <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                          😔 Dia sem horários disponíveis. Tente outro dia!
                        </div>
                      )}

                  </div>

                  <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Resumo {editingAppointment && '(Editando)'}:</p>
                      <h3 style={{ fontSize: '1.1rem' }}>
                        {selectedService ? selectedService.name : 'Selecione um serviço'}
                        {selectedTime && ` às ${selectedTime}`}
                      </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {editingAppointment && (
                        <button className="btn-icon" onClick={() => { setEditingAppointment(null); setView('history'); }} title="Cancelar Edição">
                          <X size={20} />
                        </button>
                      )}
                      <button
                        className="btn-primary"
                        disabled={!selectedService || !selectedTime || loading}
                        onClick={handleBooking}
                        style={user?.isAdmin ? { background: 'linear-gradient(135deg, #2ecc71, #27ae60)', borderColor: '#27ae60' } : {}}
                      >
                        {loading ? 'Processando...' : (
                          user?.isAdmin ?
                            <><CheckCircle size={20} /> Salvar Agendamento (Admin)</> :
                            <><Calendar size={20} /> {editingAppointment ? 'Salvar Alterações' : 'Agendar Agora'}</>
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </main>
        )
      }

      {
        view === 'history' && (
          <main className="fade-in">
            <h2 style={{ marginBottom: '2rem' }}>Meus Agendamentos</h2>
            {appointments.length === 0 ? (
              <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
                <History size={48} style={{ color: 'var(--border)', marginBottom: '1rem' }} />
                <p>Você ainda não possui agendamentos.</p>
                <button className="btn-primary" onClick={() => setView('book')} style={{ margin: '1.5rem auto' }}>Agendar Agora</button>
              </div>
            ) : (
              appointments.map(a => {
                const isProfessional = a.barber_email === user.email; // If I am the barber
                const displayTitle = isProfessional ? `Cliente: ${a.client_name || a.user_name || 'Cliente'}` : a.service_name;
                const displaySubtitle = isProfessional ? `${a.service_name} às ${a.appointment_time}` : `${a.appointment_time} - com ${a.barber_name}`;
                const displayPicture = isProfessional ? (a.client_picture || a.user_picture) : a.barber_picture;
                const isPaid = a.payment_status === 'confirmed' || a.status === 'confirmed';
                const canManage = !isPaid && a.status !== 'cancelled' && a.status !== 'blocked';

                return (
                  <div key={a.id} className="glass-card appointment-item" style={{
                    borderLeft: isProfessional ? '4px solid var(--primary)' : (a.status === 'confirmed' ? '4px solid var(--success)' : '4px solid rgba(255,255,255,0.1)'),
                    background: isProfessional ? 'rgba(212, 175, 55, 0.05)' : 'var(--card-bg)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1, minWidth: '200px' }}>
                        <div style={{ background: 'var(--accent)', padding: '0.6rem', borderRadius: '12px', textAlign: 'center', minWidth: '55px' }}>
                          <div style={{ fontSize: '0.65rem' }}>{format(parseISO(a.appointment_date), 'MMM', { locale: ptBR }).toUpperCase()}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 800 }}>{format(parseISO(a.appointment_date), 'dd')}</div>
                        </div>
                        <div className="user-avatar" style={{ width: '40px', height: '40px' }}>
                          <img src={displayPicture || user.picture} alt="Avatar" />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ color: isProfessional ? 'var(--text-main)' : 'var(--primary)', fontSize: '1rem' }}>{displayTitle}</h3>
                            {isPaid && (
                              <span style={{ background: 'rgba(46, 204, 113, 0.2)', color: '#2ecc71', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>PAGO</span>
                            )}
                            {isProfessional && <span className="admin-badge">BARBEIRO</span>}
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{displaySubtitle}</p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                        <div className={`status-tag status-${a.status}`}>
                          {a.status === 'confirmed' ? 'Confirmado' : (a.status === 'cancelled' ? 'Cancelado' : 'Pendente')}
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {canManage && (
                            <button className="btn-icon" style={{ padding: '6px', opacity: 0.9 }} onClick={() => setSelectedActionAppt(a)} title="Gerenciar"><Edit2 size={16} /></button>
                          )}
                          {!isPaid && (
                            <button className="btn-icon" style={{ padding: '6px', opacity: 0.7, color: 'var(--danger)' }} onClick={() => handleDelete(a.id)} title="Excluir"><Trash2 size={16} /></button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Bar for Pending Appointments */}
                    {a.status === 'pending' && !isPaid && (!isProfessional || user.isAdmin) && (
                      <div className="btn-group-responsive" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <button
                          className="btn-primary"
                          style={{ flex: 2, justifyContent: 'center' }}
                          onClick={() => handlePayment(a)}
                          disabled={loading}
                        >
                          <CreditCard size={18} /> Pagar Agora (R$ {a.price})
                        </button>
                        <button
                          className="btn-icon"
                          style={{ flex: 1, height: 'auto', borderRadius: '12px', border: '1px solid var(--danger)', color: 'var(--danger)', justifyContent: 'center' }}
                          onClick={() => handleCancel(a.id)}
                          disabled={loading}
                        >
                          <X size={18} /> Cancelar
                        </button>
                      </div>
                    )}

                    {isProfessional && !isPaid && a.status === 'pending' && (
                      <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: '0.8rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        ⏳ Aguardando confirmação ou pagamento do cliente
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </main>
        )
      }

      {renderActionSheet()}

      {/* Menu de Opções de Pagamento (Control List style) */}
      {
        paymentSelectionAppt && (
          <div className="bottom-sheet-overlay" onClick={() => setPaymentSelectionAppt(null)}>
            <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-header"></div>
              <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Como deseja pagar?</h3>
              <div className="action-list">
                <button className="action-item" onClick={() => processPayment('real')}>
                  <div style={{ background: 'rgba(212, 175, 55, 0.1)', padding: '10px', borderRadius: '12px' }}>
                    <CreditCard size={24} color="var(--primary)" />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 800 }}>Pagamento Real</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PIX ou Cartão via Mercado Pago</div>
                  </div>
                </button>

                <button className="action-item" style={{ borderColor: 'rgba(46, 204, 113, 0.2)' }} onClick={() => processPayment('local')}>
                  <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '10px', borderRadius: '12px' }}>
                    <Shield size={24} color="#2ecc71" />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, color: '#2ecc71' }}>Pagamento no Local</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dinheiro ou Cartão na Barbearia</div>
                  </div>
                </button>

                <button className="action-item" style={{ opacity: 0.5 }} onClick={() => processPayment('mock')}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '10px', borderRadius: '12px' }}>
                    <RefreshCw size={24} color="white" />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 800 }}>Simular Online</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Apenas para teste rápido</div>
                  </div>
                </button>

                <button className="btn-close-sheet" onClick={() => setPaymentSelectionAppt(null)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        showPlanSelection && (
          <div className="modal-overlay" onClick={() => setShowPlanSelection(false)}>
            <div className="glass-card fade-in" style={{ width: '90%', maxWidth: '450px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <Shield size={48} className="text-primary" style={{ marginBottom: '1rem' }} />
                <h2>Escolha seu Plano</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Selecione o plano ideal para sua barbearia</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

                <div className="action-item" onClick={() => handleSubscriptionPayment('pro')} style={{ cursor: 'pointer', border: '1px solid var(--primary)', background: 'rgba(212, 175, 55, 0.05)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      Pro AI <span style={{ fontSize: '0.6rem', background: 'var(--primary)', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>POPULAR</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mestre Leo AI + Pagamentos</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: 'var(--primary)' }}>R$ 119,90</div>
                    <div style={{ fontSize: '0.7rem' }}>/mês</div>
                  </div>
                </div>

                <div className="action-item" onClick={() => handleSubscriptionPayment('business')} style={{ cursor: 'pointer', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Barber Shop</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Múltiplos Barbeiros + Equipes</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: 'var(--primary)' }}>R$ 189,90</div>
                    <div style={{ fontSize: '0.7rem' }}>/mês</div>
                  </div>
                </div>

                <button className="btn-close-sheet" onClick={() => setShowPlanSelection(false)} style={{ marginTop: '1rem' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

export default App;
