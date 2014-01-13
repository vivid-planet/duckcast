var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)
  , fs = require('fs')
  , _ = require('underscore')
  , _s = require('underscore.string')
  , url = require('url')
  , messenger = require('messenger')
  , os = require('os')
  , request = require('request');

  _.mixin(_s.exports());

var config = fs.readFileSync('./settings.json', 'utf8');
config = JSON.parse(config);

var messageServer = messenger.createListener(config.messengerPortOne)
    , messageClient = messenger.createSpeaker(config.messengerPortTwo);

app.configure(function(){
    app.set('view engine', 'ejs');
    app.engine('ejs', require('ejs').__express);
    app.use(express.favicon());
    app.use(express.compress());
    app.use('/css', express.static(__dirname+'/assets/css/stylesheets'));
    app.use('/js', express.static(__dirname+'/assets/js'));
    app.use('/images', express.static(__dirname+'/assets/media/images'));
    app.use(express.cookieParser());
    app.use(express.bodyParser({ keepExtensions: true, uploadDir: __dirname+'/temp' }));
})

io.configure(function(){
  io.set('log level', 1);
})

io.sockets.on('connection', function (socket) {

    socket.emit('welcome', config);

    messageClient.request('fetchDevices', {}, function(data){
        socket.emit('duckcasts:create', data.devices);
    })

    socket.on('fetchDevices', function(res){
        messageClient.request('fetchDevices', {}, function(data){
            res(null, data);
        })
    })
    socket.on('restartProcess', function(data){
        switch(data.service) {
            case "proxy":
                io.sockets.emit('duckcasts:cleanup', {});
                setTimeout(function(){
                    messageClient.shout('restart');
                }, 500)
            break;
            case "manager":
                process.kill(process.pid, 'SIGHUP');
            break;
        }
    })

    socket.on('manageDevice', function(data){
        messageClient.shout('manageDevice', data);
    })

    socket.on('updateStylesheets', function(){
        messageClient.shout('updateStylesheets');
    })

})

server.listen(config.managerPort);

messageServer.on('devices', function(m, message){
    switch(message.type) {
        case "create":
            io.sockets.emit('duckcasts:create', message.data);
        break;
        case "delete":
            io.sockets.emit(message.socketUri, message.data);
        break;
    }
})

messageServer.on('lastRequest', function(m, message){
    io.sockets.emit('lastRequest', message);
})

messageServer.on('log', function(m, message){
    io.sockets.emit('log', message);
})

app.get('/', function(req, res){
    res.render(__dirname+'/assets/views/manager.ejs', {content: config})
})

app.post('/setSite', function(req, res){
    var urlObject = url.parse(req.body.url);
    config.site = urlObject.protocol+'//'+urlObject.hostname;
    config.lastRequest = req.body.url;
    fs.writeFile('./settings.json', JSON.stringify(config), function(err){
         if(!err) {
                messageClient.shout('changedSettings', config);
                res.send('Site settings changed');
         } else {
             res.send(err.toString());
         }
    })
})

app.post('/setPorts', function(req, res){
    var restartManager = false;
    if(config.managerPort !== req.body.managerPort) {
      restartManager = true;
    }
    _.extend(config, req.body);
    fs.writeFile('./settings.json', JSON.stringify(config), function(err){
         if(!err) {
                messageClient.shout('changedPort', config);
                res.send('Site settings changed');
                if(restartManager) {
                  process.exit(1);
                }
         } else {
             res.send(err.toString());
         }
    })
})


process.on('uncaughtException', function (err) {
  console.error(err);
  if(err.code !== "ECONNRESET" && err.code !== 'ENOTFOUND' && err.code !== 'ESOCKETTIMEDOUT'){
    process.exit(1)
  }

  if(err.code === 'ECONNRESET') {
    io.sockets.emit('log', err.toString());
  }

  if(err.code === 'ENOTFOUND') {
    io.sockets.emit('log', 'ERROR: Not found (address not found)');
  }

  if(err.code === 'ESOCKETTIMEDOUT') {
    io.sockets.emit('log', 'ERROR: Socket timeout');
  }
})
