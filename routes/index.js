const express = require('express');
const bcrypt = require('bcrypt');
const { User } = require('../backend/models/userModel');
const { Auth } = require('../backend/models/authModel');
const router = express.Router();


router.get('/', function(req, res, next) {
  res.render('home');
});

router.get('/login', function(req, res, next) {
  res.render('login', { error: null, notice: null });
});

router.get('/register', function(req, res, next) {
  res.render('register', { error: null });
});

router.post('/register', async function(req, res, next) {
  const { name, lastname, email, password, confirmPassword } = req.body;

  if (![name, lastname, email, password, confirmPassword].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).render('register', { error: 'Completa todos los campos obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).render('register', { error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).render('register', { error: 'Las contraseñas no coinciden.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    if (await Auth.findOne({ email: normalizedEmail })) {
      return res.status(409).render('register', { error: 'Ya existe una cuenta con ese correo.' });
    }

    const user = await User.create({ name: name.trim(), lastname: lastname.trim() });
    try {
      await Auth.create({
        email: normalizedEmail,
        password,
        user_id: user._id,
        role: 'USER',
        doc_model: 'User'
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }

    return res.render('login', { error: null, notice: 'Cuenta creada. Ya puedes iniciar sesión.' });
  } catch (error) {
    if (error.name === 'ValidationError' || error.code === 11000) {
      return res.status(400).render('register', { error: 'Revisa los datos e inténtalo de nuevo.' });
    }
    return next(error);
  }
});

router.post('/login', async function(req, res, next) {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  try {
    const account = await Auth.findOne({ email });
    if (!account || !await bcrypt.compare(password, account.password)) {
      return res.status(401).render('login', { error: 'Correo o contraseña incorrectos.', notice: null });
    }

    res.cookie('auth_id', account._id.toString(), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.redirect(['MEDICO', 'ADMINISTRATOR'].includes(account.role) ? '/dashboard' : '/');
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', function(req, res) {
  res.clearCookie('auth_id');
  res.redirect('/');
});

router.get('/about', function(req, res, next) {
  res.render('about');
});

router.get('/services', function(req, res, next) {
  res.render('services');
});

router.get('/contact', function(req, res, next) {
  res.render('contact');
});

module.exports = router;
