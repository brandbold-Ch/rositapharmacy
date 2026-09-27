var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var crypto = require('crypto');
require('dotenv').config();
var { Auth } = require('./backend/models/authModel');
var { User } = require('./backend/models/userModel');

require('./backend/db/db');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var portalRouter = require('./routes/portal');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(async function(req, res, next) {
  res.locals.currentAccount = null;
  res.locals.isAuthenticated = false;
  const authId = req.signedCookies.auth_id;
  if (!authId) return next();

  try {
    const account = await Auth.findById(authId).lean();
    if (account) {
      const profile = account.doc_model === 'User' ? await User.findById(account.user_id).lean() : null;
      res.locals.currentAccount = {
        email: account.email,
        role: account.role,
        name: profile ? `${profile.name} ${profile.lastname}` : account.email
      };
      req.account = res.locals.currentAccount;
      res.locals.isAuthenticated = true;
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

app.use('/', indexRouter);
app.use('/', portalRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  var status = err.status || 500;
  res.locals.message = err.message;
  res.locals.error = { status: status };

  res.status(status).render('error', function(renderError, html) {
    if (renderError) {
      console.error('Could not render error.ejs:', renderError.message);
      if (!res.headersSent) {
        res.type('text/plain').send(status >= 500 ? 'Internal Server Error' : res.locals.message);
      }
      return;
    }
    res.send(html);
  });
});

module.exports = app;
