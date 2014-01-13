var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)
  , fs = require('fs')
  , _ = require('underscore')
  , _s = require('underscore.string')
  , url = require('url')
  , os = require('os')
  , messenger = require('messenger')
  , request = require('request');

var logFile = fs.openSync('./duckLog.log','a');

_.mixin(_s.exports());

var config = fs.readFileSync('./settings.json', 'utf8');
config = JSON.parse(config);

var messageClient = messenger.createSpeaker(config.messengerPortOne)
  , messageServer = messenger.createListener(config.messengerPortTwo);

config.domain = os.hostname();

app.setMaxListeners(1000);
server.setMaxListeners(1000);
server.listen(config.proxyPort);

app.configure(function(){
    app.use(express.favicon());
    app.use(express.compress());
    app.set('view engine', 'ejs');
    app.engine('ejs', require('ejs').__express);
    app.use('/duckscripts', express.static(__dirname+'/assets/js'));
    app.use(express.cookieParser());
    app.use(express.bodyParser({ keepExtensions: true, uploadDir: __dirname+'/temp' }));
})

var duckScript = fs.readFileSync('./script.txt', 'utf8');


function getDeviceTitle(userAgent) {
    var deviceType = null;

    if(/windows/i.test(userAgent)) {
        deviceType = {type: 'pc', title: 'PC (Windows)'};
    }
    if(/windows phone/i.test(userAgent)) {
        deviceType = {type: 'windowsphone', title: 'Windows Phone'};
    }
    if(/android/i.test(userAgent)) {
        deviceType = {type: 'android', title: 'Android Device'};
    }
    if(/ipad/i.test(userAgent)) {
        deviceType = {type: 'ipad', title: 'Apple Ipad'};
    }
    if(/iphone/i.test(userAgent)) {
        deviceType = {type: 'iphone', title: 'Apple Iphone'};
    }
    if(/ipod/i.test(userAgent)) {
        deviceType = {type: 'ipod', title: 'Apple Ipod'};
    }
    if(/blackberry/i.test(userAgent)) {
        deviceType = {type: 'blackberry', title: 'Blackberry'};
    }
    if(/macintosh/i.test(userAgent)) {
        deviceType = {type: 'mac', title: 'Mac'};
    }

    return deviceType;
}

io.configure(function(){
  io.set('log level', 1);
})

io.sockets.on('connection', function (socket) {

    socket.emit('welcome', {id: socket.id, site: config.site, port: config.proxyPort});

    socket.on('manipulateFrame', function(req){
        socket.broadcast.emit('manipulate', req);
    })

    socket.on('navigateWindow', function(data){
        setTimeout(function(){
            io.sockets.emit('navigate', data);
        }, 800)

    })


    var connectType = getDeviceTitle(socket.handshake.headers['user-agent']);
    if(connectType && connectType !== null) {
        _.extend(connectType, {id: socket.id});
        messageClient.shout('devices', {type: 'create', data: connectType});
    }

    socket.on('disconnect', function(){
        messageClient.shout('devices', {
          type: 'delete'
          , socketUri: 'duckcast/'+socket.id+':delete'
          , data:{
              connected: false
            , id: socket.id
          }
        });
    })

    socket.on('stylesheetQuery', function(data){
        var styleSheetList = _.map(data, function(doc){
           return url.parse(doc);
        })
        styleSheetList = _.filter(styleSheetList, function(stylesheet){
            return stylesheet.host === null;
        })
        io.sockets.emit('changeStylesheet', styleSheetList);
    })
})

function watcherUpdate(args) {
  if(args.cacheType) {
    io.sockets.emit('log', 'BROADCAST WATCHER UPDATE: Server-Stylesheet updated');
    io.sockets.emit('getStylesheet');
  }
}

app.get('/*', function(req, res, next){

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    messageClient.shout('log', ip+': '+req.path);

    if(req.path && req.path === '/watcher') {
      watcherUpdate(req.query);
      res.send(200);
    } else {

    if(!req.path || req.path === '/') {

        var p = config.lastRequest ? config.lastRequest : config.site;

        res.redirect('/'+p);

    } else if(!_(req.path).startsWith('/http')) {

        request(config.site+req.path).pipe(res);

    } else if(_(req.path).startsWith('/http')) {

        var path = _(req.url).strRight('/');

        var parseUrl = url.parse(path);
        var activeUrl = url.parse(config.site);

        if(parseUrl.hostname !== activeUrl.hostname) {
          if(config.lastRequest && config.lastRequest !== null) {
            return res.redirect('/'+config.lastRequest);
          } else {
            return res.redirect('/');
          }
        }

        config.lastRequest = path;

        messageClient.shout('lastRequest', path);

        var toWrite = _.omit(config, 'domain');
        fs.writeFile('./settings.json', JSON.stringify(toWrite), function(err){
            if(err){
                fs.write(logFile, new Date()+"LOCATION: proxy.js | "+err.toString()+"\n");
            }
        })

        request(path, function(error, response, body){
            var cleanHtml = !error ? response.body : null;
            if(!cleanHtml || !cleanHtml.match('<head>')) {
              res.render(__dirname+'/assets/views/backupSite.ejs', {message: error ? error : response.body }, function(err, html){
                res.status((response && _.has(response, 'statusCode')) ? response.statusCode : 404).send(html);
              });
            } else {
              var cc = cleanHtml.replace('<head>', duckScript);
              res.status(response.statusCode).send(cc);
            }
        })
    }
  }
})

app.post('/*', function(req, res){
    request.post(config.site+req.path).pipe(res);
})

messageServer.on('fetchDevices', function(m, data){
    var obj = [];
    var connectedDevices = _.map(io.handshaken, function(connected, id){
        var type = getDeviceTitle(connected.headers['user-agent']);
        _.extend(type, {id: id});
        obj.push(type);
        return obj;
    })
    m.reply({devices: _.flatten(connectedDevices)});
})

messageServer.on('changedPort', function(m, data){
  io.sockets.emit('changedPort', data);
  setTimeout(function(){
     process.kill(process.pid,'SIGHUP');
  }, 10000);
})

messageServer.on('changedSettings', function(m, data){
   config = null;
   config = data;
   config.domain = os.hostname();

   fs.write(logFile, new Date()+"LOCATION: proxy.js | Settings changed "+JSON.stringify(config)+"\n");
   io.sockets.emit('changedSettings', config);
})

messageServer.on('manageDevice', function(m, data){
  io.sockets.socket(data.id).emit('manage', data);
})

messageServer.on('restart', function(){
  io.sockets.emit('log', 'BROADCAST: Manager System is going to restart in 10 seconds on port '+config.mangerPort);
  fs.write(logFile, new Date()+"LOCATION: proxy.js | Received SIGHUP on line 202\n");
  setTimeout(function(){
     process.kill(process.pid,'SIGHUP');
  }, 10000);
})

messageServer.on('updateStylesheets', function() {
  io.sockets.emit('log', 'BROADCAST: Stylesheet updated');
  io.sockets.emit('getStylesheet');
})

process.on('uncaughtException', function (err) {
  fs.write(logFile, new Date()+"LOCATION: proxy.js | Uncaught Exception:"+err.message.toString()+"\n");
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
    io.sockets.emit('log', 'ERROR: Timeout on request url, 30 seconds no response');
  }
})


