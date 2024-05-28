var utils = require('../utils');
var mongoose = require('mongoose');
var Todo = mongoose.model('Todo');
var User = mongoose.model('User');
// TODO:
var hms = require('humanize-ms');
var ms = require('ms');
var streamBuffers = require('stream-buffers');
var readline = require('readline');
var moment = require('moment');
var exec = require('child_process').exec;
var validator = require('validator');

// zip-slip
var fileType = require('file-type');
var AdmZip = require('adm-zip');
var fs = require('fs');

// prototype-pollution
var _ = require('lodash');

exports.index = function (req, res, next) {
  Todo.
    find({}).
    sort('-updated_at').
    exec(function (err, todos) {
      if (err) return next(err);

      res.render('index', {
        title: 'Patch TODO List',
        subhead: 'Vulnerabilities at their best',
        todos: todos,
      });
    });
};

eexports.loginHandler = function (req, res, next) {
  // Проверка, является ли переданное имя пользователя корректным email
  if (validator.isEmail(req.body.username)) {
    // Поиск пользователя по имени пользователя и паролю
    User.findOne({ username: req.body.username, password: req.body.password }, function (err, user) {
      if (err) {
        // Обработка ошибок, если они возникли во время запроса
        return next(err);
      }

      if (user) {
        // Если пользователь найден, установка необходимых сессионных данных и перенаправление
        const redirectPage = req.body.redirectPage || '/admin';
        req.session.loggedIn = true;
        req.session.username = req.body.username;
        return res.redirect(redirectPage);
      } else {
        // Если пользователь не найден, возвращение кода состояния 401 (непрошедшая аутентификация)
        return res.status(401).send();
      }
    });
  } else {
    // Если переданное имя пользователя не является корректным email, возвращение кода состояния 401
    return res.status(401).send();
  }
};



const allowedDomains = ['localhost:3001']; // Разрешенные домены

function isAllowedDomain(url) {
    try {
        const hostname = new URL(url).host;
        return allowedDomains.includes(hostname);
    } catch (e) {
        return false; // Если парсинг URL не удался, это не валидный URL
    }
}

function adminLoginSuccess(redirectPage, session, username, res) {
    session.loggedIn = 1;

    // Логируем действие входа для аудита
    console.log(`User logged in: ${username}`);

    if (redirectPage && isAllowedDomain(redirectPage)) {
        // Уведомляем пользователя о перенаправлении
        res.send(`
            <html>
                <body>
                    <p>Вы будете перенаправлены на: ${redirectPage}</p>
                    <a href="${redirectPage}">Нажмите здесь, если вы не были перенаправлены автоматически</a>
                    <script>
                        setTimeout(function() {
                            window.location.href = "${redirectPage}";
                        }, 3000); // Задержка в 3 секунды для уведомления пользователя
                    </script>
                </body>
            </html>
        `);
    } else {
        return res.redirect('http://localhost:3001');
    }
}


exports.login = function (req, res, next) {
  return res.render('admin', {
    title: 'Admin Access',
    granted: false,
    redirectPage: req.query.redirectPage
  });
};

exports.admin = function (req, res, next) {
  return res.render('admin', {
    title: 'Admin Access Granted',
    granted: true,
  });
};

exports.get_account_details = function(req, res, next) {
  // @TODO need to add a database call to get the profile from the database
  // and provide it to the view to display
  const profile = {}
 	return res.render('account.hbs', profile)
}

exports.save_account_details = function(req, res, next) {
  // get the profile details from the JSON
	const profile = req.body
  // validate the input
  if (validator.isEmail(profile.email, { allow_display_name: true })
    // allow_display_name allows us to receive input as:
    // Display Name <email-address>
    // which we consider valid too
    && validator.isMobilePhone(profile.phone, 'he-IL')
    && validator.isAscii(profile.firstname)
    && validator.isAscii(profile.lastname)
    && validator.isAscii(profile.country)
  ) {
    // trim any extra spaces on the right of the name
    profile.firstname = validator.rtrim(profile.firstname)
    profile.lastname = validator.rtrim(profile.lastname)

    // render the view
    return res.render('account.hbs', profile)
  } else {
    // if input validation fails, we just render the view as is
    console.log('error in form details')
    return res.render('account.hbs')
  }
}

exports.isLoggedIn = function (req, res, next) {
  if (req.session.loggedIn === 1) {
    return next()
  } else {
    return res.redirect('/')
  }
}

exports.logout = function (req, res, next) {
  req.session.loggedIn = 0
  req.session.destroy(function() { 
    return res.redirect('/')  
  })
}

function parse(todo) {
  var t = todo;

  var remindToken = ' in ';
  var reminder = t.toString().indexOf(remindToken);
  if (reminder > 0) {
    var time = t.slice(reminder + remindToken.length);
    time = time.replace(/\n$/, '');

    var period = hms(time);

    console.log('period: ' + period);

    // remove it
    t = t.slice(0, reminder);
    if (typeof period != 'undefined') {
      t += ' [' + ms(period) + ']';
    }
  }
  return t;
}

exports.create = function (req, res, next) {
  // console.log('req.body: ' + JSON.stringify(req.body));

  var item = req.body.content;
  var imgRegex = /\!\[alt text\]\((http.*)\s\".*/;
  if (typeof (item) == 'string' && item.match(imgRegex)) {
    var url = item.match(imgRegex)[1];
    console.log('found img: ' + url);

    exec('identify ' + url, function (err, stdout, stderr) {
      console.log(err);
      if (err !== null) {
        console.log('Error (' + err + '):' + stderr);
      }
    });

  } else {
    item = parse(item);
  }

  new Todo({
    content: item,
    updated_at: Date.now(),
  }).save(function (err, todo, count) {
    if (err) return next(err);

    /*
    res.setHeader('Data', todo.content.toString('base64'));
    res.redirect('/');
    */

    res.setHeader('Location', '/');
    res.status(302).send(todo.content.toString('base64'));

    // res.redirect('/#' + todo.content.toString('base64'));
  });
};

exports.destroy = function (req, res, next) {
  // Проверяем, является ли ID корректным ObjectId MongoDB
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send('Invalid ID');
  }

  // Поиск задачи по ID
  Todo.findById(req.params.id, function (err, todo) {
    if (err) {
      // Обработка ошибок, если они возникли во время запроса
      return next(err);
    }

    if (!todo) {
      // Если задача не найдена, возвращаем код состояния 404 (не найдено)
      return res.status(404).send('Task not found');
    }

    // Удаление задачи
    todo.remove(function (err, removedTodo) {
      if (err) {
        // Обработка ошибок, если они возникли при удалении
        return next(err);
      }

      // Если задача успешно удалена, перенаправляем на главную страницу
      res.redirect('/');
    });
  });
};


exports.edit = function (req, res, next) {
  Todo.
    find({}).
    sort('-updated_at').
    exec(function (err, todos) {
      if (err) return next(err);

      res.render('edit', {
        title: 'TODO',
        todos: todos,
        current: req.params.id
      });
    });
};

exports.update = function (req, res, next) {
  // Проверяем, является ли ID корректным ObjectId MongoDB
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).send('Invalid ID');
  }

  // Поиск задачи по ID
  Todo.findById(req.params.id, function (err, todo) {
    if (err) {
      // Обработка ошибок, если они возникли во время запроса
      return next(err);
    }

    if (!todo) {
      // Если задача не найдена, возвращаем код состояния 404 (не найдено)
      return res.status(404).send('Task not found');
    }

    // Обновление содержимого задачи и времени обновления
    todo.content = req.body.content;
    todo.updated_at = Date.now();

    // Сохранение обновленной задачи
    todo.save(function (err, updatedTodo) {
      if (err) {
        // Обработка ошибок, если они возникли при сохранении
        return next(err);
      }

      // Если задача успешно обновлена, перенаправляем на главную страницу
      res.redirect('/');
    });
  });
};


// ** express turns the cookie key to lowercase **
exports.current_user = function (req, res, next) {

  next();
};

function isBlank(str) {
  return (!str || /^\s*$/.test(str));
}

exports.import = function (req, res, next) {
  if (!req.files) {
    res.send('No files were uploaded.');
    return;
  }

  var importFile = req.files.importFile;
  var data;
  var importedFileType = fileType(importFile.data);
  var zipFileExt = { ext: "zip", mime: "application/zip" };
  if (importedFileType === null) {
    importedFileType = { ext: "txt", mime: "text/plain" };
  }
  if (importedFileType["mime"] === zipFileExt["mime"]) {
    var zip = AdmZip(importFile.data);
    var extracted_path = "/tmp/extracted_files";
    zip.extractAllTo(extracted_path, true);
    data = "No backup.txt file found";
    fs.readFile('backup.txt', 'ascii', function (err, data) {
      if (!err) {
        data = data;
      }
    });
  } else {
    data = importFile.data.toString('ascii');
  }
  var lines = data.split('\n');
  lines.forEach(function (line) {
    var parts = line.split(',');
    var what = parts[0];
    console.log('importing ' + what);
    var when = parts[1];
    var locale = parts[2];
    var format = parts[3];
    var item = what;
    if (!isBlank(what)) {
      if (!isBlank(when) && !isBlank(locale) && !isBlank(format)) {
        console.log('setting locale ' + parts[1]);
        moment.locale(locale);
        var d = moment(when);
        console.log('formatting ' + d);
        item += ' [' + d.format(format) + ']';
      }

      new Todo({
        content: item,
        updated_at: Date.now(),
      }).save(function (err, todo, count) {
        if (err) return next(err);
        console.log('added ' + todo);
      });
    }
  });

  res.redirect('/');
};

exports.about_new = function (req, res, next) {
  console.log(JSON.stringify(req.query));
  return res.render("about_new.dust",
    {
      title: 'Patch TODO List',
      subhead: 'Vulnerabilities at their best',
      device: req.query.device
    });
};

// Prototype Pollution

///////////////////////////////////////////////////////////////////////////////
// In order of simplicity we are not using any database. But you can write the
// same logic using MongoDB.
const users = [
  // You know password for the user.
  { name: 'user', password: 'pwd' },
  // You don't know password for the admin.
  { name: 'admin', password: Math.random().toString(32), canDelete: true },
];

let messages = [];
let lastId = 1;

function findUser(auth) {
  return users.find((u) =>
    u.name === auth.name &&
    u.password === auth.password);
}
///////////////////////////////////////////////////////////////////////////////

exports.chat = {
  get(req, res) {
    res.send(messages);
  },
  add(req, res) {
    const user = findUser(req.body.auth || {});

    if (!user) {
      res.status(403).send({ ok: false, error: 'Access denied' });
      return;
    }

    const message = {
      // Default message icon. Cen be overwritten by user.
      icon: '👋',
    };

    _.merge(message, req.body.message, {
      id: lastId++,
      timestamp: Date.now(),
      userName: user.name,
    });

    messages.push(message);
    res.send({ ok: true });
  },
  delete(req, res) {
    const user = findUser(req.body.auth || {});

    if (!user || !user.canDelete) {
      res.status(403).send({ ok: false, error: 'Access denied' });
      return;
    }

    messages = messages.filter((m) => m.id !== req.body.messageId);
    res.send({ ok: true });
  }
};
