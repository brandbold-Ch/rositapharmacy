const express = require('express');
const { Auth } = require('../backend/models/authModel');
const {
  Patient,
  Appointment,
  Consultation,
  Prescription,
  Medication
} = require('../backend/models/clinicalModels');
const { User } = require('../backend/models/userModel');

const router = express.Router();
const staffRoles = ['MEDICO', 'ADMINISTRATOR'];
const adminRoles = ['ADMINISTRATOR'];

function requireRoles(roles) {
  return async function(req, res, next) {
    const authId = req.signedCookies.auth_id;
    if (!authId) return res.redirect('/login');

    try {
      const account = await Auth.findById(authId).lean();
      if (!account || !roles.includes(account.role)) {
        return res.status(403).render('error', {
          message: 'Acceso restringido al personal autorizado',
          error: { status: 403 }
        });
      }
      account.name = req.account?.name || account.email;
      req.staff = account;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function page(res, section, data = {}) {
  return res.render('portal', {
    section,
    data,
    notice: typeof res.req.query.notice === 'string' ? res.req.query.notice : '',
    error: typeof res.req.query.error === 'string' ? res.req.query.error : ''
  });
}

function redirectWithMessage(res, path, key, message) {
  const separator = path.includes('?') ? '&' : '?';
  return res.redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function listValues(value) {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function validObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value || '');
}

async function resolveAccountPatient(account) {
  let patient = await Patient.findOne({ email: account.email, active: true });
  if (patient) return patient;

  const profile = await User.findById(account.user_id).lean();
  if (!profile) return null;
  patient = await Patient.create({
    firstName: profile.name,
    lastName: profile.lastname,
    email: account.email
  });
  return patient;
}

function appointmentScheduleFilter(account) {
  return account.role === 'ADMINISTRATOR' ? {} : { doctorEmail: account.email };
}

router.use('/my-appointments', requireRoles(['USER']));
router.use([
  '/dashboard',
  '/patients',
  '/appointments',
  '/consultations',
  '/history',
  '/prescriptions',
  '/inventory'
], requireRoles(staffRoles));

router.get('/my-appointments', async (req, res, next) => {
  try {
    const patient = await resolveAccountPatient(req.staff);
    if (!patient) return res.status(400).render('error', { message: 'No se encontró el perfil de usuario.', error: { status: 400 } });
    const [appointments, doctors] = await Promise.all([
      Appointment.find({ patient: patient._id }).sort({ startsAt: -1 }).populate('patient').lean(),
      Auth.find({ role: 'MEDICO', doc_model: 'User' }).populate('user_id').lean()
    ]);
    return page(res, 'myAppointments', {
      appointments,
      doctors: doctors.map((doctor) => ({
        email: doctor.email,
        name: doctor.user_id ? `${doctor.user_id.name} ${doctor.user_id.lastname}` : doctor.email
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/my-appointments', async (req, res, next) => {
  const { doctorEmail, startsAt, durationMinutes, reason } = req.body;
  const start = new Date(startsAt);
  const duration = Number(durationMinutes) || 30;
  if (!Number.isFinite(start.getTime()) || start <= new Date()) {
    return redirectWithMessage(res, '/my-appointments', 'error', 'Selecciona una fecha futura válida.');
  }
  if (start.getDay() === 0 || start.getDay() === 6) return redirectWithMessage(res, '/my-appointments', 'error', 'Las citas solo se agendan de lunes a viernes.');
  if (duration < 10 || duration > 180) return redirectWithMessage(res, '/my-appointments', 'error', 'La duración debe ser de 10 a 180 minutos.');
  const end = new Date(start.getTime() + duration * 60000);
  const opening = new Date(start);
  opening.setHours(8, 0, 0, 0);
  const closing = new Date(start);
  closing.setHours(20, 0, 0, 0);
  if (start < opening || end > closing) return redirectWithMessage(res, '/my-appointments', 'error', 'Las citas deben quedar dentro del horario de 08:00 a 20:00.');

  try {
    const doctor = await Auth.findOne({ email: doctorEmail, role: 'MEDICO', doc_model: 'User' }).populate('user_id').lean();
    if (!doctor) return redirectWithMessage(res, '/my-appointments', 'error', 'Selecciona un médico válido.');
    const patient = await resolveAccountPatient(req.staff);
    if (!patient) return redirectWithMessage(res, '/my-appointments', 'error', 'No se encontró tu perfil de paciente.');

    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const existing = await Appointment.find({
      doctorEmail: doctor.email,
      startsAt: { $gte: dayStart, $lt: dayEnd },
      status: 'Programada'
    }).select('startsAt durationMinutes').lean();
    const overlaps = existing.some((appointment) => {
      const existingEnd = new Date(appointment.startsAt.getTime() + appointment.durationMinutes * 60000);
      return start < existingEnd && end > appointment.startsAt;
    });
    if (overlaps) return redirectWithMessage(res, '/my-appointments', 'error', 'Ese horario ya está ocupado. Elige otro.');

    await Appointment.create({
      patient: patient._id,
      doctor: doctor.user_id ? `${doctor.user_id.name} ${doctor.user_id.lastname}` : doctor.email,
      doctorEmail: doctor.email,
      startsAt: start,
      durationMinutes: duration,
      reason
    });
    return redirectWithMessage(res, '/my-appointments', 'notice', 'Cita agendada correctamente.');
  } catch (error) {
    return next(error);
  }
});

router.post('/my-appointments/:id/cancel', async (req, res, next) => {
  if (!validObjectId(req.params.id)) return redirectWithMessage(res, '/my-appointments', 'error', 'Cita no válida.');
  try {
    const patient = await resolveAccountPatient(req.staff);
    const appointment = await Appointment.findOne({ _id: req.params.id, patient: patient?._id, status: 'Programada', startsAt: { $gt: new Date() } });
    if (!appointment) return redirectWithMessage(res, '/my-appointments', 'error', 'La cita no existe o ya no se puede cancelar.');
    appointment.status = 'Cancelada';
    await appointment.save();
    return redirectWithMessage(res, '/my-appointments', 'notice', 'Cita cancelada.');
  } catch (error) {
    return next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const lowStock = await Medication.countDocuments({ $expr: { $lte: ['$stock', '$minimumStock'] } });
    const expiryLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiring = await Medication.countDocuments({ expiresAt: { $ne: null, $lte: expiryLimit } });
    const [patientCount, appointmentCount, consultationCount, upcoming, monthlyConsultations, lowStockItems, expiringItems] = await Promise.all([
      Patient.countDocuments({ active: true }),
      Appointment.countDocuments({ startsAt: { $gte: now }, status: 'Programada' }),
      Consultation.countDocuments(),
      Appointment.find({ startsAt: { $gte: now, $lte: soon }, status: 'Programada' }).sort({ startsAt: 1 }).limit(8).populate('patient').lean(),
      Consultation.find({ date: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } }).select('date').lean(),
      Medication.find({ $expr: { $lte: ['$stock', '$minimumStock'] } }).sort({ stock: 1 }).limit(5).lean(),
      Medication.find({ expiresAt: { $ne: null, $lte: expiryLimit } }).sort({ expiresAt: 1 }).limit(5).lean()
    ]);
    const chart = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const count = monthlyConsultations.filter((item) => item.date.getFullYear() === date.getFullYear() && item.date.getMonth() === date.getMonth()).length;
      return { label: date.toLocaleDateString('es-MX', { month: 'short' }), count };
    });
    return page(res, 'dashboard', {
      metrics: { patientCount, appointmentCount, consultationCount, lowStock, expiring },
      upcoming,
      chart,
      lowStockItems,
      expiringItems
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/patients', async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const filter = { active: true };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escapedSearch, 'i');
      filter.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { phone: pattern },
        { email: pattern }
      ];
    }
    const patients = await Patient.find(filter).sort({ lastName: 1, firstName: 1 }).lean();
    const selectedPatient = validObjectId(req.query.edit) ? await Patient.findOne({ _id: req.query.edit, active: true }).lean() : null;
    return page(res, 'patients', { patients, selectedPatient, search });
  } catch (error) {
    return next(error);
  }
});

router.post('/patients', async (req, res, next) => {
  const { firstName, lastName, birthDate, phone, email, address, allergies, notes, id } = req.body;
  if (!firstName?.trim() || !lastName?.trim()) return redirectWithMessage(res, '/patients', 'error', 'Nombre y apellidos son obligatorios.');
  try {
    const values = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate || null,
      phone,
      email,
      address,
      allergies,
      notes
    };
    if (id) {
      if (!validObjectId(id)) return redirectWithMessage(res, '/patients', 'error', 'Paciente no válido.');
      await Patient.findOneAndUpdate({ _id: id, active: true }, values, { runValidators: true });
      return redirectWithMessage(res, '/patients', 'notice', 'Paciente actualizado.');
    }
    await Patient.create(values);
    return redirectWithMessage(res, '/patients', 'notice', 'Paciente registrado.');
  } catch (error) {
    return next(error);
  }
});

router.post('/patients/:id/delete', async (req, res, next) => {
  if (!validObjectId(req.params.id)) return redirectWithMessage(res, '/patients', 'error', 'Paciente no válido.');
  try {
    await Patient.findByIdAndUpdate(req.params.id, { active: false });
    return redirectWithMessage(res, '/patients', 'notice', 'Paciente archivado. El historial clínico se conserva.');
  } catch (error) {
    return next(error);
  }
});

router.get('/appointments', async (req, res, next) => {
  try {
    const [appointments, patients] = await Promise.all([
      Appointment.find(appointmentScheduleFilter(req.staff)).sort({ startsAt: 1 }).populate('patient').lean(),
      Patient.find({ active: true }).sort({ lastName: 1, firstName: 1 }).lean()
    ]);
    return page(res, 'appointments', { appointments, patients });
  } catch (error) {
    return next(error);
  }
});

router.post('/appointments', async (req, res, next) => {
  const { patientId, startsAt, durationMinutes, reason } = req.body;
  const start = new Date(startsAt);
  const duration = Number(durationMinutes) || 30;
  if (!validObjectId(patientId) || Number.isNaN(start.getTime()) || start <= new Date()) {
    return redirectWithMessage(res, '/appointments', 'error', 'Selecciona un paciente y una fecha futura válida.');
  }
  if (start.getDay() === 0 || start.getDay() === 6) return redirectWithMessage(res, '/appointments', 'error', 'Las citas solo se agendan de lunes a viernes.');
  if (duration < 10 || duration > 180) return redirectWithMessage(res, '/appointments', 'error', 'La duración debe ser de 10 a 180 minutos.');
  const end = new Date(start.getTime() + duration * 60000);
  const opening = new Date(start);
  opening.setHours(8, 0, 0, 0);
  const closing = new Date(start);
  closing.setHours(20, 0, 0, 0);
  if (start < opening || end > closing) return redirectWithMessage(res, '/appointments', 'error', 'Las citas deben quedar dentro del horario de 08:00 a 20:00.');

  try {
    if (!await Patient.exists({ _id: patientId, active: true })) {
      return redirectWithMessage(res, '/appointments', 'error', 'El paciente no existe o está archivado.');
    }
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const existing = await Appointment.find({
      doctorEmail: req.staff.email,
      startsAt: { $gte: dayStart, $lt: dayEnd },
      status: 'Programada'
    }).select('startsAt durationMinutes').lean();
    const overlaps = existing.some((appointment) => {
      const existingEnd = new Date(appointment.startsAt.getTime() + appointment.durationMinutes * 60000);
      return start < existingEnd && end > appointment.startsAt;
    });
    if (overlaps) return redirectWithMessage(res, '/appointments', 'error', 'Ese horario se cruza con otra cita del médico.');

    await Appointment.create({
      patient: patientId,
      doctor: req.staff.name,
      doctorEmail: req.staff.email,
      startsAt: start,
      durationMinutes: duration,
      reason
    });
    return redirectWithMessage(res, '/appointments', 'notice', 'Cita agendada.');
  } catch (error) {
    return next(error);
  }
});

router.post('/appointments/:id/status', async (req, res, next) => {
  const allowed = ['Programada', 'Completada', 'Cancelada'];
  if (!validObjectId(req.params.id) || !allowed.includes(req.body.status)) {
    return redirectWithMessage(res, '/appointments', 'error', 'No se pudo actualizar la cita.');
  }
  try {
    const appointment = await Appointment.findOne({ _id: req.params.id, ...appointmentScheduleFilter(req.staff) });
    if (!appointment) return redirectWithMessage(res, '/appointments', 'error', 'La cita no existe o no pertenece a tu agenda.');
    appointment.status = req.body.status;
    await appointment.save();
    return redirectWithMessage(res, '/appointments', 'notice', 'Estado de cita actualizado.');
  } catch (error) {
    return next(error);
  }
});

router.get('/consultations', async (req, res, next) => {
  try {
    const selectedAppointment = validObjectId(req.query.appointment)
      ? await Appointment.findOne({
        _id: req.query.appointment,
        status: 'Programada',
        ...appointmentScheduleFilter(req.staff)
      }).populate('patient').lean()
      : null;
    const [consultations, patients, appointments] = await Promise.all([
      Consultation.find(req.staff.role === 'ADMINISTRATOR' ? {} : { doctorEmail: req.staff.email }).sort({ date: -1 }).limit(50).populate('patient').lean(),
      Patient.find({ active: true }).sort({ lastName: 1, firstName: 1 }).lean(),
      Appointment.find({ status: 'Programada', ...appointmentScheduleFilter(req.staff) }).sort({ startsAt: 1 }).populate('patient').lean()
    ]);
    return page(res, 'consultations', { consultations, patients, appointments, selectedAppointment });
  } catch (error) {
    return next(error);
  }
});

router.post('/consultations', async (req, res, next) => {
  const { patientId, appointmentId, reason, diagnosis, treatment, bloodPressure, heartRate, temperature, weight, notes } = req.body;
  if (!validObjectId(patientId) || !diagnosis?.trim()) return redirectWithMessage(res, '/consultations', 'error', 'Selecciona al paciente y captura el diagnóstico.');
  try {
    if (!await Patient.exists({ _id: patientId, active: true })) {
      return redirectWithMessage(res, '/consultations', 'error', 'El paciente no existe o está archivado.');
    }
    const appointmentFilter = validObjectId(appointmentId)
      ? { _id: appointmentId, patient: patientId, status: 'Programada', ...appointmentScheduleFilter(req.staff) }
      : null;
    if (appointmentFilter && !await Appointment.exists(appointmentFilter)) {
      return redirectWithMessage(res, '/consultations', 'error', 'La cita no corresponde al paciente o ya no está programada.');
    }
    const consultation = await Consultation.create({
      patient: patientId,
      appointment: validObjectId(appointmentId) ? appointmentId : null,
      doctor: req.staff.name,
      doctorEmail: req.staff.email,
      reason,
      diagnosis,
      treatment,
      bloodPressure,
      heartRate: heartRate === '' ? null : heartRate,
      temperature: temperature === '' ? null : temperature,
      weight: weight === '' ? null : weight,
      notes
    });
    if (validObjectId(appointmentId)) await Appointment.findByIdAndUpdate(appointmentId, { status: 'Completada' });
    return redirectWithMessage(res, '/history?patient=' + patientId, 'notice', `Consulta registrada (${consultation._id.toString().slice(-6)}).`);
  } catch (error) {
    return next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const filter = validObjectId(req.query.patient) ? { patient: req.query.patient } : {};
    const [consultations, prescriptions, patients] = await Promise.all([
      Consultation.find(filter).sort({ date: -1 }).populate('patient').lean(),
      Prescription.find(filter).sort({ issuedAt: -1 }).populate('patient').lean(),
      Patient.find().sort({ lastName: 1, firstName: 1 }).lean()
    ]);
    return page(res, 'history', { consultations, prescriptions, patients, selectedPatient: req.query.patient || '' });
  } catch (error) {
    return next(error);
  }
});

router.get('/prescriptions', async (req, res, next) => {
  try {
    const [prescriptions, patients, consultations] = await Promise.all([
      Prescription.find().sort({ issuedAt: -1 }).limit(50).populate('patient').lean(),
      Patient.find({ active: true }).sort({ lastName: 1, firstName: 1 }).lean(),
      Consultation.find().sort({ date: -1 }).limit(50).populate('patient').lean()
    ]);
    return page(res, 'prescriptions', { prescriptions, patients, consultations });
  } catch (error) {
    return next(error);
  }
});

router.post('/prescriptions', async (req, res, next) => {
  const { patientId, consultationId, medication, dose, frequency, duration, instructions, notes } = req.body;
  if (!validObjectId(patientId)) return redirectWithMessage(res, '/prescriptions', 'error', 'Selecciona un paciente.');
  const medications = listValues(medication);
  const doses = listValues(dose);
  const frequencies = listValues(frequency);
  const durations = listValues(duration);
  const instructionList = listValues(instructions);
  const items = medications.map((name, index) => ({
    medication: String(name).trim(),
    dose: String(doses[index] || '').trim(),
    frequency: String(frequencies[index] || '').trim(),
    duration: String(durations[index] || '').trim(),
    instructions: String(instructionList[index] || '').trim()
  })).filter((item) => item.medication);
  if (!items.length || items.some((item) => !item.dose || !item.frequency || !item.duration)) {
    return redirectWithMessage(res, '/prescriptions', 'error', 'Cada medicamento debe incluir dosis, frecuencia y duración.');
  }
  try {
    if (!await Patient.exists({ _id: patientId, active: true })) {
      return redirectWithMessage(res, '/prescriptions', 'error', 'El paciente no existe o está archivado.');
    }
    if (validObjectId(consultationId) && !await Consultation.exists({ _id: consultationId, patient: patientId })) {
      return redirectWithMessage(res, '/prescriptions', 'error', 'La consulta seleccionada no corresponde al paciente.');
    }
    await Prescription.create({
      patient: patientId,
      consultation: validObjectId(consultationId) ? consultationId : null,
      doctor: req.staff.name,
      doctorEmail: req.staff.email,
      items,
      notes
    });
    return redirectWithMessage(res, '/prescriptions', 'notice', 'Receta digital guardada.');
  } catch (error) {
    return next(error);
  }
});

router.get('/inventory', async (req, res, next) => {
  try {
    const medications = await Medication.find().sort({ name: 1, lot: 1 }).lean();
    return page(res, 'inventory', { medications, canManage: adminRoles.includes(req.staff.role) });
  } catch (error) {
    return next(error);
  }
});

router.post('/inventory', requireRoles(adminRoles), async (req, res, next) => {
  const { id, name, activeIngredient, presentation, lot, stock, minimumStock, expiresAt, price } = req.body;
  if (!name?.trim() || !lot?.trim() || !Number.isFinite(Number(stock)) || Number(stock) < 0 || !Number.isFinite(Number(minimumStock)) || Number(minimumStock) < 0) {
    return redirectWithMessage(res, '/inventory', 'error', 'Nombre, lote y existencias válidas son obligatorios.');
  }
  try {
    const values = {
      name: name.trim(), activeIngredient, presentation, lot: lot.trim(),
      stock: Number(stock), minimumStock: Number(minimumStock) || 0,
      expiresAt: expiresAt || null, price: Number(price) || 0
    };
    if (id) {
      if (!validObjectId(id)) return redirectWithMessage(res, '/inventory', 'error', 'Medicamento no válido.');
      await Medication.findByIdAndUpdate(id, values, { runValidators: true });
    } else {
      await Medication.create(values);
    }
    return redirectWithMessage(res, '/inventory', 'notice', id ? 'Inventario actualizado.' : 'Medicamento agregado.');
  } catch (error) {
    if (error.code === 11000) return redirectWithMessage(res, '/inventory', 'error', 'Ya existe ese medicamento con el mismo lote.');
    return next(error);
  }
});

router.post('/inventory/:id/delete', requireRoles(adminRoles), async (req, res, next) => {
  if (!validObjectId(req.params.id)) return redirectWithMessage(res, '/inventory', 'error', 'Medicamento no válido.');
  try {
    await Medication.findByIdAndDelete(req.params.id);
    return redirectWithMessage(res, '/inventory', 'notice', 'Medicamento eliminado del inventario.');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
