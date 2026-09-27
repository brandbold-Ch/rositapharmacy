const mongoose = require('mongoose');
const { Schema } = mongoose;

const patientSchema = new Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  birthDate: { type: Date, default: null },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  address: { type: String, trim: true, default: '' },
  allergies: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const appointmentSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: String, required: true, trim: true },
  doctorEmail: { type: String, required: true, lowercase: true, trim: true },
  startsAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 30, min: 10, max: 180 },
  reason: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['Programada', 'Completada', 'Cancelada'], default: 'Programada' }
}, { timestamps: true });
appointmentSchema.index({ doctorEmail: 1, startsAt: 1, status: 1 });

const consultationSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
  appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null },
  doctor: { type: String, required: true, trim: true },
  doctorEmail: { type: String, required: true, lowercase: true, trim: true },
  date: { type: Date, default: Date.now },
  reason: { type: String, trim: true, default: '' },
  diagnosis: { type: String, required: true, trim: true },
  treatment: { type: String, trim: true, default: '' },
  bloodPressure: { type: String, trim: true, default: '' },
  heartRate: { type: Number, min: 0, default: null },
  temperature: { type: Number, min: 0, default: null },
  weight: { type: Number, min: 0, default: null },
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

const prescriptionSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
  consultation: { type: Schema.Types.ObjectId, ref: 'Consultation', default: null },
  doctor: { type: String, required: true, trim: true },
  doctorEmail: { type: String, required: true, lowercase: true, trim: true },
  issuedAt: { type: Date, default: Date.now },
  items: [{
    medication: { type: String, required: true, trim: true },
    dose: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true },
    duration: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, default: '' }
  }],
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

const medicationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  activeIngredient: { type: String, trim: true, default: '' },
  presentation: { type: String, trim: true, default: '' },
  lot: { type: String, trim: true, default: '' },
  stock: { type: Number, required: true, min: 0, default: 0 },
  minimumStock: { type: Number, min: 0, default: 10 },
  expiresAt: { type: Date, default: null },
  price: { type: Number, min: 0, default: 0 }
}, { timestamps: true });
medicationSchema.index({ name: 1, lot: 1 }, { unique: true });

module.exports = {
  Patient: mongoose.models.Patient || mongoose.model('Patient', patientSchema),
  Appointment: mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema),
  Consultation: mongoose.models.Consultation || mongoose.model('Consultation', consultationSchema),
  Prescription: mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema),
  Medication: mongoose.models.Medication || mongoose.model('Medication', medicationSchema)
};
