const mongoose = require('mongoose');
require('dotenv').config();
const { User } = require('../backend/models/userModel');
const { Auth } = require('../backend/models/authModel');

const { STAFF_NAME, STAFF_LASTNAME, STAFF_EMAIL, STAFF_PASSWORD, STAFF_ROLE } = process.env;
const role = (STAFF_ROLE || '').toUpperCase();

if (![STAFF_NAME, STAFF_LASTNAME, STAFF_EMAIL, STAFF_PASSWORD].every(Boolean) || !['MEDICO', 'ADMINISTRATOR'].includes(role)) {
  console.error('Configura STAFF_NAME, STAFF_LASTNAME, STAFF_EMAIL, STAFF_PASSWORD y STAFF_ROLE (MEDICO o ADMINISTRATOR).');
  process.exit(1);
}

async function createStaffAccount() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pharmacy');
  const email = STAFF_EMAIL.trim().toLowerCase();
  if (await Auth.exists({ email })) throw new Error('Ya existe una cuenta con ese correo.');

  const profile = await User.create({ name: STAFF_NAME.trim(), lastname: STAFF_LASTNAME.trim() });
  try {
    await Auth.create({
      email,
      password: STAFF_PASSWORD,
      user_id: profile._id,
      role,
      doc_model: 'User'
    });
    console.log(`Cuenta ${role} creada para ${email}.`);
  } catch (error) {
    await User.deleteOne({ _id: profile._id });
    throw error;
  }
}

createStaffAccount()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
